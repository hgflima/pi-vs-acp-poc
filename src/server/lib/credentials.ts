type Provider = "anthropic" | "openai"

const credentials = new Map<Provider, string>()

export function storeCredentials(provider: Provider, apiKey: string): void {
  credentials.set(provider, apiKey)
}

export function getCredentials(provider: Provider): string | null {
  return credentials.get(provider) ?? null
}

export function hasCredentials(provider: Provider): boolean {
  return credentials.has(provider)
}

export function clearCredentials(provider: Provider): void {
  credentials.delete(provider)
}
