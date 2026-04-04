import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card"
import { Input } from "@/client/components/ui/input"
import { Button } from "@/client/components/ui/button"
import { SegmentedControl } from "./segmented-control"
import { useAuth } from "@/client/hooks/use-auth"
import type { Provider } from "@/client/lib/types"
import { Loader2, Check, Eye, EyeOff } from "lucide-react"

export function ConnectionPage() {
  const navigate = useNavigate()
  const [provider, setProvider] = useState<Provider>("anthropic")
  const { getProviderAuth, connect } = useAuth()
  const auth = getProviderAuth(provider)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)

  // Auto-redirect after successful connection (D-04)
  useEffect(() => {
    if (auth.status === "connected") {
      const timer = setTimeout(() => navigate("/chat"), 1500)
      return () => clearTimeout(timer)
    }
  }, [auth.status, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) return
    await connect(provider, apiKey)
  }

  const isConnecting = auth.status === "connecting"
  const isConnected = auth.status === "connected"
  const hasError = auth.status === "error"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Pi AI Chat</CardTitle>
          <CardDescription>Connect to your LLM provider to start chatting</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Provider selection (D-01) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <SegmentedControl
                value={provider}
                onChange={setProvider}
                disabled={isConnecting || isConnected}
              />
            </div>

            {/* API Key input (D-02) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={isConnecting || isConnected}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Connect button with inline feedback (D-03, D-05) */}
            <Button
              type="submit"
              className="w-full"
              disabled={isConnecting || isConnected || !apiKey.trim()}
            >
              {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isConnected && <Check className="mr-2 h-4 w-4" />}
              {isConnecting ? "Connecting..." : isConnected ? "Connected!" : hasError ? "Try Again" : "Connect"}
            </Button>

            {/* Inline error feedback (D-03) */}
            {hasError && auth.error && (
              <p className="text-sm text-destructive text-center">{auth.error}</p>
            )}

            {/* Connected feedback (D-04) */}
            {isConnected && (
              <p className="text-sm text-green-600 text-center">
                Redirecting to chat...
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
