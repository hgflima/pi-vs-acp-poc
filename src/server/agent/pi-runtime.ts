import type {
  AgentEvent,
  BeforeToolCallContext,
  BeforeToolCallResult,
} from "@mariozechner/pi-agent-core"
import type { RequestPermissionOutcome } from "@agentclientprotocol/sdk"
import { createAgent } from "./setup"
import type { Runtime, RuntimeEvent, RuntimePromptOptions } from "./runtime"
import type { Provider } from "../lib/credentials"
import {
  DEFAULT_PI_MODES,
  WRITE_CLASS_TOOLS,
  READ_CLASS_TOOLS,
  getMode,
} from "./session-mode"
import { requestPermission } from "./permission-bridge"
import { piRuntimeStore } from "./pi-runtime-context"

interface PiRuntimeOptions {
  provider: Provider
  modelId: string
}

const MAX_RESULT_LENGTH = 10240

function extractTextFromResult(result: unknown): string {
  if (!result) return ""
  if (typeof result === "string") {
    return result.length > MAX_RESULT_LENGTH
      ? result.slice(0, MAX_RESULT_LENGTH) + "\n\n... (output truncated)"
      : result
  }
  const r = result as { content?: Array<{ type?: string; text?: string }> }
  if (r.content && Array.isArray(r.content)) {
    const text = r.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
    return text.length > MAX_RESULT_LENGTH
      ? text.slice(0, MAX_RESULT_LENGTH) + "\n\n... (output truncated)"
      : text
  }
  const fallback = JSON.stringify(result)
  return fallback.length > MAX_RESULT_LENGTH
    ? fallback.slice(0, MAX_RESULT_LENGTH) + "\n\n... (output truncated)"
    : fallback
}

function mapAgentEvent(event: AgentEvent): RuntimeEvent[] {
  switch (event.type) {
    case "message_update": {
      const ame = event.assistantMessageEvent
      switch (ame.type) {
        case "text_delta":
          return [{ type: "text_delta", delta: ame.delta }]
        case "thinking_delta":
          return [{ type: "thinking_delta", delta: ame.delta }]
        case "error":
          return [{ type: "error", message: ame.error?.errorMessage ?? "Stream error" }]
        default:
          return []
      }
    }
    case "message_end":
      if (event.message.stopReason === "error" && event.message.errorMessage) {
        return [{ type: "error", message: event.message.errorMessage }]
      }
      return []
    case "tool_execution_start":
      return [{
        type: "tool_start",
        id: event.toolCallId,
        tool: event.toolName,
        params: event.args ?? {},
      }]
    case "tool_execution_update":
      return [{
        type: "tool_update",
        id: event.toolCallId,
        data: extractTextFromResult(event.partialResult),
      }]
    case "tool_execution_end":
      return [{
        type: "tool_end",
        id: event.toolCallId,
        result: extractTextFromResult(event.result),
        status: event.isError ? "error" : "done",
      }]
    case "agent_end":
      return [{ type: "done" }]
    default:
      return []
  }
}

const PROMPT_PERMISSION_OPTIONS = [
  { optionId: "allow_once", name: "Allow once", kind: "allow_once" as const },
  { optionId: "allow_always", name: "Allow always", kind: "allow_always" as const },
  { optionId: "reject_once", name: "Reject", kind: "reject_once" as const },
]

const BLOCKED_BY_PLAN: BeforeToolCallResult = {
  block: true,
  reason: "plan mode: read-only",
}

const BLOCKED_BY_USER: BeforeToolCallResult = {
  block: true,
  reason: "user rejected tool call",
}

export class PiRuntime implements Runtime {
  constructor(private readonly opts: PiRuntimeOptions) {}

  async *prompt(opts: RuntimePromptOptions): AsyncIterable<RuntimeEvent> {
    const chatSessionId = opts.chatSessionId
    if (!chatSessionId) {
      throw new Error("PI runtime requires chatSessionId — route validation should have caught this")
    }
    const queue: RuntimeEvent[] = []
    let finished = false
    let notify: (() => void) | null = null

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

    const buildBeforeToolCall = (): ((
      context: BeforeToolCallContext,
      signal?: AbortSignal,
    ) => Promise<BeforeToolCallResult | undefined>) | undefined => {
      const modeId = getMode(chatSessionId)
      if (modeId === "bypassPermissions") return undefined

      return async (context, signal) => {
        const toolName = context.toolCall.name
        const isWriteClass = WRITE_CLASS_TOOLS.has(toolName)
        const isReadClass = READ_CLASS_TOOLS.has(toolName)
        const currentMode = getMode(chatSessionId)

        if (currentMode === "bypassPermissions") return undefined

        // Read-class tools auto-allow in default and acceptEdits (silent, no prompt).
        if (isReadClass && (currentMode === "default" || currentMode === "acceptEdits")) {
          return undefined
        }

        if (currentMode === "plan") {
          if (isWriteClass) return BLOCKED_BY_PLAN
          return undefined
        }
        if (currentMode === "acceptEdits") {
          // Non-bash write-class → allow silently. Bash / unknown → prompt.
          if (isWriteClass && toolName !== "bash") return undefined
        }

        // Prompt via permission bridge.
        let outcome: RequestPermissionOutcome
        try {
          outcome = await requestPermission(
            context.toolCall.id,
            [...PROMPT_PERMISSION_OPTIONS],
            signal,
            (id) => {
              push({
                type: "permission_request",
                id,
                toolCallId: context.toolCall.id,
                options: [...PROMPT_PERMISSION_OPTIONS],
              })
            },
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes("timed out")) {
            push({ type: "prompt_expired", id: context.toolCall.id })
          }
          return { block: true, reason: msg }
        }

        if (outcome.outcome === "cancelled") return BLOCKED_BY_USER
        const selected = outcome.optionId
        if (selected === "reject_once" || selected === "reject_always") {
          return BLOCKED_BY_USER
        }
        return undefined
      }
    }

    const agent = createAgent({
      provider: this.opts.provider,
      modelId: this.opts.modelId,
      beforeToolCall: buildBeforeToolCall(),
    })

    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      for (const ev of mapAgentEvent(event)) {
        push(ev)
        if (ev.type === "done") {
          finished = true
        }
      }
    })

    const abortHandler = () => {
      agent.abort()
    }
    opts.signal.addEventListener("abort", abortHandler)

    if (opts.history && opts.history.length > 0) {
      agent.replaceMessages(opts.history)
    }

    if (chatSessionId) {
      push({
        type: "session_mode_state",
        availableModes: DEFAULT_PI_MODES,
        currentModeId: getMode(chatSessionId),
      })
    }

    piRuntimeStore.run({ push }, () => {
      agent.prompt(opts.message).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        push({ type: "error", message })
        push({ type: "done" })
        finished = true
      })
    })

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
      unsubscribe()
      opts.signal.removeEventListener("abort", abortHandler)
    }
  }
}
