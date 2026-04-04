# Architecture Research: OAuth Integration

**Domain:** OAuth authentication integration for existing SPA + Backend Proxy LLM chat app
**Researched:** 2026-04-04
**Confidence:** HIGH

## Executive Summary

The OAuth integration leverages pi-ai's built-in `OAuthProviderInterface` system, which already implements Authorization Code + PKCE flows for both Anthropic and OpenAI Codex. Both flows spin up a temporary local HTTP callback server on the **backend** (Node.js `http.createServer`), then redirect the user's browser to the provider's authorization page. After the user completes login, the provider redirects back to the local callback, the backend exchanges the code for tokens, and stores `OAuthCredentials` (access, refresh, expires) in-memory alongside the existing API key store.

The critical insight: **pi-ai's OAuth functions are CLI-oriented** (they call `http.createServer` directly), but since our backend IS a Node.js process, they work perfectly there. The Hono backend orchestrates the flow: it initiates login, opens the user's browser (via frontend instruction), receives the callback, exchanges tokens, and stores credentials. The frontend never touches tokens -- it only knows the auth method and status.

The existing `createAgent` factory needs a single change: its `getApiKey` function must resolve credentials from either the API key store or the OAuth token store, with automatic token refresh for expired OAuth tokens.

---

## System Overview: OAuth Flow Integration

```
                         EXISTING                              NEW (OAuth)
                         --------                              -----------

Browser (React SPA)      Hono Backend (Node.js)                LLM Provider
+------------------+     +-----------------------------+       +------------------+
|                  |     |                             |       |                  |
| ConnectionPage   | POST| /api/auth/apikey            |       | Anthropic API    |
| - API Key input  |---->| - validate key via test req |------>| OpenAI API       |
| - Provider pick  |     | - store in credentials Map  |       |                  |
|                  |     |                             |       |                  |
| NEW:             | POST| NEW: /api/auth/oauth/start  |       | NEW:             |
| - "Login with    |---->| - calls loginAnthropic() or |       | claude.ai/oauth  |
|   Claude/OpenAI" |     |   loginOpenAICodex()        |       | auth.openai.com  |
|   button         |     | - starts local callback srv |       |                  |
|                  |     |   (port 53692 or 1455)      |       |                  |
| - Opens browser  |<----| - returns { authUrl }       |       |                  |
|   window.open()  |     |                             |       |                  |
|                  |     |                             |       |                  |
| User completes   |     | Callback server receives    |<------| Provider redirect|
| login in browser |     | auth code, exchanges for    |------>| Token endpoint   |
| tab              |     | tokens                      |<------| Returns tokens   |
|                  |     |                             |       |                  |
|                  | poll| NEW: /api/auth/oauth/status  |       |                  |
| - polls status   |---->| - returns pending/done/error |       |                  |
| - until done     |<----|                             |       |                  |
|                  |     | stores OAuthCredentials in   |       |                  |
|                  |     | oauth credential store       |       |                  |
+------------------+     +-----------------------------+       +------------------+

                         UNCHANGED: Chat flow
+------------------+     +-----------------------------+
| POST /api/chat   |---->| getCredentials(provider)    |
|                  |     |   checks API key store      |
|                  |     |   OR oauth credential store  |
|                  |     |   (auto-refresh if expired)  |
|                  |     |                             |
|                  |     | createAgent({ getApiKey })   |
|                  |     |   getApiKey resolves from    |
|                  |     |   whichever store has creds  |
+------------------+     +-----------------------------+
```

---

## Component Changes: Existing vs New

### Backend: New Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **OAuth credential store** | `src/server/lib/oauth-credentials.ts` | In-memory `Map<OAuthProviderId, OAuthCredentials>`, token refresh logic, expiry checking |
| **OAuth auth routes** | `src/server/routes/oauth.ts` | `/api/auth/oauth/start` and `/api/auth/oauth/status` endpoints |
| **Unified credential resolver** | `src/server/lib/credentials.ts` (modified) | `getApiKeyForProvider()` that checks both stores, returns string key |

### Backend: Modified Components

| Component | File | Change |
|-----------|------|--------|
| **Credential store** | `src/server/lib/credentials.ts` | Add `getApiKeyForProvider()` that checks API key store first, then falls back to OAuth store with auto-refresh |
| **Agent factory** | `src/server/agent/setup.ts` | Change `getApiKey` from static value to function that calls `getApiKeyForProvider()` |
| **Chat route** | `src/server/routes/chat.ts` | Replace `getCredentials()` check with `hasAnyCredentials()` that checks both stores |
| **Models route** | `src/server/routes/models.ts` | Replace `hasCredentials()` check with `hasAnyCredentials()` |
| **Server entry** | `src/server/index.ts` | Mount new OAuth routes |

