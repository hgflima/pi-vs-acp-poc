// --- Provider & Auth ---
export type Provider = "anthropic" | "openai"

export type AuthStatus = "disconnected" | "connecting" | "connected" | "error"

// D-05: auth method per provider (prepares UI-03 badges in Phase 8)
export type AuthMethod = "apiKey" | "oauth"

// D-06: independent auth state per provider
export interface ProviderAuthState {
  status: AuthStatus
  authMethod: AuthMethod | null
  error: string | null
  oauthExpiry?: number
}

export interface AuthState {
  providers: Map<Provider, ProviderAuthState>
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
import type {
  SessionMode,
  PermissionOption,
  ElicitationSchema,
} from "@agentclientprotocol/sdk"

export type SSEEvent =
  | { type: "text_delta"; data: string }
  | { type: "tool_start"; tool: string; id: string; params: Record<string, unknown> }
  | { type: "tool_update"; id: string; data: string }
  | { type: "tool_end"; id: string; result: string; status: "done" | "error" }
  | { type: "thinking_delta"; data: string }
  | { type: "error"; message: string }
  | { type: "done" }
  | { type: "session_mode_state"; availableModes: SessionMode[]; currentModeId: string }
  | { type: "permission_request"; id: string; toolCallId: string; options: PermissionOption[] }
  | { type: "elicitation_request"; id: string; message: string; requestedSchema: ElicitationSchema }
  | { type: "prompt_expired"; id: string }

// --- Agent Configuration (Phase 4) ---
export type AgentId = "claude-code" | "codex"

export interface AgentConfig {
  provider: Provider
  label: string
  icon: string       // lucide icon name
  defaultModel: string
}

export const AGENT_CONFIG: Record<AgentId, AgentConfig> = {
  "claude-code": {
    provider: "anthropic",
    label: "Claude Code",
    icon: "Bot",
    defaultModel: "claude-sonnet-4-20250514",
  },
  "codex": {
    provider: "openai",
    label: "Codex",
    icon: "Cpu",
    defaultModel: "codex-mini-latest",
  },
} as const

export interface ModelInfo {
  id: string
  name: string
  reasoning?: boolean
}

// --- Harness Types (Phase 4) ---
export interface HarnessFile {
  content: string
  size: number
}

export interface HarnessDir {
  count: number
  names: string[]
}

export interface HarnessResult {
  claudeMd: HarnessFile | null
  agentsMd: HarnessFile | null
  skills: HarnessDir | null
  hooks: HarnessDir | null
  errors: Array<{ file: string; error: string }>
}

export interface HarnessState {
  applied: boolean
  directory: string | null
  result: HarnessResult | null
}

// --- App State (D-14: auth fully typed, rest as stubs) ---
export interface AppState {
  auth: AuthState
  agent: {
    current: AgentId
    model: string | null
    availableModels: ModelInfo[]
  }
  chat: {
    messages: Message[]
    streaming: boolean
    error: string | null
  }
  harness: HarnessState
}
