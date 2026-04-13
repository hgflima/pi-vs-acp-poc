import { spawn, type ChildProcess } from "node:child_process"
import { PROJECT_HOME } from "../lib/project-home"
import { Readable, Writable } from "node:stream"
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionModeState,
  type ElicitationRequest,
  type ElicitationResponse,
  type ElicitationSchema,
} from "@agentclientprotocol/sdk"
import type { RuntimeEvent } from "./runtime"
import {
  requestPermission as bridgeRequestPermission,
  requestElicitation as bridgeRequestElicitation,
  checkAllowAlwaysCache,
  cacheAllowAlways,
  clearAllowAlwaysCache,
} from "./permission-bridge"

const ELICITATION_METHOD = "session/elicitation"

export interface AcpAgentSpec {
  command: string
  args?: string[]
  env?: Record<string, string>
}

const MAX_RESULT_LENGTH = 10240
const STALL_TIMEOUT_MS = 60_000
const SIGKILL_GRACE_MS = 2_000

function truncate(s: string): string {
  return s.length > MAX_RESULT_LENGTH
    ? s.slice(0, MAX_RESULT_LENGTH) + "\n\n... (output truncated)"
    : s
}

function stringify(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return truncate(value)
  try {
    return truncate(JSON.stringify(value))
  } catch {
    return ""
  }
}

function toolContentToText(content: unknown): string {
  if (!Array.isArray(content)) return stringify(content)
  const parts: string[] = []
  for (const item of content as Array<Record<string, unknown>>) {
    if (!item || typeof item !== "object") continue
    const type = item.type
    if (type === "content") {
      const c = item.content as { type?: string; text?: string } | undefined
      if (c?.type === "text" && typeof c.text === "string") {
        parts.push(c.text)
      }
    } else if (type === "diff") {
      parts.push(stringify(item))
    } else if (type === "terminal") {
      parts.push(stringify(item))
    }
  }
  return truncate(parts.join("\n"))
}

type AcpSessionUpdate = SessionNotification["update"]

function mapSessionUpdate(update: AcpSessionUpdate): RuntimeEvent | null {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const c = update.content
      if (c.type === "text") return { type: "text_delta", delta: c.text }
      return null
    }
    case "agent_thought_chunk": {
      const c = update.content
      if (c.type === "text") return { type: "thinking_delta", delta: c.text }
      return null
    }
    case "tool_call": {
      return {
        type: "tool_start",
        id: update.toolCallId,
        tool: update.title ?? update.kind ?? "tool",
        params: update.rawInput ?? {},
      }
    }
    case "tool_call_update": {
      const status = update.status
      const text = update.content ? toolContentToText(update.content) : stringify(update.rawOutput)
      if (status === "failed") {
        return { type: "tool_end", id: update.toolCallId, result: text, status: "error" }
      }
      if (status === "completed") {
        return { type: "tool_end", id: update.toolCallId, result: text, status: "done" }
      }
      return { type: "tool_update", id: update.toolCallId, data: text }
    }
    case "available_commands_update": {
      const cmds = (update as unknown as { availableCommands: Array<{ name: string; description?: string }> }).availableCommands
      return {
        type: "available_commands",
        commands: cmds.map((cmd) => ({
          name: cmd.name,
          description: cmd.description,
          source: "acp" as const,
          type: "command" as const,
        })),
      }
    }
    default:
      return null
  }
}

function isCurrentModeUpdate(
  update: AcpSessionUpdate,
): update is AcpSessionUpdate & { sessionUpdate: "current_mode_update"; currentModeId: string } {
  return update.sessionUpdate === "current_mode_update"
}

export class AcpSession {
  private proc: ChildProcess | null = null
  private connection: ClientSideConnection | null = null
  private sessionId: string | null = null
  private closed = false
  private _isDead = false
  private deadReason: string | null = null

  private currentQueue: RuntimeEvent[] | null = null
  private notifyFn: (() => void) | null = null
  private currentStallTimer: NodeJS.Timeout | null = null
  private currentAbortSignal: AbortSignal | null = null

  private modeState: SessionModeState | null = null
  private initialModeEmitted = false

