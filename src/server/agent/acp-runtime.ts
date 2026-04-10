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
import type { Runtime, RuntimeEvent, RuntimePromptOptions } from "./runtime"
import type { AgentMessage } from "@mariozechner/pi-agent-core"

export interface AcpAgentSpec {
  command: string
  args?: string[]
  env?: Record<string, string>
}

interface AcpRuntimeOptions {
  agent: AcpAgentSpec
}

const MAX_RESULT_LENGTH = 10240
const STALL_TIMEOUT_MS = 60_000
const HARD_TIMEOUT_MS = 300_000
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

// Extract a displayable text string from ToolCall content array
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

function extractMessageText(message: AgentMessage): string {
  const m = message as unknown as { role?: string; content?: unknown }
  if (typeof m.content === "string") return m.content
  if (Array.isArray(m.content)) {
    const parts: string[] = []
    for (const c of m.content as Array<Record<string, unknown>>) {
      if (!c || typeof c !== "object") continue
      if (c.type === "text" && typeof c.text === "string") parts.push(c.text)
    }
    return parts.join("")
  }
  return ""
}

export class AcpRuntime implements Runtime {
  constructor(private readonly opts: AcpRuntimeOptions) {}

  async *prompt(opts: RuntimePromptOptions): AsyncIterable<RuntimeEvent> {
    const { agent } = this.opts
    const tempDir = mkdtempSync(path.join(tmpdir(), "pi-ai-poc-acp-"))
    let proc: ChildProcess | null = null
    let killed = false
    let stallTimer: NodeJS.Timeout | null = null
    let hardTimer: NodeJS.Timeout | null = null

    const queue: RuntimeEvent[] = []
    let notify: (() => void) | null = null
    let finished = false

    const wake = () => {
      if (notify) {
        const n = notify
        notify = null
        n()
      }
    }
    const push = (ev: RuntimeEvent) => {
      queue.push(ev)
      wake()
    }

    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        push({ type: "error", message: "agent stalled (no update in 60s)" })
        killCascade()
      }, STALL_TIMEOUT_MS)
    }

    const killCascade = () => {
      if (killed) return
      killed = true
      if (stallTimer) clearTimeout(stallTimer)
      if (hardTimer) clearTimeout(hardTimer)
      if (proc && !proc.killed) {
        try {
          proc.kill("SIGTERM")
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          if (proc && !proc.killed) {
            try {
              proc.kill("SIGKILL")
            } catch {
              /* ignore */
            }
          }
        }, SIGKILL_GRACE_MS)
      }
      push({ type: "done" })
      finished = true
    }

    // Build Client that pushes session/updates into the queue
    const client: Client = {
      async sessionUpdate(params: SessionNotification): Promise<void> {
        resetStallTimer()
        const update = params.update
        switch (update.sessionUpdate) {
          case "agent_message_chunk": {
            const c = update.content
            if (c.type === "text") {
              push({ type: "text_delta", delta: c.text })
            }
            return
          }
          case "agent_thought_chunk": {
            const c = update.content
            if (c.type === "text") {
              push({ type: "thinking_delta", delta: c.text })
            }
            return
          }
          case "tool_call": {
            push({
              type: "tool_start",
              id: update.toolCallId,
              tool: update.title ?? update.kind ?? "tool",
              params: update.rawInput ?? {},
            })
            return
          }
          case "tool_call_update": {
            const status = update.status
            if (status === "failed") {
              push({
                type: "tool_end",
                id: update.toolCallId,
                result: update.content ? toolContentToText(update.content) : stringify(update.rawOutput),
                status: "error",
              })
            } else if (status === "completed") {
              push({
                type: "tool_end",
                id: update.toolCallId,
                result: update.content ? toolContentToText(update.content) : stringify(update.rawOutput),
                status: "done",
              })
            } else {
              push({
                type: "tool_update",
                id: update.toolCallId,
                data: update.content ? toolContentToText(update.content) : stringify(update.rawOutput),
              })
            }
            return
          }
          case "user_message_chunk":
          case "plan":
          case "available_commands_update":
          case "current_mode_update":
          case "config_option_update":
          case "session_info_update":
          case "usage_update":
            // POC: drop (debug log optional)
            return
        }
      },
      async requestPermission(_params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
        // POC: auto-approve (select first option if any, else cancel)
        const first = _params.options?.[0]
        if (first) {
          return {
            outcome: { outcome: "selected", optionId: first.optionId },
          }
        }
        return { outcome: { outcome: "cancelled" } }
      },
    }

    // Spawn subprocess
    try {
      proc = spawn(agent.command, agent.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...(agent.env ?? {}) },
        cwd: tempDir,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      rmSync(tempDir, { recursive: true, force: true })
      yield { type: "error", message: `failed to spawn ${agent.command}: ${message}` }
      yield { type: "done" }
      return
    }

    proc.on("error", (err) => {
      push({ type: "error", message: `subprocess error: ${err.message}` })
      finished = true
      wake()
    })
    proc.on("exit", (code, signal) => {
      if (!finished && code !== 0 && !killed) {
        push({
          type: "error",
          message: `subprocess exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        })
      }
      finished = true
      wake()
    })
    proc.stderr?.on("data", (chunk) => {
      process.stderr.write(`[acp:${agent.command}] ${chunk}`)
    })

    // Convert Node streams to Web Streams for ndJsonStream
    // proc.stdin: Node Writable → web WritableStream (we write TO it)
    // proc.stdout: Node Readable → web ReadableStream (we read FROM it)
    const writable = Writable.toWeb(proc.stdin!) as WritableStream<Uint8Array>
    const readable = Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>
    const stream = ndJsonStream(writable, readable)
    const connection = new ClientSideConnection(() => client, stream)

    // Set up timers
    resetStallTimer()
    hardTimer = setTimeout(() => {
      push({ type: "error", message: "agent timeout (5min hard cap)" })
      killCascade()
    }, HARD_TIMEOUT_MS)

    // Wire user abort
    const onAbort = () => {
      killCascade()
    }
    if (opts.signal.aborted) {
      onAbort()
    } else {
      opts.signal.addEventListener("abort", onAbort, { once: true })
    }

    // Run the ACP dance
    const run = async (): Promise<void> => {
      try {
        await connection.initialize({ protocolVersion: PROTOCOL_VERSION })
        const sessionResp = await connection.newSession({
          cwd: tempDir,
          mcpServers: [],
        })
        const sessionId = sessionResp.sessionId

        // T4c: history replay — send each prior user turn before the current prompt
        if (opts.history && opts.history.length > 0) {
          for (const msg of opts.history) {
            const m = msg as unknown as { role?: string }
            if (m.role !== "user") continue
            const text = extractMessageText(msg)
            if (!text) continue
            await connection.prompt({
              sessionId,
              prompt: [{ type: "text", text }],
            })
            if (killed) return
          }
        }

        await connection.prompt({
          sessionId,
          prompt: [{ type: "text", text: opts.message }],
        })

        if (!finished) {
          push({ type: "done" })
          finished = true
        }
      } catch (err) {
        if (!finished) {
          const message = err instanceof Error ? err.message : String(err)
          push({ type: "error", message })
          push({ type: "done" })
          finished = true
        }
      }
    }

    const runPromise = run()

    // Drain queue
    try {
      while (true) {
        while (queue.length > 0) {
          const ev = queue.shift()!
          yield ev
          if (ev.type === "done") return
        }
        if (finished) return
        await new Promise<void>((resolve) => {
          notify = resolve
        })
      }
    } finally {
      opts.signal.removeEventListener("abort", onAbort)
      if (stallTimer) clearTimeout(stallTimer)
      if (hardTimer) clearTimeout(hardTimer)
      if (proc && !proc.killed) {
        try {
          proc.kill("SIGTERM")
          setTimeout(() => {
            if (proc && !proc.killed) {
              try {
                proc.kill("SIGKILL")
              } catch {
                /* ignore */
              }
            }
          }, SIGKILL_GRACE_MS)
        } catch {
          /* ignore */
        }
      }
      // Ensure run() settles so we don't leak
      await runPromise.catch(() => {})
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
}
