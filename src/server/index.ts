import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { authRoutes } from "./routes/auth"
import { oauthRoutes } from "./routes/oauth"
import { chatRoutes } from "./routes/chat"
import { modelRoutes } from "./routes/models"
import { harnessRoutes } from "./routes/harness"

const app = new Hono()

// Routes
app.route("/api/auth", authRoutes)
app.route("/api/auth/oauth", oauthRoutes)
app.route("/api/chat", chatRoutes)
app.route("/api/models", modelRoutes)
app.route("/api/harness", harnessRoutes)

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }))

const port = 3001
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Backend running on http://localhost:${info.port}`)
})

export { app }
