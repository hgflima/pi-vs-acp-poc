import type { Provider } from "./types"

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
