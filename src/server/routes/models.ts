import { Hono } from "hono"
import { getModels } from "@mariozechner/pi-ai"
import { hasAnyCredential } from "../lib/credentials"

const modelRoutes = new Hono()

modelRoutes.get("/", (c) => {
  const provider = c.req.query("provider")

  if (!provider || !["anthropic", "openai"].includes(provider)) {
    return c.json({ error: "Invalid provider. Use 'anthropic' or 'openai'." }, 400)
  }

  const typedProvider = provider as "anthropic" | "openai"

  if (!hasAnyCredential(typedProvider)) {
    return c.json({ error: "Not authenticated", needsAuth: true }, 401)
  }

  const models = getModels(provider)
  return c.json({
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
    })),
  })
})

export { modelRoutes }
