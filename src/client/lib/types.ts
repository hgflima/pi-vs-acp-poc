// --- Provider & Auth ---
export type Provider = "anthropic" | "openai"

export type AuthStatus = "disconnected" | "connecting" | "connected" | "error"

export interface AuthState {
  status: AuthStatus
  provider: Provider | null
  error: string | null
}

// --- Messages (D-13: segment-based model) ---
export type ToolCardVariant = "bash" | "file" | "search" | "agent" | "toolsearch" | "generic"
export type ToolStatus = "running" | "done" | "error"

export interface TextSegment {
  type: "text"
  content: string
}

export interface ToolSegment {
  type: "tool"
  toolId: string
  toolName: string
  variant: ToolCardVariant
  status: ToolStatus
  args: Record<string, unknown>
  result?: string
  error?: string
}

export type MessageSegment = TextSegment | ToolSegment

export interface UserMessage {
  role: "user"
  content: string
  timestamp: number
}

export interface AssistantMessage {
  role: "assistant"
  segments: MessageSegment[]
  streaming: boolean
  timestamp: number
}

export type Message = UserMessage | AssistantMessage

// --- SSE Events (for Phase 2+, define now per D-15) ---
export type SSEEvent =
  | { type: "text_delta"; data: string }
  | { type: "tool_start"; tool: string; id: string; params: Record<string, unknown> }
  | { type: "tool_update"; id: string; data: string }
  | { type: "tool_end"; id: string; result: string; status: "done" | "error" }
  | { type: "thinking_delta"; data: string }
  | { type: "error"; message: string }
  | { type: "done" }

// --- App State (D-14: auth fully typed, rest as stubs) ---
export interface AppState {
  auth: AuthState
  agent: {
    current: "claude-code" | "codex"
    model: string | null
    availableModels: Array<{ id: string; name: string }>
  }
  chat: {
    messages: Message[]
    streaming: boolean
    error: string | null
  }
  harness: {
    applied: boolean
  }
}
