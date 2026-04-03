import { Hono } from "hono"
import { getModel, streamSimple } from "@mariozechner/pi-ai"
import { storeCredentials } from "../lib/credentials"

const authRoutes = new Hono()

function mapErrorMessage(raw: string): string {
  const lower = raw.toLowerCase()
  if (raw.includes("401") || lower.includes("invalid") || lower.includes("unauthorized") || lower.includes("authentication")) {
    return "Invalid API key. Please check your key and try again."
  }
  if (raw.includes("429") || lower.includes("rate")) {
    return "Rate limited. Please wait a moment and try again."
  }
  if (raw.includes("ECONNREFUSED") || raw.includes("ENOTFOUND") || lower.includes("network")) {
    return "Could not reach the provider. Check your internet connection."
  }
  return "Could not validate API key. Please try again."
}

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

    const result = await stream.result()

    // pi-ai sets stopReason to "error" and errorMessage when the provider throws (e.g., 401)
    if (result.stopReason === "error" || result.stopReason === "aborted") {
      const errorMsg = result.errorMessage || "API key validation failed"
      return c.json({ status: "error", message: mapErrorMessage(errorMsg) }, 401)
    }

    // Belt-and-suspenders: if the stream "succeeded" but returned nothing, the key is likely invalid
    if (result.content.length === 0 && result.usage.totalTokens === 0) {
      return c.json({
        status: "error",
        message: "Invalid API key. Please check your key and try again."
      }, 401)
    }

    // Only store credentials if validation actually passed
    storeCredentials(provider, key)

    return c.json({ status: "ok", provider })
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : String(error)
    return c.json({ status: "error", message: mapErrorMessage(raw) }, 401)
  }
})

function getTestModel(provider: "anthropic" | "openai") {
  // Use cheapest model for validation
  return provider === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini"
}

export { authRoutes }
