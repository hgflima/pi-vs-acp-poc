import type { SSEStream } from "hono/streaming"
import type { RuntimeEvent } from "../agent/runtime"

export async function writeRuntimeEventToSSE(
  ev: RuntimeEvent,
  stream: SSEStream,
): Promise<void> {
  switch (ev.type) {
    case "text_delta":
      await stream.writeSSE({
        event: "text_delta",
        data: JSON.stringify({ data: ev.delta }),
      })
      return
    case "thinking_delta":
      await stream.writeSSE({
        event: "thinking_delta",
        data: JSON.stringify({ data: ev.delta }),
      })
      return
    case "tool_start":
      await stream.writeSSE({
        event: "tool_start",
        data: JSON.stringify({ id: ev.id, tool: ev.tool, params: ev.params }),
      })
      return
    case "tool_update":
      await stream.writeSSE({
        event: "tool_update",
        data: JSON.stringify({ id: ev.id, data: ev.data }),
      })
      return
    case "tool_end":
      await stream.writeSSE({
        event: "tool_end",
        data: JSON.stringify({ id: ev.id, result: ev.result, status: ev.status }),
      })
      return
    case "error":
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: ev.message }),
      })
      return
    case "done":
      await stream.writeSSE({ event: "done", data: "{}" })
      return
    case "session_mode_state":
      await stream.writeSSE({
        event: "session_mode_state",
        data: JSON.stringify({
          availableModes: ev.availableModes,
          currentModeId: ev.currentModeId,
        }),
      })
      return
    case "permission_request":
      await stream.writeSSE({
        event: "permission_request",
        data: JSON.stringify({
          id: ev.id,
          toolCallId: ev.toolCallId,
          options: ev.options,
        }),
      })
      return
    case "elicitation_request":
      await stream.writeSSE({
        event: "elicitation_request",
        data: JSON.stringify({
          id: ev.id,
          message: ev.message,
          requestedSchema: ev.requestedSchema,
        }),
      })
      return
    case "prompt_expired":
      await stream.writeSSE({
        event: "prompt_expired",
        data: JSON.stringify({ id: ev.id }),
      })
      return
  }
}