### Frontend: New Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **OAuth login button** | In `connection-page.tsx` (or new component) | "Login with Claude" / "Login with OpenAI" buttons, opens browser window, polls status |

### Frontend: Modified Components

| Component | File | Change |
|-----------|------|--------|
| **ConnectionPage** | `src/client/components/connection/connection-page.tsx` | Add auth method selector (API Key vs OAuth), OAuth login buttons |
| **useAuth hook** | `src/client/hooks/use-auth.ts` | Add `connectOAuth(provider)` method, polling logic for OAuth completion |
| **API client** | `src/client/lib/api.ts` | Add `startOAuth(provider)` and `pollOAuthStatus()` functions |
| **Types** | `src/client/lib/types.ts` | Add `AuthMethod` type, update `AuthState` |
| **InlineAuth** | `src/client/components/config/inline-auth.tsx` | Add OAuth option alongside API key input |

---

## New Endpoints

### POST /api/auth/oauth/start

Initiates the OAuth flow for a provider.

```typescript
// Request
{ provider: "anthropic" | "openai" }

// Response (success)
{
  status: "started",
  authUrl: "https://claude.ai/oauth/authorize?...",  // URL to open in browser
  instructions: "Complete login in your browser..."
}

// Response (error)
{ status: "error", message: "OAuth flow already in progress" }
```

**Implementation detail:** This endpoint calls `loginAnthropic()` or `loginOpenAICodex()` which:
1. Generates PKCE verifier + challenge
2. Starts a local callback HTTP server (port 53692 for Anthropic, 1455 for OpenAI)
3. Returns immediately with the auth URL
4. The callback server waits asynchronously for the provider redirect

The endpoint must be **non-blocking**: it starts the login flow, stores the pending Promise, and returns the auth URL immediately. The actual token exchange completes asynchronously when the callback fires.

### GET /api/auth/oauth/status

Polls the status of the in-progress OAuth flow.

```typescript
// Response (pending)
{ status: "pending" }

// Response (done)
{ status: "ok", provider: "anthropic" }

// Response (error)
{ status: "error", message: "OAuth flow timed out" }

// Response (no flow)
{ status: "none" }
```

### Why Polling, Not WebSocket/SSE

The OAuth flow takes 10-60 seconds (user must complete browser login). Options:
- **SSE:** Would work but adds complexity for a one-time event. Already have SSE infra, but this is auth, not streaming.
- **WebSocket:** Overkill for a single status check.
- **Polling:** Simple, reliable, already proven pattern in the app. Poll every 2 seconds, timeout after 5 minutes.

**Use polling.** It is the simplest approach that works. The frontend polls `/api/auth/oauth/status` every 2s until it gets `ok` or `error`.

---

## Credential Storage Architecture

### Current: API Key Only

```typescript
// src/server/lib/credentials.ts (current)
const credentials = new Map<Provider, string>()  // provider -> API key string
```

### New: Dual Store (API Key + OAuth)

