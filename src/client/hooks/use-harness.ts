import { useHarnessContext } from "@/client/contexts/harness-context"
import type { HarnessState, HarnessResult } from "@/client/lib/types"

interface UseHarnessReturn {
  harness: HarnessState
  loading: boolean
  error: string | null
  loadHarness: (directory: string) => Promise<HarnessResult | null>
  clearHarness: () => Promise<void>
}

export function useHarness(): UseHarnessReturn {
  return useHarnessContext()
}
