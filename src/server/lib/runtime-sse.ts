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
  }
}
