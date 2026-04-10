import { useCallback, useEffect, useState } from "react"
import { fetchAcpStatus, type AcpStatus } from "@/client/lib/api"

export type RuntimeMode = "pi" | "acp"

const RUNTIME_KEY = "pi-ai-poc:runtime"
const ACP_AGENT_KEY = "pi-ai-poc:acpAgent"

function loadStoredRuntime(): RuntimeMode {
  try {
    const v = localStorage.getItem(RUNTIME_KEY)
    return v === "acp" ? "acp" : "pi"
  } catch {
    return "pi"
  }
}

function loadStoredAcpAgent(): string | null {
  try {
    return localStorage.getItem(ACP_AGENT_KEY)
  } catch {
    return null
  }
}

export interface UseRuntimeReturn {
  runtime: RuntimeMode
  acpAgent: string | null
  acpStatus: AcpStatus
  acpLoading: boolean
  acpError: string | null
  availableAcpAgents: string[]
  setRuntime: (mode: RuntimeMode) => void
  setAcpAgent: (id: string) => void
  refreshAcpStatus: () => Promise<void>
}

export function useRuntime(): UseRuntimeReturn {
  const [runtime, setRuntimeState] = useState<RuntimeMode>(loadStoredRuntime)
  const [acpAgent, setAcpAgentState] = useState<string | null>(loadStoredAcpAgent)
  const [acpStatus, setAcpStatus] = useState<AcpStatus>({})
  const [acpLoading, setAcpLoading] = useState(false)
  const [acpError, setAcpError] = useState<string | null>(null)

  const refreshAcpStatus = useCallback(async () => {
    setAcpLoading(true)
    setAcpError(null)
    try {
      const status = await fetchAcpStatus()
      setAcpStatus(status)
    } catch (err) {
      setAcpError(err instanceof Error ? err.message : "Failed to load ACP status")
      setAcpStatus({})
    } finally {
      setAcpLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshAcpStatus()
  }, [refreshAcpStatus])

  // Auto-pick first available ACP agent if none chosen yet (or stored one is gone)
  useEffect(() => {
    const available = Object.entries(acpStatus)
      .filter(([, ok]) => ok)
      .map(([id]) => id)
    if (available.length === 0) return
    if (!acpAgent || !available.includes(acpAgent)) {
      const next = available[0]
      setAcpAgentState(next)
      try {
        localStorage.setItem(ACP_AGENT_KEY, next)
      } catch {
        /* ignore */
      }
    }
  }, [acpStatus, acpAgent])

  const setRuntime = useCallback((mode: RuntimeMode) => {
    setRuntimeState(mode)
    try {
      localStorage.setItem(RUNTIME_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [])

  const setAcpAgent = useCallback((id: string) => {
    setAcpAgentState(id)
    try {
      localStorage.setItem(ACP_AGENT_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  const availableAcpAgents = Object.entries(acpStatus)
    .filter(([, ok]) => ok)
    .map(([id]) => id)

  return {
    runtime,
    acpAgent,
    acpStatus,
    acpLoading,
    acpError,
    availableAcpAgents,
    setRuntime,
    setAcpAgent,
    refreshAcpStatus,
  }
}
