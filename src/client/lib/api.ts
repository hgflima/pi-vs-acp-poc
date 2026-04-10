import type { Provider, ModelInfo, HarnessResult, AuthMethod } from "./types"

const API_BASE = "/api"

export async function connectProvider(provider: Provider, key: string): Promise<{ status: "ok" | "error"; message?: string }> {
  const res = await fetch(`${API_BASE}/auth/apikey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, key }),
  })
  return res.json()
}

export interface AuthStatusResponse {
  hasApiKey: boolean
  hasOAuth: boolean
  activeMethod: AuthMethod | null
  oauthExpiry?: number
}

export async function fetchAuthStatus(provider: Provider): Promise<AuthStatusResponse> {
  const res = await fetch(`${API_BASE}/auth/status?provider=${provider}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch auth status: ${res.status}`)
  }
  return res.json()
}

export async function startOAuth(provider: Provider): Promise<{
  status: "started" | "error"
  provider: Provider
  authUrl?: string
  message?: string
}> {
  const res = await fetch(`${API_BASE}/auth/oauth/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  })
  return res.json()
}

export async function fetchOAuthStatus(provider: Provider): Promise<{
  status: "pending" | "ok" | "error" | "none"
  provider: Provider
  authUrl?: string
  message?: string
}> {
  const res = await fetch(`${API_BASE}/auth/oauth/status?provider=${provider}`)
  return res.json()
}

export async function disconnectProvider(provider: Provider): Promise<{
  status: "ok" | "error"
  message?: string
}> {
  const res = await fetch(`${API_BASE}/auth/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  })
  return res.json()
}

export async function healthCheck(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/health`)
  return res.json()
}

export async function fetchModels(provider: Provider): Promise<{ models: ModelInfo[]; needsAuth?: boolean }> {
  const res = await fetch(`${API_BASE}/models?provider=${provider}`)
  if (res.status === 401) {
    const data = await res.json()
    return { models: [], needsAuth: data.needsAuth ?? true }
  }
  if (!res.ok) {
    throw new Error("Failed to fetch models")
  }
  return res.json()
}

export async function loadHarness(directory: string): Promise<HarnessResult> {
  const res = await fetch(`${API_BASE}/harness/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to load harness" }))
    throw new Error(data.error || "Failed to load harness")
  }
  return res.json()
}

export async function clearHarnessApi(): Promise<void> {
  await fetch(`${API_BASE}/harness/clear`, { method: "POST" })
}

export type AcpStatus = Record<string, boolean>

export async function fetchAcpStatus(): Promise<AcpStatus> {
  const res = await fetch(`${API_BASE}/runtime/acp/status`)
  if (!res.ok) {
    throw new Error(`Failed to fetch ACP status: ${res.status}`)
  }
  return res.json()
}

export async function deleteAcpSession(chatId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/chat/session/${encodeURIComponent(chatId)}`, {
      method: "DELETE",
      keepalive: true,
    })
  } catch {
    // best-effort: reaper cleans up orphaned sessions after idle timeout
  }
}
