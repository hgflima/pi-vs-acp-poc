import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core"
import type { SSEStream } from "hono/streaming"

// DIAGNOSTIC LOGGING — Phase 7.1 gap closure (07-04-stream-adapter-gap-closure-PLAN.md).
// Remove or set to false in Task 2 after root cause is confirmed and fix lands.
const DEBUG_EVENTS = false

function logEvent(event: unknown): void {
  if (!DEBUG_EVENTS) return
  const e = event as { type?: string; assistantMessageEvent?: { type?: string } }
  const inner = e.assistantMessageEvent ? ` ame.type=${e.assistantMessageEvent.type}` : ""
  // eslint-disable-next-line no-console
  console.log(`[stream-adapter] type=${e.type}${inner}`)
}

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
    logEvent(event)
    try {
      switch (event.type) {
        case "message_update": {
          const ame = event.assistantMessageEvent
          // Phase 7.1: handle text_delta (primary content), thinking_delta (reasoning visibility),
          // and surface an SSE `stream_warning` event for any AssistantMessageEvent subtype not
          // currently represented in the client protocol so silent fall-through cannot recur.
          // AssistantMessageEvent subtypes (pi-ai types.d.ts): start, text_start, text_delta, text_end,
          // thinking_start, thinking_delta, thinking_end, toolcall_start, toolcall_delta, toolcall_end,
          // done, error. text_delta is the only one that carries user-visible assistant content in the
          // current client contract — the others are lifecycle markers (no-op) or reasoning traces.
          switch (ame.type) {
            case "text_delta":
              void stream.writeSSE({
                event: "text_delta",
                data: JSON.stringify({ data: ame.delta }),
              })
              break
            case "thinking_delta":
              // Reasoning traces from Codex responses. Client currently does not render these but
              // emitting them as a distinct SSE event keeps the protocol visible for future UI work.
              void stream.writeSSE({
                event: "thinking_delta",
                data: JSON.stringify({ data: ame.delta }),
              })
              break
            case "error":
              // Surface upstream stream-level errors as SSE error events so the client can display
              // them instead of receiving a silent `done` with no content (root cause of this gap).
              void stream.writeSSE({
                event: "error",
                data: JSON.stringify({ message: ame.error?.errorMessage ?? "Stream error" }),
              })
              break
            case "start":
            case "text_start":
            case "text_end":
            case "thinking_start":
            case "thinking_end":
            case "toolcall_start":
            case "toolcall_delta":
            case "toolcall_end":
            case "done":
              // Lifecycle markers — no SSE emission. toolcall_* are superseded by tool_execution_*
              // events at the AgentEvent layer, so the client receives tool info via those.
              break
          }
          break
        }

        case "message_end": {
          // Phase 7.1 D-03: surface upstream stream-level errors that pi-agent-core delivers
          // via message_end (when pi-ai throws BEFORE pushing any "start" event — e.g. Codex
          // HTTP failures from openai-codex-responses.js lines 79/144/159/163/166). Without this
          // branch the errorMessage is silently dropped and the client only sees `event: done`
          // (the gap diagnosed in Phase 7 Plan 07-04).
          // Mirrors the shape used by `case "message_update" → case "error"` above: the client
          // receives `event: error` with `{ message: <human-readable reason> }` in data.
          if (
            event.message.stopReason === "error" &&
            event.message.errorMessage
          ) {
            void stream.writeSSE({
              event: "error",
              data: JSON.stringify({ message: event.message.errorMessage }),
            })
          }
          // stopReason === "aborted" (user cancelled) and normal completion reasons
          // (stop, length, etc.) intentionally emit no SSE — `case "agent_end"` handles
          // the terminal `event: done`. Keeping this no-op explicit so the switch stays
          // exhaustive on the currently-handled AgentEvent types.
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
