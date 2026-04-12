import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import type { HarnessState, HarnessResult } from "@/client/lib/types"
import { loadHarness as loadHarnessApi, clearHarnessApi } from "@/client/lib/api"

interface HarnessContextValue {
  harness: HarnessState
  loading: boolean
  error: string | null
  loadHarness: (directory: string) => Promise<HarnessResult | null>
  clearHarness: () => Promise<void>
  harnessRevision: number
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
  const [harnessRevision, setHarnessRevision] = useState(0)

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

  // File watcher SSE — re-fetch harness data on file changes
  const eventSourceRef = useRef<EventSource | null>(null)
  const directoryRef = useRef<string | null>(null)
  directoryRef.current = harness.directory

  useEffect(() => {
    if (!harness.applied || !harness.directory) {
      // Clean up existing connection if harness is cleared
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    // Open SSE connection to watcher
    const es = new EventSource("/api/harness/watch")
    eventSourceRef.current = es

    es.addEventListener("file_changed", () => {
      // Re-fetch harness data when files change
      const dir = directoryRef.current
      if (dir) {
        loadHarnessApi(dir)
          .then((result) => {
            setHarness({ applied: true, directory: dir, result })
          })
          .catch(() => {
            // Silently ignore re-fetch errors
          })
      }
    })

    es.addEventListener("discovery_invalidated", () => {
      setHarnessRevision((prev) => prev + 1)
    })

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [harness.applied, harness.directory])

  const contextValue: HarnessContextValue = {
    harness,
    loading,
    error,
    loadHarness,
    clearHarness,
    harnessRevision,
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
