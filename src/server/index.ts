import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { authRoutes } from "./routes/auth"
import { chatRoutes } from "./routes/chat"

const app = new Hono()

// Auth routes
app.route("/api/auth", authRoutes)
app.route("/api/chat", chatRoutes)

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }))

const port = 3001
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Backend running on http://localhost:${info.port}`)
})

export { app }
