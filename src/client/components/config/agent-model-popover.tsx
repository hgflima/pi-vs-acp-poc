import { useState } from "react"
import { Bot, Cpu } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/client/components/ui/popover"
import { Separator } from "@/client/components/ui/separator"
import { InlineAuth } from "@/client/components/config/inline-auth"
import type { AgentId, ModelInfo, Provider } from "@/client/lib/types"
import { AGENT_CONFIG } from "@/client/lib/types"

interface AgentModelPopoverProps {
  current: AgentId
  model: string | null
  availableModels: ModelInfo[]
  loading: boolean
  needsAuth: boolean
  provider: Provider
  onAgentSwitch: (id: AgentId) => void
  onModelSwitch: (modelId: string) => void
  onAuthenticate: (apiKey: string) => Promise<boolean>
  trigger: React.ReactNode
}

function AgentIcon({ name, className }: { name: string; className?: string }) {
  if (name === "Cpu") return <Cpu className={className} />
  return <Bot className={className} />
}

export function AgentModelPopover({
  current,
  model,
  availableModels,
  loading,
  needsAuth,
  provider,
  onAgentSwitch,
  onModelSwitch,
  onAuthenticate,
  trigger,
}: AgentModelPopoverProps) {
  const [open, setOpen] = useState(false)

  const handleAgentClick = (id: AgentId) => {
    onAgentSwitch(id)
    setOpen(false)
  }

  const handleModelClick = (modelId: string) => {
    onModelSwitch(modelId)
    setOpen(false)
  }

  const handleAuth = async (apiKey: string): Promise<boolean> => {
    const success = await onAuthenticate(apiKey)
    // On success: don't close popover -- models will load, user picks one
    return success
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button type="button" />}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-4" align="start">
        {/* Agent section */}
        <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
          Agent
        </p>
        <div className="space-y-0.5">
          {(Object.entries(AGENT_CONFIG) as [AgentId, typeof AGENT_CONFIG[AgentId]][]).map(
            ([id, config]) => (
              <button
                key={id}
                type="button"
                className={`flex items-center w-full px-3 h-9 rounded-md text-sm hover:bg-accent ${
                  id === current ? "bg-accent" : ""
                }`}
                onClick={() => handleAgentClick(id)}
              >
                <AgentIcon
                  name={config.icon}
                  className="h-4 w-4 text-muted-foreground"
                />
                <span className="ml-2 font-medium">{config.label}</span>
                {id === current && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-green-500" />
                )}
              </button>
            ),
          )}
        </div>

        <Separator className="my-3" />

        {/* Model section */}
        {needsAuth ? (
          <InlineAuth provider={provider} onConnect={handleAuth} />
        ) : loading ? (
          <div className="space-y-2">
            <div className="h-8 bg-muted animate-pulse rounded-md" />
            <div className="h-8 bg-muted animate-pulse rounded-md" />
            <div className="h-8 bg-muted animate-pulse rounded-md" />
          </div>
        ) : availableModels.length === 0 ? (
          <p className="text-sm text-muted-foreground px-3 py-2">
            No models available
          </p>
        ) : (
          <>
            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
              Model
            </p>
            <div className="max-h-[240px] overflow-y-auto space-y-0.5">
              {availableModels.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`flex items-center w-full px-3 h-8 rounded-md text-sm hover:bg-accent ${
                    m.id === model ? "bg-accent" : ""
                  }`}
                  onClick={() => handleModelClick(m.id)}
                >
                  <span>{m.name}</span>
                  {m.id === model && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-green-500" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
