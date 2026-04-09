import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { authRoutes } from "./routes/auth"
import { oauthRoutes } from "./routes/oauth"
import { chatRoutes } from "./routes/chat"
import { modelRoutes } from "./routes/models"
import { harnessRoutes } from "./routes/harness"

const app = new Hono()

// Allowed browser origins for state-changing requests (CSRF protection).
// The dev backend is only ever reached from the Vite dev server or the
// backend's own origin. Anything else (e.g. a browser fetch from a random
// site while the user is logged in) must be rejected.
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]

// Allowed Host header values (DNS-rebinding protection). If a request lands
// here with a Host we don't recognize — e.g. attacker.example.com resolving
// to 127.0.0.1 — refuse. Keeps the server pinned to loopback names.
const ALLOWED_HOSTS = new Set(["localhost:3001", "127.0.0.1:3001"])

app.use("*", async (c, next) => {
  const host = c.req.header("host")
  if (host && !ALLOWED_HOSTS.has(host)) {
    return c.json({ error: "Invalid host" }, 403)
  }

  const method = c.req.method
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = c.req.header("origin") ?? c.req.header("referer")
    if (!origin || !ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) {
      return c.json({ error: "Invalid origin" }, 403)
    }
  }

  await next()
})

// Routes
app.route("/api/auth", authRoutes)
app.route("/api/auth/oauth", oauthRoutes)
app.route("/api/chat", chatRoutes)
app.route("/api/models", modelRoutes)
app.route("/api/harness", harnessRoutes)

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }))

const port = 3001
const hostname = "127.0.0.1"
serve({ fetch: app.fetch, port, hostname }, (info) => {
  // Assert we actually bound to loopback. If @hono/node-server or the OS
  // ever surprises us with 0.0.0.0 / :: we want to fail loudly rather than
  // silently expose the backend to the LAN.
  if (info.address !== "127.0.0.1" && info.address !== "::1") {
    console.error(
      `FATAL: Backend bound to ${info.address}, expected 127.0.0.1 (loopback only).`
    )
    process.exit(1)
  }
  console.log(`Backend running on http://127.0.0.1:${info.port}`)
})

export { app }
