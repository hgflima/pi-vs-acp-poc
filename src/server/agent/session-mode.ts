import type { SessionMode } from "@agentclientprotocol/sdk"

export const DEFAULT_MODE_ID = "default"

export const DEFAULT_PI_MODES: SessionMode[] = [
  {
    id: "default",
    name: "Default",
    description: "Prompt before every tool call",
  },
  {
    id: "acceptEdits",
    name: "Accept Edits",
    description: "Auto-allow file edits; prompt for bash",
  },
  {
    id: "plan",
    name: "Plan",
    description: "Read-only: block all write-class tools",
  },
  {
    id: "bypassPermissions",
    name: "Bypass Permissions",
    description: "Allow all tools without prompting",
  },
]

// Tools that can mutate workspace state or have side effects. Used by the
// beforeToolCall hook in pi-runtime.ts to enforce plan-mode read-only and to
// decide whether acceptEdits should auto-allow vs. prompt.
export const WRITE_CLASS_TOOLS: ReadonlySet<string> = new Set([
  "bash",
])

// Read-only tools that never mutate state. Short-circuited to allow silently
// in default and acceptEdits modes (no permission prompt).
export const READ_CLASS_TOOLS: ReadonlySet<string> = new Set([
  "read_file",
  "list_files",
])

const modeByChatSession = new Map<string, string>()

export const getMode = (chatSessionId: string): string => {
  return modeByChatSession.get(chatSessionId) ?? DEFAULT_MODE_ID
}

export const setMode = (chatSessionId: string, modeId: string): void => {
  if (!DEFAULT_PI_MODES.some((m) => m.id === modeId)) {
    throw new Error(`unknown mode: ${modeId}`)
  }
  modeByChatSession.set(chatSessionId, modeId)
}

export const clearMode = (chatSessionId: string): void => {
  modeByChatSession.delete(chatSessionId)
}

export const __resetAllModesForTest = (): void => {
  modeByChatSession.clear()
}
