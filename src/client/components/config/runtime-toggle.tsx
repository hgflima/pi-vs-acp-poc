import { useState } from "react"
import { Terminal, Sparkles, ChevronDown, CircleAlert } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/client/components/ui/popover"
import { Separator } from "@/client/components/ui/separator"
import type { RuntimeMode } from "@/client/hooks/use-runtime"
import type { AcpStatus } from "@/client/lib/api"

interface RuntimeToggleProps {
  runtime: RuntimeMode
  acpAgent: string | null
  acpStatus: AcpStatus
  acpLoading: boolean
  acpError: string | null
  onRuntimeSwitch: (mode: RuntimeMode) => void
  onAcpAgentSwitch: (id: string) => void
  onRefreshAcpStatus: () => void
}

export function RuntimeToggle({
  runtime,
  acpAgent,
  acpStatus,
  acpLoading,
  acpError,
  onRuntimeSwitch,
  onAcpAgentSwitch,
  onRefreshAcpStatus,
}: RuntimeToggleProps) {
  const [open, setOpen] = useState(false)

  const acpEntries = Object.entries(acpStatus)
  const anyAcpAvailable = acpEntries.some(([, ok]) => ok)

  const handleRuntimeClick = (mode: RuntimeMode) => {
    if (mode === "acp" && !anyAcpAvailable) return
    onRuntimeSwitch(mode)
  }

  const handleAcpAgentClick = (id: string) => {
    onAcpAgentSwitch(id)
    setOpen(false)
  }

  const label = runtime === "acp" ? acpAgent ?? "ACP" : "PI"
  const Icon = runtime === "acp" ? Terminal : Sparkles

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) onRefreshAcpStatus()
      }}
    >
      <PopoverTrigger render={<button type="button" />}>
        <span className="flex items-center gap-1.5 hover:bg-accent rounded-md px-2 py-1 transition-colors">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-4" align="start">
        <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Runtime</p>
        <div className="space-y-0.5">
          <button
            type="button"
            className={`flex items-center w-full px-3 h-9 rounded-md text-sm hover:bg-accent ${
              runtime === "pi" ? "bg-accent" : ""
            }`}
            onClick={() => handleRuntimeClick("pi")}
          >
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="ml-2 font-medium">PI (native)</span>
          </button>
          <button
            type="button"
            disabled={!anyAcpAvailable}
            className={`flex items-center w-full px-3 h-9 rounded-md text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed ${
              runtime === "acp" ? "bg-accent" : ""
            }`}
            onClick={() => handleRuntimeClick("acp")}
          >
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="ml-2 font-medium">ACP (subprocess)</span>
          </button>
        </div>

        {runtime === "acp" && (
          <>
            <Separator className="my-3" />
            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
              ACP Agent
            </p>
            {acpLoading ? (
              <div className="space-y-2">
                <div className="h-8 bg-muted animate-pulse rounded-md" />
                <div className="h-8 bg-muted animate-pulse rounded-md" />
              </div>
            ) : acpError ? (
              <div className="flex items-start gap-2 px-3 py-2 text-xs text-destructive">
                <CircleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{acpError}</span>
              </div>
            ) : acpEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-2">No ACP agents configured</p>
            ) : (
              <div className="space-y-0.5">
                {acpEntries.map(([id, ok]) => (
                  <button
                    key={id}
                    type="button"
                    disabled={!ok}
                    className={`flex items-center w-full px-3 h-8 rounded-md text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed ${
                      id === acpAgent ? "bg-accent" : ""
                    }`}
                    onClick={() => handleAcpAgentClick(id)}
                  >
                    <span>{id}</span>
                    {ok ? (
                      id === acpAgent && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-green-500" />
                      )
                    ) : (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        not in PATH
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
