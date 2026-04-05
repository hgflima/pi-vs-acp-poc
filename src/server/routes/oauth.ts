import { Hono } from "hono"
import { loginAnthropic, loginOpenAICodex } from "@mariozechner/pi-ai/oauth"
import { createServer } from "node:http"
import { forceExpireOAuth, storeOAuthTokens, type Provider } from "../lib/credentials"

type SessionStatus = "pending" | "done" | "error"

interface PendingSession {
  authUrl: string
  status: SessionStatus
  error?: string
  startedAt: number
}

const pendingSessions = new Map<Provider, PendingSession>()
const ANTHROPIC_OAUTH_PORT = 53692
const OPENAI_OAUTH_PORT = 1455

async function ensurePortFree(port: number, host = "127.0.0.1"): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
    probe.once("error", (err: NodeJS.ErrnoException) => reject(err))
    probe.listen(port, host, () => {
      probe.close(() => resolve())
    })
  })
}

function portForProvider(provider: Provider): number {
  return provider === "anthropic" ? ANTHROPIC_OAUTH_PORT : OPENAI_OAUTH_PORT
}

function loginFnForProvider(provider: Provider) {
  return provider === "anthropic" ? loginAnthropic : loginOpenAICodex
}

function portConflictMessage(provider: Provider): string {
  if (provider === "anthropic") {
    return "Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again."
  }
  return "Port 1455 is already in use by another process. This port is required by the OpenAI Codex OAuth callback. If you have Codex CLI running, please stop it and try again."
}

const oauthRoutes = new Hono()

oauthRoutes.post("/start", async (c) => {
  const body = await c.req.json<{ provider?: Provider }>().catch(() => ({ provider: undefined }))
  const provider = body.provider

  if (provider !== "anthropic" && provider !== "openai") {
    return c.json(
      { status: "error", message: "Invalid provider. Use 'anthropic' or 'openai'." },
      400
    )
  }

  // D-03: discard any existing session for this provider (second /start aborts first)
  pendingSessions.delete(provider)

  // D-02: pre-check port 53692 before calling loginAnthropic
  try {
    await ensurePortFree(portForProvider(provider))
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === "EADDRINUSE") {
      return c.json(
        { status: "error", message: portConflictMessage(provider) },
        409
      )
    }
    return c.json(
      { status: "error", message: `Could not probe port ${portForProvider(provider)}: ${code ?? "unknown error"}` },
      500
    )
  }

  // Pattern 1: Promise resolver to capture auth URL from onAuth callback
  let resolveAuthUrl!: (url: string) => void
  let rejectAuthUrl!: (err: unknown) => void
  const authUrlPromise = new Promise<string>((resolve, reject) => {
    resolveAuthUrl = resolve
    rejectAuthUrl = reject
  })

  const session: PendingSession = {
    authUrl: "",
    status: "pending",
    startedAt: Date.now(),
  }
  pendingSessions.set(provider, session)

  // Pattern 4: Background promise lifecycle — not awaited in route handler
  const loginFn = loginFnForProvider(provider)
  loginFn({
    onAuth: (info) => resolveAuthUrl(info.url),
    onPrompt: async () => "",
    onProgress: (msg) => console.log(`[oauth:${provider}] ${msg}`),
  })
    .then((creds) => {
      storeOAuthTokens(provider, creds)
      // Guard: only update if this session is still the active one for the provider
      if (pendingSessions.get(provider) === session) {
        session.status = "done"
      }
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      if (pendingSessions.get(provider) === session) {
        session.status = "error"
        session.error = message
      }
      // Also unblock the authUrl wait if loginAnthropic rejects before onAuth fires
      rejectAuthUrl(err)
    })

  // Wait for onAuth to fire with the authorize URL (microseconds in practice)
  let authUrl: string
  try {
    authUrl = await authUrlPromise
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json(
      { status: "error", message: `OAuth flow failed to start: ${message}` },
      500
    )
  }

  session.authUrl = authUrl
  return c.json({ status: "started", provider, authUrl })
})

oauthRoutes.get("/status", (c) => {
  const provider = c.req.query("provider") as Provider | undefined
  if (!provider || !["anthropic", "openai"].includes(provider)) {
    return c.json(
      { status: "error", message: "Invalid provider. Use 'anthropic' or 'openai'." },
      400
    )
  }

  const session = pendingSessions.get(provider)
  if (!session) {
    return c.json({ status: "none", provider })
  }
  if (session.status === "pending") {
    return c.json({ status: "pending", provider, authUrl: session.authUrl })
  }
  if (session.status === "done") {
    // Clear on first read after completion (Phase 5's /api/auth/status is authoritative)
    pendingSessions.delete(provider)
    return c.json({ status: "ok", provider })
  }
  // session.status === "error"
  const errorMessage = session.error ?? "OAuth flow failed"
  pendingSessions.delete(provider)
  return c.json({ status: "error", provider, message: errorMessage })
})

export { oauthRoutes }
