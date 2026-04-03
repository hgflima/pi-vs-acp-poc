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

    if (!model) {
      return c.json({ status: "error", message: "Could not validate: unsupported provider configuration" }, 500)
    }

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
    const raw = error instanceof Error ? error.message : String(error)

    // Map known API error patterns to user-friendly messages
    let message: string
    if (raw.includes("401") || raw.toLowerCase().includes("invalid") || raw.toLowerCase().includes("unauthorized") || raw.toLowerCase().includes("authentication")) {
      message = "Invalid API key. Please check your key and try again."
    } else if (raw.includes("429") || raw.toLowerCase().includes("rate")) {
      message = "Rate limited. Please wait a moment and try again."
    } else if (raw.includes("ECONNREFUSED") || raw.includes("ENOTFOUND") || raw.toLowerCase().includes("network")) {
      message = "Could not reach the provider. Check your internet connection."
    } else {
      message = "Could not validate API key. Please try again."
    }

    return c.json({ status: "error", message }, 401)
  }
})

function getTestModel(provider: "anthropic" | "openai") {
  // Use cheapest model for validation
  return provider === "anthropic" ? "claude-3-5-haiku-latest" : "gpt-4o-mini"
}

export { authRoutes }
