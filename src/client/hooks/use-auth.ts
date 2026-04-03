import { useState, useCallback } from "react"
import type { AuthState, Provider } from "@/client/lib/types"
import { connectProvider } from "@/client/lib/api"

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({
    status: "disconnected",
    provider: null,
    error: null,
  })

  const connect = useCallback(async (provider: Provider, apiKey: string) => {
    setAuth({ status: "connecting", provider, error: null })

    try {
      const data = await connectProvider(provider, apiKey)

      if (data.status === "ok") {
        setAuth({ status: "connected", provider, error: null })
        return true
      } else {
        setAuth({ status: "error", provider, error: data.message || "Connection failed" })
        return false
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error"
      setAuth({ status: "error", provider, error: message })
      return false
    }
  }, [])

  const disconnect = useCallback(() => {
    setAuth({ status: "disconnected", provider: null, error: null })
  }, [])

  return { auth, connect, disconnect }
}
