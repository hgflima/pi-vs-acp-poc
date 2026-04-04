import { useState, useCallback } from "react"
import { Link, useNavigate } from "react-router"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { useHarness } from "@/client/hooks/use-harness"
import { HarnessPicker } from "./harness-picker"
import { HarnessFileStatus } from "./harness-file-status"
import type { HarnessResult } from "@/client/lib/types"

function getFileStatus(
  file: { content: string; size: number } | null,
  errors: Array<{ file: string; error: string }>,
  name: string
): "found" | "not-found" | "error" | "too-large" {
  if (file) return "found"
  const err = errors.find((e) => e.file === name)
  if (err) {
    if (err.error.toLowerCase().includes("too large")) return "too-large"
    return "error"
  }
  return "not-found"
}

function getFileError(
  errors: Array<{ file: string; error: string }>,
  name: string
): string | undefined {
  return errors.find((e) => e.file === name)?.error
}

export function SettingsPage() {
  const { harness, loading, error, loadHarness, clearHarness } = useHarness()
  const navigate = useNavigate()

  const [directory, setDirectory] = useState(harness.directory ?? "")
  const [discoveredResult, setDiscoveredResult] = useState<HarnessResult | null>(
    harness.result
  )

  const handleDirectoryChange = useCallback(
    async (dir: string) => {
      setDirectory(dir)
      if (dir) {
        const result = await loadHarness(dir)
        if (result) {
          setDiscoveredResult(result)
        }
      } else {
        setDiscoveredResult(null)
      }
    },
    [loadHarness]
  )

  const handleBrowse = useCallback(() => {
    // Use showDirectoryPicker if available (Chrome/Edge), fallback to no-op
    if ("showDirectoryPicker" in window) {
      ;(window as unknown as { showDirectoryPicker: () => Promise<{ name: string }> })
        .showDirectoryPicker()
        .then((handle) => {
          // Browser only gives folder name, not full path -- populate for UX hint
          setDirectory(handle.name)
        })
        .catch(() => {
          // User cancelled or API not supported
        })
    }
  }, [])

  const handleLoadHarness = useCallback(async () => {
    if (!directory) return
    const result = await loadHarness(directory)
    if (result) {
      navigate("/chat")
    }
  }, [directory, loadHarness, navigate])

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header bar */}
      <header className="flex h-14 items-center px-4 border-b shrink-0">
        <Link
          to="/chat"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Chat
        </Link>
      </header>

      {/* Content area */}
      <div className="max-w-[520px] mx-auto px-6 pt-8 pb-8 w-full">
        <h1 className="text-xl font-medium">Harness Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Load project files to customize agent behavior.
        </p>

        {/* Directory picker section */}
        <div className="mt-6">
          <label className="text-sm font-medium">Project Directory</label>
          <div className="mt-1">
            <HarnessPicker
              directory={directory}
              onDirectoryChange={handleDirectoryChange}
              onBrowse={handleBrowse}
            />
          </div>
        </div>

        {/* Discovered files section */}
        {discoveredResult && (
          <div className="mt-6">
            <h2 className="text-sm font-medium mb-2">Discovered Files</h2>
            <div className="space-y-0.5 rounded-lg border p-1">
              <HarnessFileStatus
                filename="CLAUDE.md"
                status={getFileStatus(
                  discoveredResult.claudeMd,
                  discoveredResult.errors,
                  "CLAUDE.md"
                )}
                size={discoveredResult.claudeMd?.size}
                error={getFileError(discoveredResult.errors, "CLAUDE.md")}
              />
              <HarnessFileStatus
                filename="AGENTS.md"
                status={getFileStatus(
                  discoveredResult.agentsMd,
                  discoveredResult.errors,
                  "AGENTS.md"
                )}
                size={discoveredResult.agentsMd?.size}
                error={getFileError(discoveredResult.errors, "AGENTS.md")}
              />
              <HarnessFileStatus
                filename="skills/"
                status={discoveredResult.skills ? "found-dir" : "not-found"}
                count={discoveredResult.skills?.count}
              />
              <HarnessFileStatus
                filename="hooks/"
                status={discoveredResult.hooks ? "found-dir" : "not-found"}
                count={discoveredResult.hooks?.count}
              />
            </div>
          </div>
        )}

        {/* Error display */}
        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

        {/* Action buttons */}
        <div className="mt-6 flex justify-center gap-3">
          <Button
            variant="default"
            disabled={!discoveredResult || loading}
            onClick={handleLoadHarness}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load Harness"
            )}
          </Button>
          {harness.applied && (
            <Button variant="ghost" onClick={clearHarness}>
              Clear Harness
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