```typescript
// src/server/lib/credentials.ts (new)
import type { OAuthCredentials, OAuthProviderId } from "@mariozechner/pi-ai/oauth"
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth"

type Provider = "anthropic" | "openai"

// Store 1: API keys (unchanged)
const apiKeyStore = new Map<Provider, string>()

// Store 2: OAuth credentials
const oauthStore = new Map<OAuthProviderId, OAuthCredentials>()

// Map from our Provider type to pi-ai's OAuthProviderId
const OAUTH_PROVIDER_MAP: Record<Provider, OAuthProviderId> = {
  anthropic: "anthropic",
  "openai": "openai-codex",  // pi-ai uses "openai-codex" not "openai"
}

// --- API Key functions (unchanged API, renamed internally) ---
export function storeApiKey(provider: Provider, apiKey: string): void
export function getApiKey(provider: Provider): string | null
export function hasApiKey(provider: Provider): boolean
export function clearApiKey(provider: Provider): void

// --- OAuth functions (new) ---
export function storeOAuthCredentials(provider: Provider, creds: OAuthCredentials): void
export function getOAuthCredentials(provider: Provider): OAuthCredentials | null
export function hasOAuthCredentials(provider: Provider): boolean
export function clearOAuthCredentials(provider: Provider): void

// --- Unified resolver (new, critical) ---
export async function resolveApiKey(provider: Provider): Promise<string | null> {
  // 1. Check API key store first (simple, fast)
  const apiKey = getApiKey(provider)
  if (apiKey) return apiKey

  // 2. Check OAuth store, with auto-refresh
  const oauthCreds = getOAuthCredentials(provider)
  if (!oauthCreds) return null

  const oauthProviderId = OAUTH_PROVIDER_MAP[provider]
  const oauthProvider = getOAuthProvider(oauthProviderId)
  if (!oauthProvider) return null

  // Auto-refresh if expired
  let currentCreds = oauthCreds
  if (Date.now() >= currentCreds.expires) {
    currentCreds = await oauthProvider.refreshToken(currentCreds)
    storeOAuthCredentials(provider, currentCreds)  // Update stored creds
  }

  return oauthProvider.getApiKey(currentCreds)
}

// --- Unified check (new) ---
export function hasAnyCredentials(provider: Provider): boolean {
  return hasApiKey(provider) || hasOAuthCredentials(provider)
}

// --- Auth method info (new, for frontend status) ---
export type AuthMethod = "api-key" | "oauth" | null
export function getAuthMethod(provider: Provider): AuthMethod {
  if (hasApiKey(provider)) return "api-key"
  if (hasOAuthCredentials(provider)) return "oauth"
  return null
}
```

### Critical Design Decision: OAuthProviderId Mapping

pi-ai uses `"anthropic"` for Anthropic OAuth and `"openai-codex"` for OpenAI OAuth. Our existing codebase uses `"anthropic" | "openai"` as the Provider type. The mapping is:

| Our Provider | pi-ai OAuthProviderId | OAuth Provider Object |
|---|---|---|
| `"anthropic"` | `"anthropic"` | `anthropicOAuthProvider` |
| `"openai"` | `"openai-codex"` | `openaiCodexOAuthProvider` |

This mapping must be explicit and centralized in credentials.ts.

---

## Agent Factory Change

### Current: Static API Key

```typescript
// src/server/agent/setup.ts (current)
export function createAgent({ provider, modelId, apiKey }: CreateAgentOptions): Agent {
  return new Agent({
    initialState: { systemPrompt, model, tools: pocTools },
    getApiKey: () => apiKey,  // Static string
  })
}
```

### New: Dynamic Credential Resolution

```typescript
// src/server/agent/setup.ts (new)
import { resolveApiKey } from "../lib/credentials"

interface CreateAgentOptions {
  provider: "anthropic" | "openai"
  modelId: string
  systemPrompt?: string
}

export function createAgent({ provider, modelId, systemPrompt }: CreateAgentOptions): Agent {
  const model = getModel(provider, modelId as any)
  const finalPrompt = systemPrompt ?? buildSystemPrompt(getActiveHarness())

  return new Agent({
    initialState: { systemPrompt: finalPrompt, model, tools: pocTools },
    // Dynamic: resolves from API key OR OAuth store, auto-refreshes
    getApiKey: async (_providerName: string) => {
      const key = await resolveApiKey(provider)
      return key ?? undefined
    },
  })
}
```

**Key change:** `getApiKey` goes from `() => apiKey` (static string) to `async () => resolveApiKey(provider)` (dynamic resolution with potential token refresh). pi-agent-core's `getApiKey` already supports `Promise<string | undefined>` return type, so this is a seamless upgrade.

**Why this works:** The Agent calls `getApiKey` before each LLM call. For API keys, this returns instantly. For OAuth tokens, it checks expiry and refreshes if needed. The Agent doesn't know or care which auth method is in use -- it just gets a string API key either way.

---

## OAuth Login Flow: Step by Step

### Anthropic OAuth Flow

