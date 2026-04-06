import { Button } from "@/client/components/ui/button"
import { Loader2, ExternalLink } from "lucide-react"
import type { Provider, AuthStatus } from "@/client/lib/types"

interface OAuthTabProps {
  provider: Provider
  status: AuthStatus
  error: string | null
  onStartOAuth: () => void
  onCancelOAuth: () => void
}

export function OAuthTab({ provider, status, error, onStartOAuth, onCancelOAuth }: OAuthTabProps) {
  const isPolling = status === "connecting"
  const hasError = status === "error"
  const buttonLabel = provider === "anthropic" ? "Login with Claude" : "Login with Codex"

  if (isPolling) {
    return (
      <div className="space-y-3 text-center">
        <Button
          variant="secondary"
          className="w-full"
          disabled
          aria-busy="true"
          aria-disabled="true"
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Waiting for authorization...
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground underline"
          onClick={onCancelOAuth}
        >
          Cancel authorization
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-center">
      <Button className="w-full" onClick={onStartOAuth}>
        {buttonLabel}
        <ExternalLink className="ml-2 h-4 w-4" />
      </Button>
      {hasError && error && (
        <p className="text-sm text-destructive text-center" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  )
}