  private readonly client: Client = {
    sessionUpdate: async (params: SessionNotification): Promise<void> => {
      this.resetStallTimer()
      if (!this.currentQueue) return
      const update = params.update
      if (isCurrentModeUpdate(update)) {
        if (this.modeState) {
          this.modeState = {
            ...this.modeState,
            currentModeId: update.currentModeId,
          }
        }
        if (this.modeState) {
          this.currentQueue.push({
            type: "session_mode_state",
            availableModes: this.modeState.availableModes,
            currentModeId: this.modeState.currentModeId,
          })
          this.wake()
        }
        return
      }
      const ev = mapSessionUpdate(update)
      if (!ev) return
      this.currentQueue.push(ev)
      this.wake()
    },
    requestPermission: async (
      params: RequestPermissionRequest,
    ): Promise<RequestPermissionResponse> => {
      const toolCallId = params.toolCall.toolCallId
      const options = params.options
      const toolKey = params.toolCall.title ?? params.toolCall.kind ?? null
      const sessionKey = this.sessionId
      if (toolKey && sessionKey && checkAllowAlwaysCache(sessionKey, toolKey)) {
        const allowOption =
          options.find((o) => o.kind === "allow_always") ??
          options.find((o) => o.kind === "allow_once")
        if (allowOption) {
          return {
            outcome: { outcome: "selected", optionId: allowOption.optionId },
          }
        }
      }
      try {
        const outcome = await bridgeRequestPermission(
          toolCallId,
          options,
          this.currentAbortSignal ?? undefined,
          (pendingId) => {
            if (this.currentQueue) {
              this.currentQueue.push({
                type: "permission_request",
                id: pendingId,
                toolCallId,
                options,
              })
              this.wake()
            }
          },
        )
        if (
          outcome.outcome === "selected" &&
          toolKey &&
          sessionKey
        ) {
          const picked = options.find((o) => o.optionId === outcome.optionId)
          if (picked?.kind === "allow_always") {
            cacheAllowAlways(sessionKey, toolKey)
          }
        }
        return { outcome }
      } catch {
        return { outcome: { outcome: "cancelled" } }
      }
    },
    extMethod: async (
      method: string,
      params: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      if (method === ELICITATION_METHOD) {
        const req = params as unknown as ElicitationRequest
        const message = req.message
        const schema =
          req.mode === "form"
            ? (req.requestedSchema as ElicitationSchema)
            : ({ type: "object" } as ElicitationSchema)
        try {
          const response = await bridgeRequestElicitation(
            message,
            schema,
            this.currentAbortSignal ?? undefined,
            (pendingId) => {
              if (this.currentQueue) {
                this.currentQueue.push({
                  type: "elicitation_request",
                  id: pendingId,
                  message,
                  requestedSchema: schema,
                })
                this.wake()
              }
            },
          )
          return response as unknown as Record<string, unknown>
        } catch {
          const cancelled: ElicitationResponse = {
            action: { action: "cancel" },
          }
          return cancelled as unknown as Record<string, unknown>
        }
      }
      throw new Error(`unsupported ext method: ${method}`)
    },
  }

  get isDead(): boolean {
    return this._isDead
  }