```
1. Frontend: User clicks "Login with Claude" button
2. Frontend: POST /api/auth/oauth/start { provider: "anthropic" }
3. Backend: Calls loginAnthropic() with callbacks
   - loginAnthropic() generates PKCE verifier + challenge
   - loginAnthropic() starts http.createServer on 127.0.0.1:53692
   - loginAnthropic() builds auth URL:
     https://claude.ai/oauth/authorize?
       client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e
       response_type=code
       redirect_uri=http://localhost:53692/callback
       scope=org:create_api_key user:profile user:inference ...
       code_challenge=[S256 challenge]
       state=[verifier]
4. Backend: Returns { status: "started", authUrl: "https://claude.ai/oauth/..." }
5. Frontend: Opens authUrl in new browser tab via window.open()
6. User: Completes Claude.ai login + authorization in browser tab
7. Browser: Claude redirects to http://localhost:53692/callback?code=...&state=...
8. Backend: Callback server receives code, responds with success HTML
9. Backend: loginAnthropic() exchanges code for tokens via POST to
   https://platform.claude.com/v1/oauth/token
10. Backend: Receives { access_token, refresh_token, expires_in }
11. Backend: Stores OAuthCredentials { access, refresh, expires } in oauthStore
12. Backend: OAuth flow Promise resolves
13. Frontend: Polling /api/auth/oauth/status returns { status: "ok" }
14. Frontend: Navigates to /chat
```

### OpenAI Codex OAuth Flow

```
1. Frontend: User clicks "Login with OpenAI" button
2. Frontend: POST /api/auth/oauth/start { provider: "openai" }
3. Backend: Calls loginOpenAICodex() with callbacks
   - loginOpenAICodex() generates PKCE verifier + challenge + random state
   - loginOpenAICodex() starts http.createServer on 127.0.0.1:1455
   - loginOpenAICodex() builds auth URL:
     https://auth.openai.com/oauth/authorize?
       client_id=app_EMoamEEZ73f0CkXaXp7hrann
       response_type=code
       redirect_uri=http://localhost:1455/auth/callback
       scope=openid profile email offline_access
       code_challenge=[S256 challenge]
       state=[random hex]
       originator=pi
4. Backend: Returns { status: "started", authUrl: "https://auth.openai.com/oauth/..." }
5. Frontend: Opens authUrl in new browser tab via window.open()
6. User: Completes OpenAI login + authorization in browser tab
7. Browser: OpenAI redirects to http://localhost:1455/auth/callback?code=...&state=...
8. Backend: Callback server receives code, responds with success HTML
9. Backend: loginOpenAICodex() exchanges code via POST to
   https://auth.openai.com/oauth/token (x-www-form-urlencoded)
10. Backend: Receives { access_token, refresh_token, expires_in }
11. Backend: Extracts accountId from JWT claim
12. Backend: Stores OAuthCredentials { access, refresh, expires, accountId }
13. Backend: OAuth flow Promise resolves
14. Frontend: Polling /api/auth/oauth/status returns { status: "ok" }
15. Frontend: Navigates to /chat
```

### Token Refresh Flow (Both Providers)

```
1. Agent calls getApiKey() before LLM request
2. resolveApiKey() checks oauthStore for provider
3. If Date.now() >= credentials.expires:
   a. Calls oauthProvider.refreshToken(credentials)
   b. Provider POSTs to token endpoint with refresh_token grant
   c. Receives new { access_token, refresh_token, expires_in }
   d. Updates oauthStore with new credentials
4. Returns oauthProvider.getApiKey(credentials) (= credentials.access)
5. Agent uses this as API key for the LLM request
```

---

## OAuth Route Implementation Pattern

