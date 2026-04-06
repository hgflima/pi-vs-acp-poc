import { useState, useCallback, useRef, useEffect } from "react"
import type { Provider, ProviderAuthState } from "@/client/lib/types"
import { connectProvider, fetchAuthStatus, startOAuth as startOAuthApi, fetchOAuthStatus, disconnectProvider } from "@/client/lib/api"

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
  const pollingRef = useRef<Map<Provider, ReturnType<typeof setInterval>>>(new Map())

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

  const stopPolling = useCallback((provider: Provider) => {
    const interval = pollingRef.current.get(provider)
    if (interval) {
      clearInterval(interval)
      pollingRef.current.delete(provider)
    }
  }, [])

  const startOAuth = useCallback(
    async (provider: Provider) => {
      setProviderState(provider, { status: "connecting", authMethod: null, error: null })

      try {
        const res = await startOAuthApi(provider)

        if (res.status === "error") {
          setProviderState(provider, {
            status: "error",
            authMethod: null,
            error: res.message || "OAuth flow failed to start",
          })
          return
        }

        if (res.status === "started" && res.authUrl) {
          const popup = window.open(res.authUrl, "_blank", "width=600,height=700,popup=yes")
          if (!popup) {
            setProviderState(provider, {
              status: "error",
              authMethod: null,
              error: "Pop-up blocked. Please allow pop-ups for this site and try again.",
            })
            return
          }

          // Start polling for OAuth completion
          // CRITICAL (Pitfall 4): Backend auto-deletes session on first read after "ok"/"error".
          // Stop polling IMMEDIATELY on terminal state. Do NOT retry.
          const intervalId = setInterval(async () => {
            // Pitfall 2: Check if this interval is still active before acting on results
            if (!pollingRef.current.has(provider)) return

            try {
              const data = await fetchOAuthStatus(provider)

              // Re-check after async call — interval may have been cancelled during fetch
              if (!pollingRef.current.has(provider)) return

              if (data.status === "ok") {
                stopPolling(provider)
                await refreshStatus(provider)
              } else if (data.status === "error") {
                stopPolling(provider)
                setProviderState(provider, {
                  status: "error",
                  authMethod: null,
                  error: data.message || "OAuth authorization failed",
                })
              }
              // "pending" or "none": continue polling (no action)
            } catch {
              // Network error during polling — continue polling, don't break the loop
            }
          }, 2000)

          pollingRef.current.set(provider, intervalId)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Network error"
        setProviderState(provider, { status: "error", authMethod: null, error: message })
      }
    },
    [setProviderState, stopPolling, refreshStatus]
  )

  const cancelOAuth = useCallback(
    (provider: Provider) => {
      stopPolling(provider)
      // D-06: reset to initial state, orphaned backend session expires naturally
      setProviderState(provider, { status: "disconnected", authMethod: null, error: null })
    },
    [stopPolling, setProviderState]
  )

  const disconnect = useCallback(
    async (provider: Provider) => {
      try {
        await disconnectProvider(provider)
      } catch {
        // Best-effort — clear local state regardless
      }
      // Also cancel any active polling for this provider
      stopPolling(provider)
      setProviderState(provider, { status: "disconnected", authMethod: null, error: null })
    },
    [stopPolling, setProviderState]
  )

  // Cleanup all polling intervals on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach((interval) => clearInterval(interval))
      pollingRef.current.clear()
    }
  }, [])

  return { getProviderAuth, connect, disconnect, refreshStatus, startOAuth, cancelOAuth }
}
