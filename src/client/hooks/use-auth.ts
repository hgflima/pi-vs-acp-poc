import { useState, useCallback } from "react"
import type { Provider, ProviderAuthState } from "@/client/lib/types"
import { connectProvider, fetchAuthStatus } from "@/client/lib/api"

const PROVIDERS: Provider[] = ["anthropic", "openai"]

function initialState(): Map<Provider, ProviderAuthState> {
  const map = new Map<Provider, ProviderAuthState>()
  for (const p of PROVIDERS) {
    map.set(p, { status: "disconnected", authMethod: null, error: null })
  }
  return map
}

const DEFAULT_STATE: ProviderAuthState = {
  status: "disconnected",
  authMethod: null,
  error: null,
}

export function useAuth() {
  const [providers, setProviders] = useState<Map<Provider, ProviderAuthState>>(initialState)

  const setProviderState = useCallback((provider: Provider, next: ProviderAuthState) => {
    setProviders((prev) => {
      const copy = new Map(prev)
      copy.set(provider, next)
      return copy
    })
  }, [])

  const getProviderAuth = useCallback(
    (provider: Provider): ProviderAuthState => providers.get(provider) ?? DEFAULT_STATE,
    [providers]
  )

  const connect = useCallback(
    async (provider: Provider, apiKey: string): Promise<boolean> => {
      setProviderState(provider, { status: "connecting", authMethod: null, error: null })
      try {
        const data = await connectProvider(provider, apiKey)
        if (data.status === "ok") {
          setProviderState(provider, { status: "connected", authMethod: "apiKey", error: null })
          return true
        }
        setProviderState(provider, {
          status: "error",
          authMethod: null,
          error: data.message || "Connection failed",
        })
        return false
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Network error"
        setProviderState(provider, { status: "error", authMethod: null, error: message })
        return false
      }
    },
    [setProviderState]
  )

  const disconnect = useCallback(
    (provider: Provider) => {
      setProviderState(provider, { status: "disconnected", authMethod: null, error: null })
    },
    [setProviderState]
  )

  const refreshStatus = useCallback(
    async (provider: Provider): Promise<void> => {
      try {
        const data = await fetchAuthStatus(provider)
        const hasAny = data.hasApiKey || data.hasOAuth
        setProviderState(provider, {
          status: hasAny ? "connected" : "disconnected",
          authMethod: data.activeMethod,
          error: null,
          ...(data.oauthExpiry !== undefined ? { oauthExpiry: data.oauthExpiry } : {}),
        })
      } catch {
        // Silent fail on status fetch — leaves current state intact
      }
    },
    [setProviderState]
  )

  return { getProviderAuth, connect, disconnect, refreshStatus }
}
