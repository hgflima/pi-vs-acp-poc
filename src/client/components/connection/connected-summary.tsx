import { useNavigate } from "react-router"
import { Button } from "@/client/components/ui/button"
import { Badge } from "@/client/components/ui/badge"
import { ArrowRight, LogOut } from "lucide-react"
import type { AuthMethod } from "@/client/lib/types"

export type TokenHealth = "healthy" | "expiring" | "expired"

export function getTokenHealth(authMethod: AuthMethod | null, oauthExpiry?: number): TokenHealth {
  // D-10: API Key connections always healthy (green)
  if (authMethod !== "oauth") return "healthy"
  // No expiry data available — assume healthy
  if (!oauthExpiry) return "healthy"

  const now = Date.now()
  const thirtyMinMs = 30 * 60 * 1000

  // D-08: Red = expired, Yellow = expiring (<30 min), Green = healthy
  if (oauthExpiry <= now) return "expired"
  if (oauthExpiry - now <= thirtyMinMs) return "expiring"
  return "healthy"
}

const healthConfig = {
  healthy:  { label: "Connected", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  expiring: { label: "Expiring",  className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  expired:  { label: "Expired",   className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
} as const

interface ConnectedSummaryProps {
  authMethod: AuthMethod | null
  oauthExpiry?: number
  onDisconnect: () => void
  onReAuth: () => void
}

export function ConnectedSummary({ authMethod, oauthExpiry, onDisconnect, onReAuth }: ConnectedSummaryProps) {
  const navigate = useNavigate()
  const health = getTokenHealth(authMethod, oauthExpiry)
  const { label: healthLabel, className: healthClassName } = healthConfig[health]
  const isExpired = health === "expired"

  return (
    <div className="space-y-4">
      {/* Status heading */}
      <div className="text-center">
        <p className="text-sm font-semibold">
          {isExpired ? "Session Expired" : "Connected"}
        </p>
        {/* Auth method badge + health badge */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant="secondary">
            {authMethod === "oauth" ? "OAuth" : "API Key"}
          </Badge>
          <Badge className={healthClassName}>
            {healthLabel}
          </Badge>
        </div>
      </div>

      {/* Primary action: Go to Chat or Re-authenticate (D-13) */}
      {isExpired ? (
        <Button className="w-full" onClick={onReAuth}>
          Re-authenticate
        </Button>
      ) : (
        <Button className="w-full" onClick={() => navigate("/chat")}>
          Go to Chat <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}

      {/* Disconnect button — always available */}
      <Button variant="outline" className="w-full text-destructive" onClick={onDisconnect}>
        <LogOut className="mr-2 h-4 w-4" /> Disconnect
      </Button>
    </div>
  )
}
