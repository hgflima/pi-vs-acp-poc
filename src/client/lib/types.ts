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
  | { type: "available_commands"; commands: AvailableCommand[] }
  | { type: "file_changed"; path: string; changeType: "created" | "modified" | "deleted" }

// --- Available Commands & Autocomplete ---
export type AvailableCommandSource = "acp" | "filesystem"
export type AvailableCommandType = "skill" | "command" | "built-in"

export interface AvailableCommand {
  name: string
  description?: string
  source: AvailableCommandSource
  type: AvailableCommandType
}

export type AutocompleteItemType = "skill" | "command" | "built-in" | "file" | "subagent"

export interface AutocompleteItem {
  label: string
  description?: string
  type: AutocompleteItemType
  icon?: string
  scope?: DiscoveredScope
  pluginName?: string
  argumentHint?: string
}

// --- Chat Attachments ---
export interface ChatAttachment {
  id: string
  filename: string
  mimeType: string
  content: string // base64 for images, text for files
  size: number
  preview?: string // thumbnail data URL for images
}

// --- Agent Status ---
export type AgentStatusType = "idle" | "thinking" | "reasoning" | "tool_execution" | "error"

export interface AgentStatus {
  type: AgentStatusType
  toolName?: string // during tool_execution
  startedAt?: number // timestamp for timer
  error?: string
}

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
export type HarnessItemType = "skills" | "commands" | "rules" | "hooks" | "subagents"

export interface HarnessItem {
  name: string
  type: HarnessItemType
  path: string
  content?: string
  description?: string
  metadata?: Record<string, unknown>
}

// --- Native discovery types (mirrors src/server/agent/discovery/types.ts) ---
export type DiscoveredItemType = "skill" | "command" | "subagent"
export type DiscoveredScope = "personal" | "project" | "plugin" | "bundled" | "enterprise"
export type DiscoveryHarness = "claude" | "codex" | "gemini"

export interface DiscoveredItem {
  name: string
  type: DiscoveredItemType
  scope: DiscoveredScope
  harness: DiscoveryHarness
  origin: string
  description: string
  argumentHint?: string
  userInvocable: boolean
  path: string
  mtimeMs: number
  pluginKey?: string
  pluginName?: string
}

export type ShadowReason =
  | "skill-over-command"
  | "lower-scope"
  | "duplicate-plugin-install"
  | "user-override-bundled"

export interface ShadowedItem {
  item: DiscoveredItem
  shadowedBy: DiscoveredItem
  reason: ShadowReason
}

export interface DiscoverySource {
  path: string
  scope: DiscoveredScope
  exists: boolean
  itemsFound: number
  pluginKey?: string
  pluginName?: string
}

export interface DiscoveryError {
  path: string
  message: string
  kind: "oversized" | "malformed" | "unreadable"
}

export interface DiscoveryResult {
  items: DiscoveredItem[]
  shadowed?: ShadowedItem[]
  sources: DiscoverySource[]
  errors: DiscoveryError[]
  generatedAt: number
}

export interface PluginStatus {
  pluginKey: string
  pluginName: string
  installPath: string
  enabled: boolean
  enabledBy: string | null
  scope: "user" | "local" | "project"
}

export type LegacyHarnessItems = HarnessItem[]

export interface FetchHarnessItemsOptions {
  agent?: DiscoveryHarness
  scope?: DiscoveredScope | "all"
  includeShadowed?: boolean
}

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
  commands: HarnessDir | null
  rules: HarnessDir | null
  hooks: HarnessDir | null
  subagents: HarnessDir | null
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