```typescript
// src/server/routes/oauth.ts

import { Hono } from "hono"
import {
  getOAuthProvider,
  type OAuthCredentials,
  type OAuthLoginCallbacks,
} from "@mariozechner/pi-ai/oauth"
import { storeOAuthCredentials, type Provider } from "../lib/credentials"

const oauthRoutes = new Hono()

// Provider ID mapping
const OAUTH_IDS: Record<Provider, string> = {
  anthropic: "anthropic",
  openai: "openai-codex",
}

// In-flight OAuth state (only one flow at a time, single-user app)
let pendingOAuth: {
  provider: Provider
  promise: Promise<OAuthCredentials>
  authUrl: string | null
  status: "pending" | "done" | "error"
  error?: string
} | null = null

oauthRoutes.post("/start", async (c) => {
  const { provider } = await c.req.json<{ provider: Provider }>()

  if (pendingOAuth?.status === "pending") {
    return c.json({ status: "error", message: "OAuth flow already in progress" }, 409)
  }

  const oauthId = OAUTH_IDS[provider]
  const oauthProvider = getOAuthProvider(oauthId)
  if (!oauthProvider) {
    return c.json({ status: "error", message: `No OAuth provider for ${provider}` }, 400)
  }

  let resolveAuthUrl: (url: string) => void
  const authUrlPromise = new Promise<string>((resolve) => {
    resolveAuthUrl = resolve
  })

  const callbacks: OAuthLoginCallbacks = {
    onAuth: (info) => {
      resolveAuthUrl(info.url)
      if (pendingOAuth) pendingOAuth.authUrl = info.url
    },
    onPrompt: async () => "",  // No CLI prompting in web context
    onProgress: (msg) => console.log(`[oauth:${provider}] ${msg}`),
  }

  // Start login asynchronously (does not block)
  const loginPromise = oauthProvider.login(callbacks)
    .then((creds) => {
      storeOAuthCredentials(provider, creds)
      if (pendingOAuth) pendingOAuth.status = "done"
      return creds
    })
    .catch((err) => {
      if (pendingOAuth) {
        pendingOAuth.status = "error"
        pendingOAuth.error = err.message
      }
      throw err
    })

  pendingOAuth = {
    provider,
    promise: loginPromise,
    authUrl: null,
    status: "pending",
  }

  // Wait for auth URL to be available (happens quickly, before user action)
  const authUrl = await authUrlPromise

  return c.json({
    status: "started",
    authUrl,
    instructions: "Complete login in the browser window",
  })
})

oauthRoutes.get("/status", (c) => {
  if (!pendingOAuth) {
    return c.json({ status: "none" })
  }

  if (pendingOAuth.status === "done") {
    const provider = pendingOAuth.provider
    pendingOAuth = null  // Clear completed flow
    return c.json({ status: "ok", provider })
  }

  if (pendingOAuth.status === "error") {
    const error = pendingOAuth.error
    pendingOAuth = null  // Clear failed flow
    return c.json({ status: "error", message: error })
  }

  return c.json({ status: "pending" })
})

export { oauthRoutes }
```

---

## Frontend Data Flow Changes

### Updated AuthState Type

```typescript
// src/client/lib/types.ts
export type AuthMethod = "api-key" | "oauth"

export interface AuthState {
  status: AuthStatus
  provider: Provider | null
  method: AuthMethod | null  // NEW: which auth method was used
  error: string | null
}
```

### Updated useAuth Hook

```typescript
// src/client/hooks/use-auth.ts (conceptual changes)

export function useAuth() {
  // ... existing state ...

  // NEW: OAuth flow
  const connectOAuth = useCallback(async (provider: Provider) => {
    setAuth({ status: "connecting", provider, method: "oauth", error: null })

    try {
      // 1. Start OAuth flow on backend
      const { authUrl } = await startOAuth(provider)

      // 2. Open browser tab
      window.open(authUrl, "_blank")

      // 3. Poll for completion
      const result = await pollOAuthStatus(5 * 60 * 1000)  // 5 min timeout

      if (result.status === "ok") {
        setAuth({ status: "connected", provider, method: "oauth", error: null })
        return true
      } else {
        setAuth({ status: "error", provider, method: "oauth", error: result.message })
        return false
      }
    } catch (err) {
      setAuth({ status: "error", provider, method: "oauth", error: "OAuth flow failed" })
      return false
    }
  }, [])

  // EXISTING: API key flow (add method: "api-key")
  const connect = useCallback(async (provider: Provider, apiKey: string) => {
    setAuth({ status: "connecting", provider, method: "api-key", error: null })
    // ... rest unchanged, just add method: "api-key" to success/error states
  }, [])

  return { auth, connect, connectOAuth, disconnect }
}
```

### Updated API Client

```typescript
// src/client/lib/api.ts (new functions)

export async function startOAuth(provider: Provider): Promise<{
  status: string
  authUrl: string
  instructions: string
}> {
  const res = await fetch(`${API_BASE}/auth/oauth/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  })
  return res.json()
}

export async function pollOAuthStatus(
  timeoutMs: number = 300_000
): Promise<{ status: string; provider?: string; message?: string }> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/auth/oauth/status`)
    const data = await res.json()

    if (data.status === "ok" || data.status === "error") {
      return data
    }

    // Wait 2 seconds before next poll
    await new Promise((r) => setTimeout(r, 2000))
  }

  return { status: "error", message: "OAuth flow timed out" }
}
```

---

## ConnectionPage UI Changes

### Auth Method Selection

The ConnectionPage needs to let users choose between API Key and OAuth for each provider:

