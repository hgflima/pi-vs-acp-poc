import { AlertCircle, RotateCcw, X } from "lucide-react"
import { Button } from "@/client/components/ui/button"

interface ErrorDisplayProps {
  error: string
  onRetry: () => void
  onDismiss: () => void
}

export function ErrorDisplay({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
      <p className="flex-1 text-sm text-destructive">{error}</p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onDismiss} aria-label="Dismiss error">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
