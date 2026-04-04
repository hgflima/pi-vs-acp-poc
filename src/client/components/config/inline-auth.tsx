import { useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Input } from "@/client/components/ui/input"
import { Button } from "@/client/components/ui/button"
import type { Provider } from "@/client/lib/types"

interface InlineAuthProps {
  provider: Provider
  onConnect: (apiKey: string) => Promise<boolean>
}

export function InlineAuth({ provider, onConnect }: InlineAuthProps) {
  const [apiKey, setApiKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const providerLabel = provider === "anthropic" ? "Anthropic" : "OpenAI"
  const placeholder = provider === "anthropic" ? "sk-ant-..." : "sk-..."

  const handleSubmit = async () => {
    if (!apiKey.trim() || saving) return
    setSaving(true)
    setError(null)

    const success = await onConnect(apiKey)
    if (!success) {
      setError("Invalid API key. Check your key and try again.")
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
        <span className="text-sm font-medium">{providerLabel} API key required</span>
      </div>
      <Input
        type="password"
        placeholder={placeholder}
        value={apiKey}
        onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
        aria-label="API key"
        disabled={saving}
      />
      <Button
        variant="default"
        className="w-full"
        onClick={handleSubmit}
        disabled={saving || !apiKey.trim()}
        aria-busy={saving}
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save API Key"
        )}
      </Button>
      {error && (
        <p className="text-red-500 text-xs" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  )
}
