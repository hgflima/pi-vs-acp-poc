import { Hono } from "hono"
import { getModel, streamSimple } from "@mariozechner/pi-ai"
import { storeCredentials } from "../lib/credentials"

const authRoutes = new Hono()

authRoutes.post("/apikey", async (c) => {
  const { provider, key } = await c.req.json<{
    provider: "anthropic" | "openai"
    key: string
  }>()

  if (!provider || !key) {
    return c.json({ status: "error", message: "Provider and key are required" }, 400)
  }

  try {
    const model = getModel(provider, getTestModel(provider))
    const stream = streamSimple(
      model,
      {
        systemPrompt: "Reply with OK",
        messages: [{ role: "user", content: "test", timestamp: Date.now() }],
      },
      { apiKey: key }
    )

    // Consume stream to completion to validate the key works
    await stream.result()

    // Store credentials in-memory (per AUTH-03: never returned to frontend)
    storeCredentials(provider, key)

    return c.json({ status: "ok", provider })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid API key"
    return c.json({ status: "error", message }, 401)
  }
})

function getTestModel(provider: "anthropic" | "openai") {
  // Use cheapest model for validation
  return provider === "anthropic" ? "claude-3-5-haiku" : "gpt-4o-mini"
}

export { authRoutes }
