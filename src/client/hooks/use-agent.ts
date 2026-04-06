import { useState, useCallback, useEffect } from "react"
import type { AgentId, AgentConfig, ModelInfo, Provider } from "@/client/lib/types"
import { AGENT_CONFIG } from "@/client/lib/types"
import { fetchModels, connectProvider, fetchAuthStatus } from "@/client/lib/api"

interface UseAgentReturn {
  current: AgentId
  model: string | null
  provider: Provider
  label: string
  icon: string
  availableModels: ModelInfo[]
  loading: boolean
  needsAuth: boolean
  connectedAgents: Set<AgentId>
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
  const [connectedAgents, setConnectedAgents] = useState<Set<AgentId>>(new Set())

  // On mount: check which providers are authenticated and auto-select the right agent
  useEffect(() => {
    let cancelled = false

    Promise.all(
      (Object.entries(AGENT_CONFIG) as [AgentId, AgentConfig][]).map(
        async ([id, config]) => {
          try {
            const status = await fetchAuthStatus(config.provider)
            return { id, connected: status.hasApiKey || status.hasOAuth }
          } catch {
            return { id, connected: false }
          }
        }
      )
    ).then((results) => {
      if (cancelled) return

      const connected = new Set<AgentId>()
      for (const { id, connected: isConnected } of results) {
        if (isConnected) connected.add(id)
      }
      setConnectedAgents(connected)

      // If default agent is not connected but another is, switch to the connected one
      if (!connected.has("claude-code") && connected.size > 0) {
        const first = [...connected][0]
        setCurrent(first)
        setModel(AGENT_CONFIG[first].defaultModel)
      }
    })

    return () => { cancelled = true }
  }, [])

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
      setConnectedAgents((prev) => new Set([...prev, current]))
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
    connectedAgents,
    switchAgent,
    switchModel,
    authenticate,
    clearNeedsAuth,
  }
}
