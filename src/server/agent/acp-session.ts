import { spawn, type ChildProcess } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable, Writable } from "node:stream"
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk"
import type { RuntimeEvent } from "./runtime"
import type { AcpAgentSpec } from "./acp-runtime"

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
    default:
      return null
  }
}

export class AcpSession {
  private proc: ChildProcess | null = null
  private connection: ClientSideConnection | null = null
  private sessionId: string | null = null
  private tempDir: string | null = null
  private closed = false
  private _isDead = false
  private deadReason: string | null = null

  private currentQueue: RuntimeEvent[] | null = null
  private notifyFn: (() => void) | null = null
  private currentStallTimer: NodeJS.Timeout | null = null

  private readonly client: Client = {
    sessionUpdate: async (params: SessionNotification): Promise<void> => {
      this.resetStallTimer()
      if (!this.currentQueue) return
      const ev = mapSessionUpdate(params.update)
      if (!ev) return
      this.currentQueue.push(ev)
      this.wake()
    },
    requestPermission: async (
      params: RequestPermissionRequest,
    ): Promise<RequestPermissionResponse> => {
      const first = params.options?.[0]
      if (first) {
        return { outcome: { outcome: "selected", optionId: first.optionId } }
      }
      return { outcome: { outcome: "cancelled" } }
    },
  }

  get isDead(): boolean {
    return this._isDead
  }

  async init(agent: AcpAgentSpec): Promise<void> {
    this.tempDir = mkdtempSync(path.join(tmpdir(), "pi-ai-poc-acp-"))
    try {
      this.proc = spawn(agent.command, agent.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...(agent.env ?? {}) },
        cwd: this.tempDir,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.cleanupTempDir()
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

    await this.connection.initialize({ protocolVersion: PROTOCOL_VERSION })
    const sessionResp = await this.connection.newSession({
      cwd: this.tempDir,
      mcpServers: [],
    })
    this.sessionId = sessionResp.sessionId
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
    await this.killCascade()
    this.cleanupTempDir()
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

  private cleanupTempDir(): void {
    if (!this.tempDir) return
    try {
      rmSync(this.tempDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    this.tempDir = null
  }
}
