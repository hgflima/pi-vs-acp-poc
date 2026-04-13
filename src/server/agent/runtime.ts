import type { AgentMessage } from "@mariozechner/pi-agent-core"
import type {
  SessionMode,
  PermissionOption,
  ElicitationSchema,
} from "@agentclientprotocol/sdk"

export type RuntimeEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; id: string; tool: string; params: unknown }
  | { type: "tool_update"; id: string; data: string }
  | { type: "tool_end"; id: string; result: string; status: "done" | "error" }
  | { type: "error"; message: string }
  | { type: "done" }
  | { type: "session_mode_state"; availableModes: SessionMode[]; currentModeId: string }
  | { type: "permission_request"; id: string; toolCallId: string; options: PermissionOption[] }
  | { type: "elicitation_request"; id: string; message: string; requestedSchema: ElicitationSchema }
  | { type: "prompt_expired"; id: string }
  | { type: "available_commands"; commands: Array<{ name: string; description?: string; source: "acp"; type: "skill" | "command" | "built-in" }> }

export interface RuntimePromptOptions {
  message: string
  history?: AgentMessage[]
  signal: AbortSignal
  chatSessionId?: string
}

export interface Runtime {
  prompt(opts: RuntimePromptOptions): AsyncIterable<RuntimeEvent>
}
