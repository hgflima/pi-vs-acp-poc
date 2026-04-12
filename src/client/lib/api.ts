import type {
  Provider,
  ModelInfo,
  HarnessResult,
  AuthMethod,
  HarnessItem,
  DiscoveryHarness,
  DiscoveryResult,
  DiscoverySource,
  PluginStatus,
  FetchHarnessItemsOptions,
  LegacyHarnessItems,
} from "./types"

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

export async function respondToPrompt(
  id: string,
  response: Record<string, unknown>,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${API_BASE}/chat/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, response }),
  })
  return { ok: res.ok, status: res.status }
}

export async function setAcpSessionMode(
  chatId: string,
  modeId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/acp/${encodeURIComponent(chatId)}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modeId }),
    })
    if (!res.ok) {
      let error = `setMode failed: ${res.status}`
      try {
        const data = await res.json()
        if (typeof data?.error === "string") error = data.error
      } catch {
        /* ignore */
      }
      return { ok: false, error }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setPiSessionMode(
  chatSessionId: string,
  modeId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/pi/${encodeURIComponent(chatSessionId)}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modeId }),
    })
    if (!res.ok) {
      let error = `setMode failed: ${res.status}`
      try {
        const data = await res.json()
        if (typeof data?.error === "string") error = data.error
      } catch {
        /* ignore */
      }
      return { ok: false, error }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setSessionMode(
  runtime: "pi" | "acp",
  chatSessionId: string,
  modeId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (runtime === "acp") return setAcpSessionMode(chatSessionId, modeId)
  return setPiSessionMode(chatSessionId, modeId)
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

export async function fetchProjectFiles(query: string): Promise<{ path: string }[]> {
  const res = await fetch(`${API_BASE}/harness/project-files?query=${encodeURIComponent(query)}`)
  if (!res.ok) return []
  return res.json()
}

export async function fetchHarnessItems(type: string): Promise<LegacyHarnessItems>
export async function fetchHarnessItems(
  type: string,
  opts: FetchHarnessItemsOptions,
): Promise<DiscoveryResult>
export async function fetchHarnessItems(
  type: string,
  opts?: FetchHarnessItemsOptions,
): Promise<LegacyHarnessItems | DiscoveryResult> {
  // Legacy call: no opts → existing /items?type= endpoint, returns HarnessItem[]
  if (!opts) {
    const res = await fetch(`${API_BASE}/harness/items?type=${encodeURIComponent(type)}`)
    if (!res.ok) return []
    return res.json()
  }

  // Native discovery call: hits /items/:type with query params, returns DiscoveryResult
  const params = new URLSearchParams()
  if (opts.agent) params.set("agent", opts.agent)
  if (opts.scope) params.set("scope", opts.scope)
  if (opts.includeShadowed) params.set("includeShadowed", "true")
  const qs = params.toString()
  const res = await fetch(
    `${API_BASE}/harness/items/${encodeURIComponent(type)}${qs ? `?${qs}` : ""}`,
  )
  if (!res.ok) {
    return { items: [], shadowed: [], sources: [], errors: [], generatedAt: Date.now() }
  }
  return res.json()
}

export async function fetchDiscoverySources(agent: DiscoveryHarness): Promise<DiscoverySource[]> {
  const res = await fetch(`${API_BASE}/harness/sources?agent=${encodeURIComponent(agent)}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data?.sources) ? data.sources : []
}

export async function fetchPluginStatus(agent: DiscoveryHarness): Promise<PluginStatus[]> {
  const res = await fetch(`${API_BASE}/harness/plugin-status?agent=${encodeURIComponent(agent)}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data?.plugins) ? data.plugins : []
}

export async function reloadDiscovery(): Promise<void> {
  await fetch(`${API_BASE}/harness/reload`, { method: "POST" })
}

// === Harness CRUD API ===

export interface InstructionsStatus {
  content: string
  claudeExists: boolean
  claudeSynced: boolean
  geminiExists: boolean
  geminiSynced: boolean
}

export async function fetchInstructions(): Promise<InstructionsStatus> {
  const res = await fetch(`${API_BASE}/harness/instructions`)
  if (!res.ok) throw new Error("Failed to fetch instructions")
  return res.json()
}

export async function saveInstructions(content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/harness/instructions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to save" }))
    throw new Error(data.error || "Failed to save instructions")
  }
}

export async function fetchHarnessItem(type: string, name: string): Promise<HarnessItem> {
  const res = await fetch(
    `${API_BASE}/harness/item?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Not found" }))
    throw new Error(data.error || "Item not found")
  }
  return res.json()
}

export async function saveHarnessItem(type: string, name: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/harness/item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, name, content }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to save" }))
    throw new Error(data.error || "Failed to save item")
  }
}

export async function deleteHarnessItem(type: string, name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/harness/item`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, name }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to delete" }))
    throw new Error(data.error || "Failed to delete item")
  }
}