```
+----------------------------------------------+
|            Pi AI Chat                         |
|  Connect to your LLM provider                |
|                                               |
|  Provider:  [Anthropic] [OpenAI]             |
|                                               |
|  Auth Method:                                 |
|  +------------------+ +-------------------+  |
|  | [key icon]       | | [lock icon]       |  |
|  | API Key          | | OAuth Login       |  |
|  | Paste your key   | | Use your account  |  |
|  +------------------+ +-------------------+  |
|                                               |
|  [If API Key selected:]                       |
|  API Key: [sk-ant-...]                        |
|  [Connect]                                    |
|                                               |
|  [If OAuth selected:]                         |
|  [Login with Claude]  or  [Login with OpenAI] |
|  (Opens browser for authentication)           |
|                                               |
|  [If OAuth pending:]                          |
|  [spinner] Waiting for browser login...       |
|  Complete authentication in the opened tab    |
+----------------------------------------------+
```

### Implementation: Tabbed or Segmented

Reuse the existing `SegmentedControl` component for auth method selection. The ConnectionPage already has a `SegmentedControl` for provider -- add a second one for auth method below it. This keeps the UI consistent.

---

## Port Conflict Consideration

The OAuth callback servers use fixed ports:
- **Anthropic:** `127.0.0.1:53692`
- **OpenAI Codex:** `127.0.0.1:1455`

These ports are hardcoded in pi-ai's OAuth modules (not configurable). They do NOT conflict with:
- Vite dev server: port 5173
- Hono backend: port 3001

No port conflicts expected. The callback servers are temporary (alive only during the OAuth flow, shut down immediately after).

---

## Architectural Patterns

### Pattern 1: Async Flow with Polling

**What:** Backend starts a long-running async operation, frontend polls for completion.
**When to use:** OAuth login flows where the backend cannot predict when the user will complete the external action.
**Trade-offs:**
- Pro: Simple, no persistent connection needed, frontend can show loading state
- Pro: Works with any HTTP client, no SSE/WebSocket complexity for auth
- Con: 2-second polling latency (acceptable for auth flow)
- Con: Must handle timeouts and cleanup of abandoned flows

### Pattern 2: Dual Credential Store with Unified Resolver

**What:** Two separate stores (API key Map, OAuth credentials Map) with a single `resolveApiKey()` function that abstracts the difference.
**When to use:** When supporting multiple auth methods that ultimately produce the same output (an API key string).
**Trade-offs:**
- Pro: Existing code that calls `resolveApiKey()` doesn't need to know about auth methods
- Pro: Token refresh is transparent -- callers never see expired tokens
- Con: Must handle race conditions on concurrent refresh (use a refresh lock)

**Implementation note on refresh locking:**

```typescript
// Prevent concurrent refresh requests for the same provider
const refreshLocks = new Map<string, Promise<OAuthCredentials>>()

async function refreshIfNeeded(provider: Provider): Promise<OAuthCredentials> {
  const oauthId = OAUTH_IDS[provider]
  const existing = refreshLocks.get(oauthId)
  if (existing) return existing  // Reuse in-flight refresh

  const creds = getOAuthCredentials(provider)!
  if (Date.now() < creds.expires) return creds  // Not expired

  const refreshPromise = getOAuthProvider(oauthId)!
    .refreshToken(creds)
    .then((newCreds) => {
      storeOAuthCredentials(provider, newCreds)
      refreshLocks.delete(oauthId)
      return newCreds
    })
    .catch((err) => {
      refreshLocks.delete(oauthId)
      throw err
    })

  refreshLocks.set(oauthId, refreshPromise)
  return refreshPromise
}
```

### Pattern 3: Provider Abstraction Layer

**What:** Map the app's `Provider` type to pi-ai's `OAuthProviderId` in one place.
**When to use:** When your domain model uses different identifiers than the library.
**Trade-offs:**
- Pro: Centralized mapping, easy to add new providers later
- Pro: Rest of app uses consistent `"anthropic" | "openai"` everywhere
- Con: One more indirection to understand

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running OAuth Login in the Browser

**What people do:** Try to import `loginAnthropic()` in frontend code and run the OAuth flow in the browser.
**Why it's wrong:** pi-ai's OAuth modules use `node:http` and `node:crypto`. They cannot run in the browser. They spin up a local HTTP server for the callback -- this is a Node.js-only operation.
**Do this instead:** Run the OAuth flow on the Hono backend. The frontend only receives the auth URL and opens it in a new tab.

