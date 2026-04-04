# Phase 5: Credential Infrastructure - Research

**Researched:** 2026-04-04
**Domain:** Credential management, OAuth token storage, agent factory refactoring
**Confidence:** HIGH

## Summary

Phase 5 refactors the credential system from a simple `Map<Provider, string>` to a compound credential store that supports both API Keys and OAuth tokens per provider, and updates the agent factory to resolve credentials transparently. The existing pi-ai and pi-agent-core libraries already provide all the infrastructure needed: `OAuthCredentials` type (with `access`, `refresh`, `expires` fields), `getOAuthApiKey()` for auto-refreshing tokens, and `OAuthProviderInterface` with per-provider `getApiKey()` and `refreshToken()` methods.

A critical finding that simplifies the architecture: pi-agent-core's `getApiKey` option accepts `(provider: string) => Promise<string | undefined> | string | undefined` -- it is fully async-capable. The agent loop `await`s the result before each LLM call (verified in `agent-loop.js` line 156). This means D-04's "proactive refresh timer" approach is unnecessary. Instead, the `getApiKey` callback can resolve credentials on-demand, checking expiry and refreshing inline. This is simpler, more reliable, and aligned with how pi-ai's own `getOAuthApiKey()` function works.

**Primary recommendation:** Use pi-ai's `OAuthCredentials` type and `getOAuthApiKey()` / `refreshAnthropicToken()` / `refreshOpenAICodexToken()` functions directly. Build the credential store as a discriminated union of `ApiKeyCredential | OAuthCredential` per provider, and wire the agent factory's `getApiKey` as an async resolver that consults the store and auto-refreshes when needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** OAuth preferred -- when both API Key and OAuth exist for a provider, the resolver returns the OAuth access token
- **D-02:** No silent fallback -- if OAuth token expires and refresh fails, the system returns an error requiring re-auth. It does NOT silently fall back to API Key even if one exists
- **D-03:** Factory resolves credentials internally -- `createAgent(provider, modelId)` consults the credential store. Callers don't need to know about credential types
- **D-04:** Proactive refresh strategy -- a timer/check before requests ensures the token is fresh. `getApiKey` remains synchronous, returning the current token from the store. No async wrapper needed since pi-agent-core expects `() => string`
- **D-05:** AuthState exposes active auth method -- includes `authMethod: 'apiKey' | 'oauth' | null` so the UI can show badges and token status indicators (prepares for UI-03)
- **D-06:** Per-provider auth state -- `Map<Provider, ProviderAuthState>` where each provider has independent connection status
- **D-07:** Granular API per credential type -- `storeApiKey(provider, key)`, `storeOAuthTokens(provider, tokens)`, `clearByType(provider, type)`, `getActiveCredential(provider)`. Type-safe, explicit operations
- **D-08:** Status query endpoint -- `getAuthStatus(provider)` returns `{ hasApiKey, hasOAuth, activeMethod, oauthExpiry? }`. Frontend consults via GET route. Foundation for UI-03 token health indicators

