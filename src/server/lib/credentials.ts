import type { OAuthCredentials } from "@mariozechner/pi-ai"

export type Provider = "anthropic" | "openai"
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
