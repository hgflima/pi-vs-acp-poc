import { useState, useCallback, useEffect } from "react"
import type { AgentId, ModelInfo, Provider } from "@/client/lib/types"
import { AGENT_CONFIG } from "@/client/lib/types"
import { fetchModels, connectProvider } from "@/client/lib/api"

interface UseAgentReturn {
  current: AgentId
  model: string | null
  provider: Provider
  label: string
  icon: string
  availableModels: ModelInfo[]
  loading: boolean
  needsAuth: boolean
  switchAgent: (id: AgentId) => void
  switchModel: (modelId: string) => void
  authenticate: (apiKey: string) => Promise<boolean>
  clearNeedsAuth: () => void
}

export function useAgent(): UseAgentReturn {
  const [current, setCurrent] = useState<AgentId>("claude-code")
  const [model, setModel] = useState<string | null>(AGENT_CONFIG["claude-code"].defaultModel)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)

  const config = AGENT_CONFIG[current]
  const provider = config.provider
  const label = config.label
  const icon = config.icon

  // Fetch models when agent changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNeedsAuth(false)
    setAvailableModels([])

    fetchModels(provider)
      .then((data) => {
        if (cancelled) return
        if (data.needsAuth) {
          setNeedsAuth(true)
          setModel(null)
        } else {
          setAvailableModels(data.models)
          setModel(AGENT_CONFIG[current].defaultModel)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableModels([])
          setModel(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [current, provider])

  const switchAgent = useCallback((id: AgentId) => {
    setCurrent(id)
    // D-05: clearMessages is called by ChatLayout, not here
    // Model will be reset by the useEffect above
  }, [])

  const switchModel = useCallback((modelId: string) => {
    setModel(modelId)
    // D-05: clearMessages is called by ChatLayout, not here
  }, [])

  // Inline auth: authenticate the provider for the current agent (D-10)
  const authenticate = useCallback(async (apiKey: string): Promise<boolean> => {
    const success = await connectProvider(provider, apiKey)
      .then((res) => res.status === "ok")
      .catch(() => false)

    if (success) {
      setNeedsAuth(false)
      // Re-fetch models after successful auth
      setLoading(true)
      fetchModels(provider)
        .then((data) => {
          setAvailableModels(data.models)
          setModel(AGENT_CONFIG[current].defaultModel)
        })
        .catch(() => {
          setAvailableModels([])
        })
        .finally(() => setLoading(false))
    }

    return success
  }, [provider, current])

  const clearNeedsAuth = useCallback(() => {
    setNeedsAuth(false)
  }, [])

  return {
    current,
    model,
    provider,
    label,
    icon,
    availableModels,
    loading,
    needsAuth,
    switchAgent,
    switchModel,
    authenticate,
    clearNeedsAuth,
  }
}
