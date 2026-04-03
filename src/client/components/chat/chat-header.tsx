import { Sparkles, Plus } from "lucide-react"
import { Button } from "@/client/components/ui/button"

interface ChatHeaderProps {
  onNewChat: () => void
}

export function ChatHeader({ onNewChat }: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between h-14 px-4 border-b">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Claude Code</span>
        <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground">
          claude-sonnet-4-20250514
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={onNewChat}>
        <Plus className="h-4 w-4" />
        New Chat
      </Button>
    </header>
  )
}
