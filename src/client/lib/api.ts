import type { Provider, ModelInfo, HarnessResult } from "./types"

const API_BASE = "/api"

export async function connectProvider(provider: Provider, key: string): Promise<{ status: "ok" | "error"; message?: string }> {
  const res = await fetch(`${API_BASE}/auth/apikey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, key }),
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
