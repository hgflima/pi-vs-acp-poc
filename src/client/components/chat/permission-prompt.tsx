import { Button } from "@/client/components/ui/button"
import type { PermissionOption } from "@agentclientprotocol/sdk"

export interface PermissionPromptProps {
  id: string
  toolCallId: string
  options: PermissionOption[]
  onRespond: (id: string, response: Record<string, unknown>) => Promise<boolean>
}

function variantFor(kind: PermissionOption["kind"]): "default" | "secondary" | "destructive" | "outline" {
  switch (kind) {
    case "allow_once":
      return "default"
    case "allow_always":
      return "secondary"
    case "reject_once":
      return "outline"
    case "reject_always":
      return "destructive"
    default:
      return "outline"
  }
}

export function PermissionPrompt({ id, toolCallId, options, onRespond }: PermissionPromptProps) {
  const handleClick = (optionId: string) => {
    void onRespond(id, { outcome: "selected", optionId })
  }

  return (
    <div className="my-3 rounded-md border border-border bg-card p-3 text-card-foreground">
      <div className="text-xs text-muted-foreground mb-2">
        Permission requested for tool call <code className="font-mono">{toolCallId}</code>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Button
            key={opt.optionId}
            size="sm"
            variant={variantFor(opt.kind)}
            onClick={() => handleClick(opt.optionId)}
          >
            {opt.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