  getModeState(): SessionModeState | null {
    return this.modeState
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.connection || !this.sessionId) {
      throw new Error("session not initialized")
    }
    await this.connection.setSessionMode({
      sessionId: this.sessionId,
      modeId,
    })
    if (this.modeState) {
      this.modeState = { ...this.modeState, currentModeId: modeId }
    }
  }

  async init(agent: AcpAgentSpec): Promise<void> {
    try {
      this.proc = spawn(agent.command, agent.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...(agent.env ?? {}) },
        cwd: PROJECT_HOME,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`failed to spawn ${agent.command}: ${message}`)
    }

    this.proc.on("error", (err) => {
      this.markDead(`subprocess error: ${err.message}`)
    })
    this.proc.on("exit", (code, signal) => {
      if (!this.closed) {
        this.markDead(
          `subprocess exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        )
      }
    })
    this.proc.stderr?.on("data", (chunk) => {
      process.stderr.write(`[acp:${agent.command}] ${chunk}`)
    })

    const writable = Writable.toWeb(this.proc.stdin!) as WritableStream<Uint8Array>
    const readable = Readable.toWeb(this.proc.stdout!) as ReadableStream<Uint8Array>
    const stream = ndJsonStream(writable, readable)
    this.connection = new ClientSideConnection(() => this.client, stream)

    await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        elicitation: { form: {} },
      },
    })
    const sessionResp = await this.connection.newSession({
      cwd: PROJECT_HOME,
      mcpServers: [],
    })
    this.sessionId = sessionResp.sessionId
    if (sessionResp.modes) {
      this.modeState = sessionResp.modes
    }
  }

  async *prompt(
    message: string,
    signal: AbortSignal,
  ): AsyncIterable<RuntimeEvent> {
    if (this._isDead) {
      yield { type: "error", message: this.deadReason ?? "session terminated" }
      yield { type: "done" }
      return
    }
    if (!this.connection || !this.sessionId) {
      yield { type: "error", message: "session not initialized" }
      yield { type: "done" }
      return
    }
    if (signal.aborted) {
      yield { type: "done" }
      return
    }

    this.currentQueue = []
    this.notifyFn = null
    this.currentAbortSignal = signal

    if (this.modeState && !this.initialModeEmitted) {
      this.currentQueue.push({
        type: "session_mode_state",
        availableModes: this.modeState.availableModes,
        currentModeId: this.modeState.currentModeId,
      })
      this.initialModeEmitted = true
    }

    const onAbort = () => {
      if (this.connection && this.sessionId) {
        void this.connection
          .cancel({ sessionId: this.sessionId })
          .catch(() => {
            /* fire-and-forget */
          })
      }
    }
    signal.addEventListener("abort", onAbort, { once: true })

    this.resetStallTimer()

    const connection = this.connection
    const sessionId = this.sessionId
    const runPromise = connection
      .prompt({
        sessionId,
        prompt: [{ type: "text", text: message }],
      })
      .then(() => {
        if (!this.currentQueue) return
        this.currentQueue.push({ type: "done" })
        this.wake()
      })
      .catch((err: unknown) => {
        if (!this.currentQueue) return
        const msg = err instanceof Error ? err.message : String(err)
        this.currentQueue.push({ type: "error", message: msg })
        this.currentQueue.push({ type: "done" })
        this.wake()
      })

    try {
      while (true) {
        while (this.currentQueue && this.currentQueue.length > 0) {
          const ev = this.currentQueue.shift()!
          yield ev
          if (ev.type === "done") return
        }
        if (this._isDead) {
          yield { type: "error", message: this.deadReason ?? "session terminated" }
          yield { type: "done" }
          return
        }
        await new Promise<void>((resolve) => {
          this.notifyFn = resolve
        })
      }
    } finally {
      signal.removeEventListener("abort", onAbort)
      if (this.currentStallTimer) {
        clearTimeout(this.currentStallTimer)
        this.currentStallTimer = null
      }
      this.currentQueue = null
      this.notifyFn = null
      this.currentAbortSignal = null
      await runPromise.catch(() => {
        /* settled */
      })
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.currentStallTimer) {
      clearTimeout(this.currentStallTimer)
      this.currentStallTimer = null
    }
    if (this.sessionId) {
      clearAllowAlwaysCache(this.sessionId)
    }
    await this.killCascade()
  }

  private async killCascade(): Promise<void> {
    const proc = this.proc
    if (!proc) return
    const alreadyDead = proc.exitCode !== null || proc.signalCode !== null
    if (alreadyDead) return
    try {
      proc.kill("SIGTERM")
    } catch {
      /* ignore */
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          try {
            proc.kill("SIGKILL")
          } catch {
            /* ignore */
          }
        }
        resolve()
      }, SIGKILL_GRACE_MS)
      proc.once("exit", () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  private resetStallTimer(): void {
    if (this.currentStallTimer) {
      clearTimeout(this.currentStallTimer)
      this.currentStallTimer = null
    }
    if (!this.currentQueue) return
    this.currentStallTimer = setTimeout(() => {
      this.handleStall()
    }, STALL_TIMEOUT_MS)
  }

  private handleStall(): void {
    if (!this.currentQueue) return
    this.currentQueue.push({
      type: "error",
      message: "agent stalled (no update in 60s)",
    })
    this.currentQueue.push({ type: "done" })
    this.wake()
    if (this.connection && this.sessionId) {
      void this.connection
        .cancel({ sessionId: this.sessionId })
        .catch(() => {
          /* fire-and-forget */
        })
    }
  }

  private wake(): void {
    if (this.notifyFn) {
      const n = this.notifyFn
      this.notifyFn = null
      n()
    }
  }

  private markDead(reason: string): void {
    if (this._isDead) return
    this._isDead = true
    this.deadReason = reason
    this.wake()
  }
}
