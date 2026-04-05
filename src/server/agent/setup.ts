import { Agent } from "@mariozechner/pi-agent-core"
import { getModel } from "@mariozechner/pi-ai"
import { refreshAnthropicToken, refreshOpenAICodexToken } from "@mariozechner/pi-ai/oauth"
import type { OAuthCredentials } from "@mariozechner/pi-ai"
import { pocTools } from "./tools"
import { buildSystemPrompt } from "./harness"
import { getActiveHarness } from "../routes/harness"
import { getActiveCredential, resolvePiProvider, storeOAuthTokens, type Provider } from "../lib/credentials"

// Refresh 60s before expiry to avoid mid-request expiration
const REFRESH_BUFFER_MS = 60_000

// Per-provider refresh mutex: prevents concurrent refreshes from reusing the same (single-use) refresh token
const refreshInFlight = new Map<Provider, Promise<string | undefined>>()

async function resolveCredential(provider: Provider): Promise<string | undefined> {
  const credential = getActiveCredential(provider)
  if (!credential) return undefined

  if (credential.type !== "oauth") {
    // API Key path: return key string immediately
    return credential.key
  }

  // OAuth path
  if (Date.now() < credential.expires - REFRESH_BUFFER_MS) {
    return credential.access
  }

  // Expired or near-expiry: check for in-flight refresh
  const existing = refreshInFlight.get(provider)
  if (existing) return existing

  const refreshPromise = (async (): Promise<string | undefined> => {
    try {
      const newCreds: OAuthCredentials = provider === "anthropic"
        ? await refreshAnthropicToken(credential.refresh)
        : await refreshOpenAICodexToken(credential.refresh)
      storeOAuthTokens(provider, newCreds)
      return newCreds.access
    } catch {
      // D-02: No silent fallback to API Key. Return undefined so pi-agent-core
      // surfaces "no API key" error instead of silently using another credential.
      // Contract (pi-agent-core types.d.ts): "must not throw or reject. Return undefined..."
      return undefined
    } finally {
      refreshInFlight.delete(provider)
    }
  })()

  refreshInFlight.set(provider, refreshPromise)
  return refreshPromise
}

interface CreateAgentOptions {
  provider: Provider
  modelId: string
  systemPrompt?: string
}

export function createAgent({ provider, modelId, systemPrompt }: CreateAgentOptions): Agent {
  const model = getModel(resolvePiProvider(provider), modelId)

  // If no explicit systemPrompt, check for active harness
  const finalPrompt = systemPrompt ?? buildSystemPrompt(getActiveHarness())

  return new Agent({
    initialState: {
      systemPrompt: finalPrompt,
      model,
      tools: pocTools,
    },
    getApiKey: (p) => resolveCredential(p as Provider),
  })
}
