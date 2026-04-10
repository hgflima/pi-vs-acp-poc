import type { AgentMessage } from "@mariozechner/pi-agent-core"

export type RuntimeEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; id: string; tool: string; params: unknown }
  | { type: "tool_update"; id: string; data: string }
  | { type: "tool_end"; id: string; result: string; status: "done" | "error" }
  | { type: "error"; message: string }
  | { type: "done" }

export interface RuntimePromptOptions {
  message: string
  history?: AgentMessage[]
  signal: AbortSignal
}

export interface Runtime {
  prompt(opts: RuntimePromptOptions): AsyncIterable<RuntimeEvent>
}
