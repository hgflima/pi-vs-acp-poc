import { serve } from "@hono/node-server"
import { Hono } from "hono"

const app = new Hono()

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }))

// Auth routes will be mounted in Plan 03
// app.route("/api/auth", authRoutes)

const port = 3001
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Backend running on http://localhost:${info.port}`)
})

export { app }
