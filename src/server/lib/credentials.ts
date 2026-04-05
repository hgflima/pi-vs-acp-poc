import type { OAuthCredentials } from "@mariozechner/pi-ai"

export type Provider = "anthropic" | "openai"

export type PiProvider = "anthropic" | "openai" | "openai-codex"

export type AuthMethod = "apiKey" | "oauth"

export interface ApiKeyCredential {
  type: "apiKey"
  key: string
}

export interface OAuthCredential {
  type: "oauth"
  access: string
  refresh: string
  expires: number
}

export type Credential = ApiKeyCredential | OAuthCredential

interface ProviderCredentials {
  apiKey: ApiKeyCredential | null
  oauth: OAuthCredential | null
}

export interface AuthStatus {
  hasApiKey: boolean
  hasOAuth: boolean
  activeMethod: AuthMethod | null
  oauthExpiry?: number
}

const store = new Map<Provider, ProviderCredentials>()

function getOrCreate(provider: Provider): ProviderCredentials {
  let entry = store.get(provider)
  if (!entry) {
    entry = { apiKey: null, oauth: null }
    store.set(provider, entry)
  }
  return entry
}

export function storeApiKey(provider: Provider, key: string): void {
  const entry = getOrCreate(provider)
  entry.apiKey = { type: "apiKey", key }
}

export function storeOAuthTokens(provider: Provider, tokens: OAuthCredentials): void {
  const entry = getOrCreate(provider)
  entry.oauth = {
    type: "oauth",
    access: tokens.access,
    refresh: tokens.refresh,
    expires: tokens.expires,
  }
}

// D-01: OAuth preferred when both exist
export function getActiveCredential(provider: Provider): Credential | null {
  const entry = store.get(provider)
  if (!entry) return null
  return entry.oauth ?? entry.apiKey ?? null
}

export function clearByType(provider: Provider, type: AuthMethod): void {
  const entry = store.get(provider)
  if (!entry) return
  if (type === "apiKey") entry.apiKey = null
  if (type === "oauth") entry.oauth = null
  // Clean up empty entries
  if (!entry.apiKey && !entry.oauth) store.delete(provider)
}

export function getAuthStatus(provider: Provider): AuthStatus {
  const entry = store.get(provider)
  if (!entry) {
    return { hasApiKey: false, hasOAuth: false, activeMethod: null }
  }
  const hasApiKey = entry.apiKey !== null
  const hasOAuth = entry.oauth !== null
  const status: AuthStatus = {
    hasApiKey,
    hasOAuth,
    activeMethod: hasOAuth ? "oauth" : hasApiKey ? "apiKey" : null,
  }
  if (hasOAuth && entry.oauth) {
    status.oauthExpiry = entry.oauth.expires
  }
  return status
}

export function hasAnyCredential(provider: Provider): boolean {
  const entry = store.get(provider)
  if (!entry) return false
  return entry.apiKey !== null || entry.oauth !== null
}

// D-01: Remap "openai" → "openai-codex" when OAuth is the active credential for OpenAI.
// API Key path uses the standard "openai" slug; OAuth path uses the Codex slug so pi-ai
// routes the request to chatgpt.com/backend-api with Codex models (gpt-5.1, gpt-5.1-codex, etc.)
// instead of api.openai.com/chat/completions with standard OpenAI models (gpt-4o, etc.).
// Anthropic is never remapped.
export function resolvePiProvider(provider: Provider): PiProvider {
  if (provider === "openai" && getAuthStatus("openai").activeMethod === "oauth") {
    return "openai-codex"
  }
  return provider
}

// D-06: Dev/UAT helper — mutate stored OAuth credential's `expires` to Date.now() - 1000
// so the next resolveCredential() call in setup.ts (60s buffer) detects expiry and triggers
// refreshOpenAICodexToken/refreshAnthropicToken. Returns { before, after } epoch-ms pair on
// success, or null if no OAuth credential is stored for this provider. Consumed by Plan 02's
// POST /api/auth/oauth/debug/force-expire endpoint (D-07: always enabled, no NODE_ENV gate).
export function forceExpireOAuth(provider: Provider): { before: number; after: number } | null {
  const entry = store.get(provider)
  if (!entry || !entry.oauth) return null
  const before = entry.oauth.expires
  const after = Date.now() - 1000
  entry.oauth.expires = after
  return { before, after }
}
