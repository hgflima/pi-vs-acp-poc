import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { HarnessState, HarnessResult } from "@/client/lib/types"
import { loadHarness as loadHarnessApi, clearHarnessApi } from "@/client/lib/api"

interface HarnessContextValue {
  harness: HarnessState
  loading: boolean
  error: string | null
  loadHarness: (directory: string) => Promise<HarnessResult | null>
  clearHarness: () => Promise<void>
}

const HarnessContext = createContext<HarnessContextValue | null>(null)

export function HarnessProvider({ children }: { children: ReactNode }) {
  const [harness, setHarness] = useState<HarnessState>({
    applied: false,
    directory: null,
    result: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHarness = useCallback(async (directory: string): Promise<HarnessResult | null> => {
    setLoading(true)
    setError(null)

    try {
      const result = await loadHarnessApi(directory)
      setHarness({
        applied: true,
        directory,
        result,
      })
      setLoading(false)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load harness"
      setError(msg)
      setLoading(false)
      return null
    }
  }, [])

  const clearHarness = useCallback(async () => {
    await clearHarnessApi().catch(() => {})
    setHarness({ applied: false, directory: null, result: null })
    setError(null)
  }, [])

  const contextValue: HarnessContextValue = {
    harness,
    loading,
    error,
    loadHarness,
    clearHarness,
  }

  return (
    <HarnessContext value={contextValue}>
      {children}
    </HarnessContext>
  )
}

export function useHarnessContext(): HarnessContextValue {
  const context = useContext(HarnessContext)
  if (!context) {
    throw new Error("useHarnessContext must be used within a HarnessProvider")
  }
  return context
}