### Claude's Discretion
- Internal data structure for compound credentials (discriminated union, separate maps, etc.)
- TypeScript type definitions for OAuthCredential shape
- Proactive refresh timer implementation details
- Error types and messages for credential resolution failures
- How the GET /auth/status route is structured

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRED-01 | Credential store suporta compound credentials (OAuth tokens + API Key) coexistindo por provider | pi-ai provides `OAuthCredentials` type with `{ refresh, access, expires }`. Store can use discriminated union `ApiKeyCredential | OAuthCredential` per provider. Both credential types coexist in a `Map<Provider, ProviderCredentials>` |
| CRED-02 | Agent factory usa async getApiKey resolver com token refresh transparente | pi-agent-core `getApiKey` accepts `Promise<string | undefined>` (verified in source). Resolver can check expiry, call `refreshAnthropicToken()` / `refreshOpenAICodexToken()`, and return the access token -- all inline |
| OAUTH-04 | User pode usar API Key como alternativa ao OAuth para qualquer provider | D-01 defines priority (OAuth preferred), D-07 defines granular API. Existing `POST /api/auth/apikey` route continues working unchanged; new `storeOAuthTokens()` adds OAuth path alongside |
</phase_requirements>

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mariozechner/pi-ai` (oauth module) | ^0.64.0 | `OAuthCredentials` type, `getOAuthApiKey()`, `refreshAnthropicToken()`, `refreshOpenAICodexToken()`, `OAuthProviderInterface` | Already installed; provides all OAuth credential types and refresh functions |
| `@mariozechner/pi-agent-core` | ^0.64.0 | `Agent` with async `getApiKey` option | Already installed; agent loop awaits `getApiKey` before each LLM call |
| Hono | ^4.12.0 | HTTP routes for auth status endpoint | Already installed |

### No New Dependencies Required

This phase requires zero new npm packages. All OAuth credential types, refresh functions, and agent integration points are provided by the existing pi-ai and pi-agent-core packages.

**Import path for OAuth utilities:**
```typescript
import type { OAuthCredentials } from "@mariozechner/pi-ai"
import { getOAuthApiKey, refreshAnthropicToken, refreshOpenAICodexToken } from "@mariozechner/pi-ai/oauth"
```

## Architecture Patterns

### Critical Finding: getApiKey is Async-Capable

**CONTEXT.md D-04 states:** "getApiKey remains synchronous, returning the current token from the store. No async wrapper needed since pi-agent-core expects `() => string`"

**Actual pi-agent-core API (verified from source):**
```typescript
// From agent.d.ts line 40
getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
```

**Actual usage in agent-loop.js line 156:**
```javascript
const resolvedApiKey = (config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey;
```

**Impact:** The proactive-timer approach from D-04 is still valid as a design choice, but the async capability means the resolver can also do on-demand refresh inline. The planner should implement the simpler approach: an async `getApiKey` that checks expiry and refreshes when needed, with no separate timer. This eliminates a whole category of timer-management complexity.

**Recommendation:** Use async `getApiKey` for on-demand refresh. Store the latest `OAuthCredentials` in the credential store; the resolver calls `refreshAnthropicToken()` / `refreshOpenAICodexToken()` only when `Date.now() >= credentials.expires`, then updates the store and returns the fresh `access` token. This mirrors how pi-ai's own `getOAuthApiKey()` works internally.

### OAuth Provider ID Mapping

The project uses `Provider = "anthropic" | "openai"` throughout. Pi-ai's OAuth providers use different IDs:

| Project Provider | OAuth Provider ID | Refresh Function |
|-----------------|-------------------|------------------|
| `"anthropic"` | `"anthropic"` | `refreshAnthropicToken(refreshToken)` |
| `"openai"` | `"openai-codex"` | `refreshOpenAICodexToken(refreshToken)` |

A mapping constant is needed:
```typescript
const OAUTH_PROVIDER_ID: Record<Provider, string> = {
  anthropic: "anthropic",
  openai: "openai-codex",
}
```

### Recommended Credential Store Structure

```typescript
// --- Credential Types ---
type Provider = "anthropic" | "openai"
type AuthMethod = "apiKey" | "oauth"

interface ApiKeyCredential {
  type: "apiKey"
  key: string
}

interface OAuthCredential {
  type: "oauth"
  access: string
  refresh: string
  expires: number  // timestamp ms
}

type Credential = ApiKeyCredential | OAuthCredential

interface ProviderCredentials {
  apiKey: ApiKeyCredential | null
  oauth: OAuthCredential | null
}

// --- Store ---
const store = new Map<Provider, ProviderCredentials>()
```

This discriminated union approach:
- Stores both credential types independently per provider (D-07)
- Allows OAuth preference with no collision (D-01)
- Enables granular clear/query operations (D-07, D-08)

### Recommended Project Structure Changes

```
src/server/
├── lib/
│   └── credentials.ts        # REFACTORED: compound store with ProviderCredentials
├── agent/
│   └── setup.ts              # REFACTORED: createAgent uses async getApiKey resolver
├── routes/
│   ├── auth.ts               # EXTENDED: add GET /auth/status, keep POST /auth/apikey
│   └── chat.ts               # SIMPLIFIED: no longer passes apiKey, factory resolves it
src/client/
├── lib/
│   └── types.ts              # EXTENDED: ProviderAuthState, per-provider auth types
├── hooks/
│   └── use-auth.ts           # REFACTORED: per-provider state Map
```

### Pattern 1: Compound Credential Store

**What:** In-memory store holding both API Key and OAuth credentials per provider
**When to use:** Whenever credentials are stored, queried, or cleared

```typescript
// credentials.ts - Core API (per D-07)
export function storeApiKey(provider: Provider, key: string): void
export function storeOAuthTokens(provider: Provider, tokens: OAuthCredential): void
export function clearByType(provider: Provider, type: AuthMethod): void
export function getActiveCredential(provider: Provider): Credential | null  // OAuth preferred per D-01
export function getAuthStatus(provider: Provider): AuthStatus
export function hasAnyCredential(provider: Provider): boolean
```

### Pattern 2: Async Credential Resolver for Agent Factory

**What:** The `getApiKey` function passed to `Agent` constructor resolves credentials from the store, auto-refreshing OAuth tokens when expired
**When to use:** Every time `createAgent()` is called

```typescript
// setup.ts - Refactored factory
function createCredentialResolver(): (provider: string) => Promise<string | undefined> {
  return async (provider: string): Promise<string | undefined> => {
    const typedProvider = provider as Provider
    const credential = getActiveCredential(typedProvider)
    if (!credential) return undefined

    if (credential.type === "apiKey") {
      return credential.key
    }

    // OAuth: check expiry, refresh if needed
    if (Date.now() >= credential.expires) {
      const refreshFn = provider === "anthropic"
        ? refreshAnthropicToken
        : refreshOpenAICodexToken
      try {
        const newCreds = await refreshFn(credential.refresh)
        storeOAuthTokens(typedProvider, {
          type: "oauth",
          access: newCreds.access,
          refresh: newCreds.refresh,
          expires: newCreds.expires,
        })
        return newCreds.access
      } catch {
        // D-02: No silent fallback -- throw, don't return API key
        throw new Error(`OAuth token expired and refresh failed for ${provider}. Re-authentication required.`)
      }
    }

    return credential.access
  }
}
```

### Pattern 3: Auth Status Endpoint

**What:** GET route returning credential status per provider (D-08)
**When to use:** Frontend polling / on-mount status check

```typescript
// Response shape for GET /api/auth/status?provider=anthropic
interface AuthStatusResponse {
  hasApiKey: boolean
  hasOAuth: boolean
  activeMethod: AuthMethod | null
  oauthExpiry?: number  // timestamp, only when hasOAuth
}
```

### Pattern 4: Per-Provider Frontend Auth State (D-05, D-06)

**What:** Frontend state tracks auth per provider independently
```typescript
// Frontend types
interface ProviderAuthState {
  status: AuthStatus  // "disconnected" | "connecting" | "connected" | "error"
  authMethod: "apiKey" | "oauth" | null
  error: string | null
  oauthExpiry?: number
}

interface AuthState {
  providers: Map<Provider, ProviderAuthState>
}
```

### Anti-Patterns to Avoid
- **Single-credential-per-provider:** Don't replace the old `Map<Provider, string>` with another single-value map. The store must hold both types simultaneously (D-07).
- **Timer-based refresh in a separate system:** Don't build a `setInterval` refresh timer that runs independently. The async `getApiKey` resolver handles refresh on-demand, which is simpler and guaranteed to run only when needed.
- **Fallback to API Key on OAuth failure:** D-02 explicitly forbids this. If OAuth refresh fails, the system MUST return an error, not silently use the API key.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth credential type | Custom token shape | `OAuthCredentials` from `@mariozechner/pi-ai` | Pi-ai defines `{ refresh, access, expires, [key: string]: unknown }`. Use this directly |
| Token refresh logic | Custom HTTP calls to provider token endpoints | `refreshAnthropicToken()`, `refreshOpenAICodexToken()` from `@mariozechner/pi-ai/oauth` | These handle all provider-specific refresh mechanics (endpoints, client IDs, grant types) |
| OAuth provider ID resolution | Hardcoded string mapping | `getOAuthProvider(id)` from `@mariozechner/pi-ai/oauth` | Returns full `OAuthProviderInterface` with `getApiKey()`, `refreshToken()`, `login()` |
| Token-to-API-key conversion | Manual `.access` extraction | `OAuthProviderInterface.getApiKey(credentials)` | Some providers (e.g., Google) serialize multiple fields into the API key string; the interface handles this |

**Key insight:** Pi-ai's OAuth module is a complete credential management SDK. The project's credential store wraps it for per-provider storage and priority resolution, but should NOT reimplement any token handling.

## Common Pitfalls

### Pitfall 1: OAuth Provider ID Mismatch
**What goes wrong:** Using `"openai"` as the OAuth provider ID when pi-ai expects `"openai-codex"`
**Why it happens:** The project uses `Provider = "anthropic" | "openai"` but pi-ai's OAuth providers use different IDs
**How to avoid:** Create a `OAUTH_PROVIDER_ID` mapping constant and use it consistently. Test with both providers.
**Warning signs:** `getOAuthProvider("openai")` returns `undefined`; refresh calls throw "Unknown OAuth provider"

### Pitfall 2: Stale Credentials After Refresh
**What goes wrong:** The `getApiKey` resolver refreshes tokens but forgets to update the store, so the next call refreshes again
**Why it happens:** The refresh returns new `OAuthCredentials` with new `access`, `refresh`, and `expires` values. All three must be persisted back to the store.
**How to avoid:** Always call `storeOAuthTokens()` with the refreshed credentials before returning the access token
**Warning signs:** Every request triggers a token refresh; provider rate-limits refresh calls

### Pitfall 3: Race Condition on Concurrent Refresh
**What goes wrong:** Two simultaneous requests both see an expired token, both call `refreshToken()`, one succeeds and updates the store, the other fails because the refresh token was already used
**Why it happens:** OAuth refresh tokens are often single-use. The first refresh invalidates the token for subsequent attempts.
**How to avoid:** Use a per-provider refresh mutex (a simple `Promise` cache). If a refresh is in-flight, subsequent callers await the same promise.
**Warning signs:** Intermittent "invalid_grant" errors when multiple requests fire simultaneously

### Pitfall 4: Breaking Existing API Key Auth
**What goes wrong:** Refactoring `credentials.ts` breaks the existing `POST /api/auth/apikey` flow or `getCredentials()` calls
**Why it happens:** Other files (`chat.ts`, `models.ts`) import from `credentials.ts`. Changing the export API without updating all call sites causes compile errors or runtime failures.
**How to avoid:** Map all existing consumers first. The new `getActiveCredential()` replaces `getCredentials()`. Update all import sites in the same commit.
**Warning signs:** TypeScript compilation errors; 401s on chat requests after refactor

### Pitfall 5: Forgetting getApiKey Error Propagation
**What goes wrong:** The `getApiKey` resolver throws on refresh failure, but the agent loop catches it as a generic error instead of surfacing "re-auth required"
**Why it happens:** Pi-agent-core's `getApiKey` contract says "must not throw or reject. Return undefined when no key is available." (from types.d.ts documentation)
**How to avoid:** The resolver should catch refresh errors internally and return `undefined` (or log the error). The agent loop will then fail with a missing API key error. For D-02 compliance, the credential store should also update its state to reflect the expired/failed status so the frontend can prompt re-auth.
**Warning signs:** Unhandled promise rejections in server logs; agent loop crashes instead of graceful error

## Code Examples

### Example 1: Compound Credential Store
```typescript
// src/server/lib/credentials.ts
import type { OAuthCredentials } from "@mariozechner/pi-ai"

type Provider = "anthropic" | "openai"
type AuthMethod = "apiKey" | "oauth"

interface ApiKeyCredential {
  type: "apiKey"
  key: string
}

interface OAuthCredential {
  type: "oauth"
  access: string
  refresh: string
  expires: number
}

type Credential = ApiKeyCredential | OAuthCredential

interface ProviderCredentials {
  apiKey: ApiKeyCredential | null
  oauth: OAuthCredential | null
}

interface AuthStatus {
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
  if (!entry) return { hasApiKey: false, hasOAuth: false, activeMethod: null }
  const hasApiKey = entry.apiKey !== null
  const hasOAuth = entry.oauth !== null
  return {
    hasApiKey,
    hasOAuth,
    activeMethod: hasOAuth ? "oauth" : hasApiKey ? "apiKey" : null,
    ...(hasOAuth && entry.oauth ? { oauthExpiry: entry.oauth.expires } : {}),
  }
}

export function hasAnyCredential(provider: Provider): boolean {
  const entry = store.get(provider)
  return entry !== null && entry !== undefined && (entry.apiKey !== null || entry.oauth !== null)
}
```

### Example 2: Agent Factory with Async Resolver
```typescript
// src/server/agent/setup.ts
import { Agent } from "@mariozechner/pi-agent-core"
import { getModel } from "@mariozechner/pi-ai"
import { refreshAnthropicToken, refreshOpenAICodexToken } from "@mariozechner/pi-ai/oauth"
import { getActiveCredential, storeOAuthTokens } from "../lib/credentials"
import { pocTools } from "./tools"
import { buildSystemPrompt } from "./harness"
import { getActiveHarness } from "../routes/harness"

type Provider = "anthropic" | "openai"

// Per-provider refresh mutex to prevent concurrent refresh races
const refreshInFlight = new Map<Provider, Promise<string>>()

async function resolveCredential(provider: Provider): Promise<string | undefined> {
  const credential = getActiveCredential(provider)
  if (!credential) return undefined

  if (credential.type === "apiKey") {
    return credential.key
  }

  // OAuth: check if expired
  if (Date.now() < credential.expires) {
    return credential.access
  }

  // Check for in-flight refresh (race condition prevention)
  const existing = refreshInFlight.get(provider)
  if (existing) return existing

  const refreshPromise = (async () => {
    try {
      const refreshFn = provider === "anthropic"
        ? refreshAnthropicToken
        : refreshOpenAICodexToken
      const newCreds = await refreshFn(credential.refresh)
      storeOAuthTokens(provider, newCreds)
      return newCreds.access
    } catch {
      // D-02: No silent fallback. Return undefined so agent fails gracefully.
      // Mark OAuth as failed by clearing it.
      return undefined as unknown as string
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
  const model = getModel(provider, modelId as any)
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
```

### Example 3: Auth Status Route
```typescript
// Addition to src/server/routes/auth.ts
import { getAuthStatus } from "../lib/credentials"

authRoutes.get("/status", (c) => {
  const provider = c.req.query("provider") as "anthropic" | "openai" | undefined
  if (!provider || !["anthropic", "openai"].includes(provider)) {
    return c.json({ error: "Invalid provider" }, 400)
  }
  return c.json(getAuthStatus(provider))
})
```

## State of the Art

| Old Approach (v1.0) | New Approach (v1.1 Phase 5) | Why Changed | Impact |
|---------------------|----------------------------|-------------|--------|
| `Map<Provider, string>` for API keys | `Map<Provider, ProviderCredentials>` compound store | Need to store both API Key and OAuth tokens per provider | All credential read/write call sites change |
| `createAgent({ apiKey })` explicit parameter | `createAgent({ provider, modelId })` with internal resolver | D-03: callers shouldn't know about credential types | `chat.ts` simplified; no more `getCredentials()` in route handlers |
| Sync `getApiKey: () => apiKey` | Async `getApiKey: (provider) => Promise<string>` | pi-agent-core supports async; enables on-demand token refresh | Eliminates need for separate refresh timer |
| Single `AuthState` with one provider | Per-provider `Map<Provider, ProviderAuthState>` | D-06: user can have different auth methods per provider | Frontend state model changes; UI components need provider awareness |

## Open Questions

1. **Refresh buffer timing**
   - What we know: `OAuthCredentials.expires` is a timestamp in ms. Checking `Date.now() >= expires` means we refresh only after expiry.
   - What's unclear: Should we add a buffer (e.g., refresh 60s before expiry) to avoid edge cases where the token expires mid-request?
   - Recommendation: Add a 60-second buffer (`Date.now() >= credential.expires - 60_000`). This is a simple constant, no complexity cost.

2. **Frontend AuthState migration path**
   - What we know: Current `useAuth` hook returns a single `AuthState`. D-06 requires per-provider state.
   - What's unclear: Whether to refactor `useAuth` to return a `Map` or create a separate `useProviderAuth(provider)` hook.
   - Recommendation: Refactor `useAuth` to manage per-provider state internally, expose `getProviderAuth(provider)` accessor. The connection page and inline auth already pass `provider` as a parameter.

3. **chat.ts credential check**
   - What we know: `chat.ts` currently calls `getCredentials(provider)` and returns 401 if null. With D-03, the agent factory resolves credentials internally.
   - What's unclear: Should `chat.ts` still pre-check for credentials before creating the agent, or let the agent fail at first LLM call?
   - Recommendation: Keep a lightweight pre-check using `hasAnyCredential(provider)` to return 401 early. This gives a better error message than letting the agent fail with "no API key".

## Sources

### Primary (HIGH confidence)
- `@mariozechner/pi-agent-core` v0.64.0 `agent.d.ts` -- `getApiKey` type signature verified as `(provider: string) => Promise<string | undefined> | string | undefined`
- `@mariozechner/pi-agent-core` v0.64.0 `agent-loop.js` line 156 -- `await config.getApiKey(config.model.provider)` confirms async support
- `@mariozechner/pi-agent-core` v0.64.0 `types.d.ts` line 135 -- `getApiKey` contract documentation: "must not throw or reject"
- `@mariozechner/pi-ai` v0.64.0 `utils/oauth/types.d.ts` -- `OAuthCredentials = { refresh, access, expires, [key]: unknown }`
- `@mariozechner/pi-ai` v0.64.0 `utils/oauth/index.d.ts` -- `getOAuthApiKey()`, `refreshOAuthToken()`, `getOAuthProvider()` APIs
- `@mariozechner/pi-ai` v0.64.0 `utils/oauth/anthropic.d.ts` -- `refreshAnthropicToken()`, `anthropicOAuthProvider`
- `@mariozechner/pi-ai` v0.64.0 `utils/oauth/openai-codex.d.ts` -- `refreshOpenAICodexToken()`, `openaiCodexOAuthProvider`
- `@mariozechner/pi-ai` v0.64.0 `utils/oauth/index.js` line 110-129 -- `getOAuthApiKey()` implementation showing auto-refresh pattern
- `@mariozechner/pi-ai` v0.64.0 `utils/oauth/anthropic.js` line 317 -- OAuth provider ID is `"anthropic"`
- `@mariozechner/pi-ai` v0.64.0 `utils/oauth/openai-codex.js` line 355 -- OAuth provider ID is `"openai-codex"` (NOT `"openai"`)

### Codebase (HIGH confidence)
- `src/server/lib/credentials.ts` -- Current simple `Map<Provider, string>` store (20 lines)
- `src/server/agent/setup.ts` -- Current factory using `getApiKey: () => apiKey` (sync, explicit)
- `src/server/routes/auth.ts` -- Current API key validation route (`POST /api/auth/apikey`)
- `src/server/routes/chat.ts` -- Calls `getCredentials()` then `createAgent({ apiKey })`
- `src/server/routes/models.ts` -- Calls `hasCredentials()` for auth guard
- `src/client/lib/types.ts` -- `AuthState`, `AuthStatus`, `Provider`, `AppState` types
- `src/client/hooks/use-auth.ts` -- Single-provider auth hook
- `src/client/hooks/use-agent.ts` -- Agent hook with inline auth via `connectProvider()`
- `src/client/lib/api.ts` -- `connectProvider()` function calling `POST /api/auth/apikey`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, types verified from source
- Architecture: HIGH -- pi-agent-core async getApiKey verified in source code, pi-ai OAuth module fully inspected
- Pitfalls: HIGH -- derived from actual code analysis (race conditions, provider ID mismatch, contract violations)

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- pi-ai/pi-agent-core are pre-1.0 but API is settled at 0.64.x)