### Anti-Pattern 2: Storing OAuth Tokens in the Frontend

**What people do:** Send OAuth tokens to the frontend for storage (localStorage, cookies).
**Why it's wrong:** Same as API keys -- tokens are visible in DevTools, vulnerable to XSS. OAuth tokens are even more sensitive because they include refresh tokens (long-lived).
**Do this instead:** Store all credentials server-side in the in-memory store. Frontend only knows "connected via OAuth" or "connected via API key."

### Anti-Pattern 3: Blocking the /start Endpoint Until OAuth Completes

**What people do:** Make the `/api/auth/oauth/start` POST endpoint block until the user completes login (could be 60+ seconds).
**Why it's wrong:** HTTP request will timeout. Frontend has no way to show progress. Browser may kill the connection.
**Do this instead:** Start the flow asynchronously, return the auth URL immediately, and let the frontend poll for completion.

### Anti-Pattern 4: Replacing API Key Auth with OAuth

**What people do:** Remove the API key flow when adding OAuth.
**Why it's wrong:** Some users prefer API keys (developers with existing keys). OAuth requires a Claude Pro/Max or ChatGPT Plus subscription. API keys work with any plan.
**Do this instead:** Keep both auth methods. User chooses which one to use per provider. This is explicitly required by the project's constraints (ADR-005 v1.1).

### Anti-Pattern 5: Ignoring Token Expiry in getApiKey

**What people do:** Return `credentials.access` directly without checking expiry.
**Why it's wrong:** OAuth access tokens expire (typically 1 hour). The Agent calls `getApiKey` before each LLM request. If the token is expired, the LLM call fails with a 401.
**Do this instead:** Always check `Date.now() >= credentials.expires` in `resolveApiKey()`. If expired, refresh first, then return the new access token. pi-agent-core's `getApiKey` supports async, so this is natural.

---

## Data Flow: Complete Request Lifecycle with OAuth

```
User sends chat message
    |
    v
Frontend: POST /api/chat { message, model, provider: "anthropic" }
    |
    v
Backend: chat.ts receives request
    |
    v
Backend: hasAnyCredentials("anthropic") ?
    |
    +-- No  --> 401 "Not authenticated"
    +-- Yes --> continue
    |
    v
Backend: createAgent({ provider: "anthropic", modelId: "claude-sonnet-4" })
    |
    v
Agent constructor: getApiKey = async (providerName) => {
    |
    v
    resolveApiKey("anthropic")
        |
        +-- apiKeyStore has "anthropic"? --> return API key string
        |
        +-- oauthStore has "anthropic"?
            |
            +-- Not expired? --> return credentials.access
            |
            +-- Expired? --> refreshToken() --> update store --> return new access
            |
            +-- Neither store has creds? --> return null (shouldn't happen, checked above)
}
    |
    v
Agent: calls streamSimple(model, context, { apiKey: resolvedKey })
    |
    v
pi-ai: sends request to Anthropic/OpenAI with the API key as Bearer token
    |
    v
SSE streaming back to frontend (unchanged from v1.0)
```

---

## Integration Points

### External Services

| Service | Integration Pattern | Port/URL | Notes |
|---------|---------------------|----------|-------|
| Anthropic OAuth authorize | Browser redirect | `https://claude.ai/oauth/authorize` | User interaction in browser tab |
| Anthropic token endpoint | Backend POST | `https://platform.claude.com/v1/oauth/token` | Code exchange + refresh |
| Anthropic callback | Local HTTP server | `127.0.0.1:53692` | Temporary, auto-shutdown |
| OpenAI OAuth authorize | Browser redirect | `https://auth.openai.com/oauth/authorize` | User interaction in browser tab |
| OpenAI token endpoint | Backend POST | `https://auth.openai.com/oauth/token` | Code exchange + refresh |
| OpenAI callback | Local HTTP server | `127.0.0.1:1455` | Temporary, auto-shutdown |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Frontend <-> OAuth routes | REST (POST + GET polling) | No tokens cross this boundary |
| OAuth routes <-> pi-ai OAuth module | Direct function calls | `loginAnthropic()`, `loginOpenAICodex()` |
| Credential store <-> Agent factory | `resolveApiKey()` | Unified interface, async |
| Credential store <-> Chat route | `hasAnyCredentials()` | Auth gate check |

---

## Suggested Build Order

Dependencies determine the order. This integrates with the existing v1.0 codebase.

### Phase 1: Backend OAuth Infrastructure

