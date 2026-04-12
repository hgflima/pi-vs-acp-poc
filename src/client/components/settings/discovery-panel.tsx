import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import { useHarnessContext } from "@/client/contexts/harness-context"
import {
  fetchDiscoverySources,
  fetchPluginStatus,
  reloadDiscovery,
} from "@/client/lib/api"
import type {
  DiscoveryHarness,
  DiscoverySource,
  PluginStatus,
} from "@/client/lib/types"

const ACTIVE_DISCOVERY_HARNESS: DiscoveryHarness = "claude"

function shortenHomePath(input: string | null): string {
  if (!input) return "—"
  if (input.startsWith("/Users/")) {
    const afterUsers = input.slice("/Users/".length)
    const slash = afterUsers.indexOf("/")
    if (slash >= 0) return "~" + afterUsers.slice(slash)
  }
  return input
}

export function DiscoveryPanel() {
  const { harnessRevision } = useHarnessContext()
  const activeHarness: DiscoveryHarness = ACTIVE_DISCOVERY_HARNESS

  const [sources, setSources] = useState<DiscoverySource[]>([])
  const [plugins, setPlugins] = useState<PluginStatus[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [srcs, plgs] = await Promise.all([
        fetchDiscoverySources(activeHarness),
        fetchPluginStatus(activeHarness),
      ])
      setSources(srcs)
      setPlugins(plgs)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [activeHarness])

  useEffect(() => {
    if (activeHarness !== "claude") return
    void refetch()
  }, [activeHarness, harnessRevision, refetch])

  const handleReload = useCallback(async () => {
    setIsReloading(true)
    setError(null)
    try {
      await reloadDiscovery()
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsReloading(false)
    }
  }, [refetch])

  if (activeHarness !== "claude") {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Discovery disponível apenas para Claude Code harness.
      </div>
    )
  }

  const busy = isLoading || isReloading

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Discovery</h3>
          <p className="text-xs text-muted-foreground">
            Diagnóstico read-only das sources nativas e plugins do harness.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReload}
          disabled={busy}
        >
          {isReloading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
          Reload
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sources ({sources.length})
        </h4>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">Exists</th>
                <th className="px-3 py-2 font-medium text-right">Items</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && sources.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    <Loader2 className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : sources.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    Nenhuma source descoberta.
                  </td>
                </tr>
              ) : (
                sources.map((s, i) => (
                  <tr
                    key={`${s.path}-${i}`}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-1.5 font-mono">
                      {shortenHomePath(s.path)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline">{s.scope}</Badge>
                    </td>
                    <td className="px-3 py-1.5">
                      {s.exists ? (
                        <Badge variant="default">exists</Badge>
                      ) : (
                        <Badge variant="secondary">missing</Badge>
                      )}
                    </td>
                    <td
                      className={
                        "px-3 py-1.5 text-right tabular-nums " +
                        (s.itemsFound === 0
                          ? "text-muted-foreground/60"
                          : "")
                      }
                    >
                      {s.itemsFound}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Plugins ({plugins.length})
        </h4>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">Installed</th>
                <th className="px-3 py-2 font-medium">Enabled</th>
                <th className="px-3 py-2 font-medium">Enabled By</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && plugins.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    <Loader2 className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : plugins.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    Nenhum plugin encontrado.
                  </td>
                </tr>
              ) : (
                plugins.map((p) => {
                  const installed = Boolean(p.installPath)
                  return (
                    <tr
                      key={`${p.scope}-${p.pluginKey}`}
                      className={
                        "border-t border-border " +
                        (installed ? "" : "opacity-60")
                      }
                    >
                      <td className="px-3 py-1.5 font-mono">{p.pluginKey}</td>
                      <td className="px-3 py-1.5">{p.pluginName}</td>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline">{p.scope}</Badge>
                      </td>
                      <td className="px-3 py-1.5">
                        {installed ? (
                          <Badge variant="default">installed</Badge>
                        ) : (
                          <Badge variant="destructive">not installed</Badge>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {p.enabled ? (
                          <Badge variant="default">enabled</Badge>
                        ) : (
                          <Badge variant="destructive">disabled</Badge>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">
                        {shortenHomePath(p.enabledBy)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
