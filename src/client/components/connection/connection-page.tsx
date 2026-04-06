import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/client/components/ui/tabs"
import { SegmentedControl } from "./segmented-control"
import { OAuthTab } from "./oauth-tab"
import { ApiKeyTab } from "./api-key-tab"
import { ConnectedSummary, getTokenHealth } from "./connected-summary"
import { useAuth } from "@/client/hooks/use-auth"
import type { Provider } from "@/client/lib/types"

export function ConnectionPage() {
  const [provider, setProvider] = useState<Provider>("anthropic")
  const [authMethod, setAuthMethod] = useState<"oauth" | "apiKey">("oauth") // D-02: OAuth default
  const { getProviderAuth, connect, disconnect, refreshStatus, startOAuth, cancelOAuth } = useAuth()
  const auth = getProviderAuth(provider)
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [, forceUpdate] = useState(0) // triggers re-render for health badge recalculation

  // On mount / provider change: refresh status to get latest oauthExpiry
  useEffect(() => {
    refreshStatus(provider)
  }, [provider, refreshStatus])

  // Periodic health re-evaluation (Pitfall 5): 60s timer for OAuth badge transitions
  useEffect(() => {
    if (auth.status === "connected" && auth.authMethod === "oauth") {
      healthTimerRef.current = setInterval(() => {
        forceUpdate(c => c + 1)
      }, 60_000)
    }
    return () => {
      if (healthTimerRef.current) {
        clearInterval(healthTimerRef.current)
        healthTimerRef.current = null
      }
    }
  }, [auth.status, auth.authMethod])

  const isConnected = auth.status === "connected"
  const isPolling = auth.status === "connecting" && authMethod === "oauth"
  // getTokenHealth used for health badge — computed on each render
  void getTokenHealth(auth.authMethod, auth.oauthExpiry)

  const handleStartOAuth = () => startOAuth(provider)
  const handleCancelOAuth = () => cancelOAuth(provider)
  const handleConnect = async (apiKey: string) => { await connect(provider, apiKey) }
  const handleDisconnect = async () => { await disconnect(provider) }
  const handleReAuth = () => { startOAuth(provider) }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Pi AI Chat</CardTitle>
          <CardDescription>Connect to your LLM provider to start chatting</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider selector — disabled during polling (D-05) and when connected */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Provider</label>
            <SegmentedControl
              value={provider}
              onChange={setProvider}
              disabled={isPolling || isConnected}
            />
          </div>

          {/* Connected summary — shown above tabs when connected (D-11) */}
          {isConnected && (
            <ConnectedSummary
              authMethod={auth.authMethod}
              oauthExpiry={auth.oauthExpiry}
              onDisconnect={handleDisconnect}
              onReAuth={handleReAuth}
            />
          )}

          {/* Auth method tabs — ALWAYS rendered (D-01, D-12).
              When connected, tabs remain visible below ConnectedSummary so user
              can switch auth method without disconnecting first. */}
          <Tabs value={authMethod} onValueChange={(v) => setAuthMethod(v as "oauth" | "apiKey")}>
            <TabsList className="w-full">
              <TabsTrigger value="oauth" disabled={isPolling} className="flex-1">OAuth</TabsTrigger>
              <TabsTrigger value="apiKey" disabled={isPolling} className="flex-1">API Key</TabsTrigger>
            </TabsList>
            <TabsContent value="oauth" className="mt-4">
              <OAuthTab
                provider={provider}
                status={auth.status}
                error={auth.error}
                onStartOAuth={handleStartOAuth}
                onCancelOAuth={handleCancelOAuth}
              />
            </TabsContent>
            <TabsContent value="apiKey" className="mt-4">
              <ApiKeyTab
                provider={provider}
                status={auth.status}
                error={auth.error}
                onConnect={handleConnect}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
