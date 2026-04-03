import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core"
import type { SSEStream } from "hono/streaming"

const MAX_RESULT_LENGTH = 10240

function extractTextFromResult(result: any): string {
  if (!result) return ""
  if (typeof result === "string") return result
  if (result.content && Array.isArray(result.content)) {
    const text = result.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n")
    if (text.length > MAX_RESULT_LENGTH) {
      return text.slice(0, MAX_RESULT_LENGTH) + "\n\n... (output truncated)"
    }
    return text
  }
  const fallback = JSON.stringify(result)
  if (fallback.length > MAX_RESULT_LENGTH) {
    return fallback.slice(0, MAX_RESULT_LENGTH) + "\n\n... (output truncated)"
  }
  return fallback
}

interface AdaptOptions {
  agent: Agent
  stream: SSEStream
  onDone: () => void
}

export function adaptAgentEvents({ agent, stream, onDone }: AdaptOptions): () => void {
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    try {
      switch (event.type) {
        case "message_update": {
          const ame = event.assistantMessageEvent
          if (ame.type === "text_delta") {
            void stream.writeSSE({
              event: "text_delta",
              data: JSON.stringify({ data: ame.delta }),
            })
          }
          break
        }

        case "tool_execution_start":
          void stream.writeSSE({
            event: "tool_start",
            data: JSON.stringify({
              tool: event.toolName,
              id: event.toolCallId,
              params: event.args ?? {},
            }),
          })
          break

        case "tool_execution_update":
          void stream.writeSSE({
            event: "tool_update",
            data: JSON.stringify({
              id: event.toolCallId,
              data: extractTextFromResult(event.partialResult),
            }),
          })
          break

        case "tool_execution_end":
          void stream.writeSSE({
            event: "tool_end",
            data: JSON.stringify({
              id: event.toolCallId,
              result: extractTextFromResult(event.result),
              status: event.isError ? "error" : "done",
            }),
          })
          break

        case "agent_end":
          void stream.writeSSE({
            event: "done",
            data: "{}",
          }).then(() => {
            unsubscribe()
            onDone()
          })
          break
      }
    } catch {
      // Stream may be closed if client disconnected
    }
  })

  return unsubscribe
}
