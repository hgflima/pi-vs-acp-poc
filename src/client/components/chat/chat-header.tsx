import { Bot, Cpu, ChevronDown, Plus, Settings2 } from "lucide-react"
import { Link } from "react-router"
import { Button } from "@/client/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/client/components/ui/tooltip"
import { AgentModelPopover } from "@/client/components/config/agent-model-popover"
import type { AgentId, ModelInfo, Provider } from "@/client/lib/types"

interface ChatHeaderProps {
  onNewChat: () => void
  // Agent/model state from useAgent (passed down from ChatLayout)
  agentCurrent: AgentId
  agentModel: string | null
  agentLabel: string
  agentIcon: string
  availableModels: ModelInfo[]
  agentLoading: boolean
  needsAuth: boolean
  agentProvider: Provider
  onAgentSwitch: (id: AgentId) => void
  onModelSwitch: (modelId: string) => void
  onAuthenticate: (apiKey: string) => Promise<boolean>
  // Harness
  harnessApplied: boolean
}

function renderAgentIcon(iconName: string) {
  if (iconName === "Cpu") {
    return <Cpu className="h-4 w-4 text-muted-foreground" />
  }
  return <Bot className="h-4 w-4 text-muted-foreground" />
}

export function ChatHeader({
  onNewChat,
  agentCurrent,
  agentModel,
  agentLabel,
  agentIcon,
  availableModels,
  agentLoading,
  needsAuth,
  agentProvider,
  onAgentSwitch,
  onModelSwitch,
  onAuthenticate,
  harnessApplied,
}: ChatHeaderProps) {
  const popoverTrigger = (
    <span className="flex items-center gap-1.5 hover:bg-accent rounded-md px-2 py-1 transition-colors">
      {renderAgentIcon(agentIcon)}
      <span className="text-sm font-medium">{agentLabel}</span>
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
    </span>
  )

  return (
    <TooltipProvider>
      <header className="flex items-center justify-between h-14 px-4 border-b">
        <div className="flex items-center gap-2">
          <AgentModelPopover
            current={agentCurrent}
            model={agentModel}
            availableModels={availableModels}
            loading={agentLoading}
            needsAuth={needsAuth}
            provider={agentProvider}
            onAgentSwitch={onAgentSwitch}
            onModelSwitch={onModelSwitch}
            onAuthenticate={onAuthenticate}
            trigger={popoverTrigger}
          />
          {agentModel && (
            <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground">
              {agentModel}
            </span>
          )}
          {harnessApplied && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link to="/settings" className="inline-flex items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 cursor-pointer" />
                  </Link>
                }
              />
              <TooltipContent>Harness active -- click to open settings</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  to="/settings"
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent text-muted-foreground"
                >
                  <Settings2 className="h-4.5 w-4.5" />
                </Link>
              }
            />
            <TooltipContent>Harness settings</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="sm" onClick={onNewChat}>
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
      </header>
    </TooltipProvider>
  )
}
