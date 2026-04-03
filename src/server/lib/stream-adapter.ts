import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core"
import type { SSEStream } from "hono/streaming"

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
