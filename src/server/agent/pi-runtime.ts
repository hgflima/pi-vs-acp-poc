import type { AgentEvent } from "@mariozechner/pi-agent-core"
import { createAgent } from "./setup"
import type { Runtime, RuntimeEvent, RuntimePromptOptions } from "./runtime"
import type { Provider } from "../lib/credentials"

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

export class PiRuntime implements Runtime {
  constructor(private readonly opts: PiRuntimeOptions) {}

  async *prompt(opts: RuntimePromptOptions): AsyncIterable<RuntimeEvent> {
    const agent = createAgent({ provider: this.opts.provider, modelId: this.opts.modelId })
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

    agent.prompt(opts.message).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      push({ type: "error", message })
      push({ type: "done" })
      finished = true
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
