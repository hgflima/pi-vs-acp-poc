import { useState } from "react"
import { Input } from "@/client/components/ui/input"
import { Button } from "@/client/components/ui/button"
import { Loader2, Eye, EyeOff } from "lucide-react"
import type { Provider, AuthStatus } from "@/client/lib/types"

interface ApiKeyTabProps {
  provider: Provider
  status: AuthStatus
  error: string | null
  onConnect: (apiKey: string) => void
}

export function ApiKeyTab({ provider, status, error, onConnect }: ApiKeyTabProps) {
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)

  const isConnecting = status === "connecting"
  const hasError = status === "error"

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) return
    onConnect(apiKey)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-semibold">API Key</label>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isConnecting}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showKey ? "Hide API key" : "Show API key"}
            tabIndex={-1}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isConnecting || !apiKey.trim()}
      >
        {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isConnecting ? "Connecting..." : hasError ? "Try Again" : "Connect API Key"}
      </Button>

      {hasError && error && (
        <p className="text-sm text-destructive text-center" aria-live="polite">
          {error}
        </p>
      )}
    </form>
  )
}