Build the credential store changes and OAuth route first -- these are self-contained.

1. **Expand `credentials.ts`** -- Add OAuth store, `resolveApiKey()`, `hasAnyCredentials()`
2. **Create `oauth.ts` routes** -- `/api/auth/oauth/start` and `/api/auth/oauth/status`
3. **Mount in `index.ts`** -- Add `app.route("/api/auth/oauth", oauthRoutes)`
4. **Manual test** -- Call `/api/auth/oauth/start` with curl, verify auth URL is returned, complete flow in browser, verify `/api/auth/oauth/status` returns `ok`

**Why first:** All frontend work depends on these endpoints existing. Testing with curl validates the flow works without any UI.

### Phase 2: Agent Factory + Chat Route Updates

Wire the new credential resolver into the agent creation and auth checks.

1. **Update `agent/setup.ts`** -- Change `getApiKey` from static to dynamic `resolveApiKey()`
2. **Update `chat.ts`** -- Replace `getCredentials()` with `hasAnyCredentials()`
3. **Update `models.ts`** -- Replace `hasCredentials()` with `hasAnyCredentials()`
4. **Update existing `auth.ts`** -- Rename `storeCredentials` to `storeApiKey` (align with new naming)

**Why second:** These changes make the backend fully OAuth-capable. After this, a user who completed OAuth can chat -- even without UI changes.

### Phase 3: Frontend OAuth Support

Add the UI for OAuth login alongside the existing API key flow.

1. **Update types** -- Add `AuthMethod`, update `AuthState`
2. **Update `api.ts`** -- Add `startOAuth()` and `pollOAuthStatus()`
3. **Update `useAuth`** -- Add `connectOAuth()` method with polling
4. **Update `ConnectionPage`** -- Add auth method selector, OAuth login buttons
5. **Update `InlineAuth`** -- Add OAuth option for mid-chat re-auth

**Why third:** Frontend depends on backend endpoints (Phase 1) and correct auth gating (Phase 2).

### Dependency Graph

```
Phase 1: Backend OAuth Infrastructure
    |
    v
Phase 2: Agent Factory + Route Updates
    |
    v
Phase 3: Frontend OAuth UI
```

Strictly sequential -- each phase depends on the previous.

---

## Scaling Considerations

| Concern | Current (single-user, in-memory) | If multi-user later |
|---------|----------------------------------|---------------------|
| Credential storage | In-memory Map, process lifetime | Per-user encrypted storage (DB or file) |
| Concurrent OAuth flows | Block second flow (single-user) | Per-user flow tracking with session IDs |
| Token refresh | Single refresh lock per provider | Per-user refresh with mutex |
| OAuth callback ports | Fixed 53692/1455, no conflict | Would need dynamic port allocation or shared proxy |

**For this milestone:** Single-user, in-memory is perfect. No scaling concerns.

---

## Sources

### Official / Authoritative (HIGH confidence)
- pi-ai OAuth module source code: `node_modules/@mariozechner/pi-ai/dist/utils/oauth/` -- inspected directly
- pi-ai OAuth types: `OAuthProviderInterface`, `OAuthCredentials`, `OAuthLoginCallbacks` -- from `types.d.ts`
- pi-agent-core Agent `getApiKey` signature: `(provider: string) => Promise<string | undefined> | string | undefined` -- from `agent.d.ts`
- Anthropic OAuth flow: Authorization Code + PKCE, callback on `127.0.0.1:53692`, token exchange at `https://platform.claude.com/v1/oauth/token`
- OpenAI Codex OAuth flow: Authorization Code + PKCE, callback on `127.0.0.1:1455`, token exchange at `https://auth.openai.com/oauth/token`
- Existing codebase: all source files in `src/server/` and `src/client/` inspected

### Design Decisions (verified against codebase)
- `getApiKey` supports async (Promise) -- from pi-agent-core's `agent.d.ts` line 40
- Both OAuth providers use `usesCallbackServer: true` -- from provider implementation objects
- `getApiKey(credentials)` returns `credentials.access` for both Anthropic and OpenAI -- verified in source
- OpenAI Codex stores `accountId` in credentials -- from `openai-codex.js`
- PKCE uses Web Crypto API (`crypto.subtle`) -- works in Node.js 20+ -- from `pkce.js`

---
*Architecture research for: OAuth integration into Pi AI Chat Web v1.1*
*Researched: 2026-04-04*
