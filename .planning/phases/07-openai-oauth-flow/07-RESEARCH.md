# Phase 7: OpenAI OAuth Flow - Research

**Researched:** 2026-04-05
**Domain:** OpenAI Codex OAuth PKCE flow via pi-ai, provider-remap routing (openai → openai-codex), port 1455 conflict handling, OAuth auto-refresh end-to-end validation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Provider remap helper:** Internal `Provider` type stays `"anthropic" | "openai"`. A new helper `resolvePiProvider(provider: Provider): PiProvider` lives in `credentials.ts` and returns `"openai-codex"` when `provider === "openai"` AND `getAuthStatus(provider).activeMethod === "oauth"`, otherwise returns the provider unchanged. `createAgent` (setup.ts) and `/api/models` (models.ts) call this helper before invoking `getModel` / `getModels` from pi-ai. Centralizes the routing rule in one place so Phase 8 UI continues to see two providers while the backend transparently hits the correct pi-ai model registry.

**D-02 — Per-credential model list:** `/api/models?provider=openai` returns the model list for the ACTIVE credential only. OAuth active → `openai-codex` models (gpt-5.1, gpt-5.1-codex, gpt-5.2, gpt-5.2-codex). API Key active → standard `openai` models (gpt-4o, etc.). Consistent with Phase 5 D-01 (OAuth preferred when both exist). Frontend does not need to know about the split — it gets the models compatible with whatever credential it is about to use.

**D-03 — Route dispatch for OpenAI OAuth:** `POST /api/auth/oauth/start` accepts `provider: "openai"` alongside `"anthropic"`. Dispatch: `provider === "anthropic"` → `loginAnthropic`, `provider === "openai"` → `loginOpenAICodex`. Per-provider `PendingSession` Map from Phase 6 D-01 already supports this — only the hardcoded `if (provider !== "anthropic")` guard needs to go. The same `onAuth` Promise-resolver pattern (Phase 6) captures the auth URL before the route returns.

**D-04 — Port 1455 conflict detection (SC#5):** Pre-check binds a throwaway `http.createServer` on `127.0.0.1:1455` BEFORE calling `loginOpenAICodex`, reusing Phase 6 D-02's `ensurePortFree` helper. On `EADDRINUSE`, return `409` with: *"Port 1455 is already in use by another process. This port is required by the OpenAI Codex OAuth callback. If you have Codex CLI running, please stop it and try again."* On success, close the pre-check server immediately so `loginOpenAICodex` can bind its own listener. `ensurePortFree` becomes a generic `ensurePortFree(port)` call site reused by both providers.

**D-05 — Validate-before-store (OAuth):** NO validation API call before `storeOAuthTokens`. Mirror Phase 6 D-05 — `storeOAuthTokens(provider, creds)` is invoked immediately after `loginOpenAICodex` resolves. Auth/scope failures surface when the user sends the first chat via `/api/chat`. pi-ai internally extracts `accountId` from the JWT at call time so no extra storage is needed. Pitfall 2 (missing `model.request` scope) is mitigated because pi-ai routes OAuth through `openai-codex` models at `chatgpt.com/backend-api`, NOT `api.openai.com/chat/completions`.

**D-06 — SC#4 auto-refresh UAT method:** UAT uses a dev endpoint `POST /api/auth/oauth/debug/force-expire?provider=openai` that mutates the stored `expires` to `Date.now() - 1s`. Next `POST /api/chat` call triggers `resolveCredential` (setup.ts), which detects the expired token and invokes `refreshOpenAICodexToken` for real — proving the end-to-end refresh cycle (mutex, pi-ai refresh call, store update, new access token in chat stream) without waiting for the natural ~6h expiry. The debug endpoint lives in the same `oauthRoutes` sub-router.

**D-07 — Debug endpoint always-on:** Debug force-expire endpoint is ALWAYS enabled (no `NODE_ENV` gate, no removal after UAT). Consistent with project philosophy: POC is local-only, single-user, in-memory, no deploy. Gates add overhead for zero benefit in this context.

**D-08 — SC#3 OAuth token works UAT method:** End-of-phase validation via manual UAT with curl, documented in `07-UAT.md`. Flow: `curl POST /api/auth/oauth/start` with `provider: "openai"`, complete consent in browser, then `curl POST /api/chat` with `provider: "openai"` and a valid Codex `model` (e.g. `gpt-5.1`) to verify the SSE stream flows. Re-uses existing `/api/chat` route — no new test endpoints.

### Claude's Discretion

- Exact signature of `resolvePiProvider` (return type alias, narrowing).
- Placement of `ensurePortFree` if refactored out of `oauth.ts` into a shared util.
- Exact JSON response shape for `POST /debug/force-expire` (status, before/after expires values are nice-to-haves).
- Exact structure of session dispatch — switch statement vs provider → login-function Map both acceptable.
- `onPrompt` / `onManualCodeInput` callback implementations for `loginOpenAICodex` — web context has no CLI path; returning empty string or leaving `onManualCodeInput` undefined is fine (callback server is the happy path).
- Logging strategy for `onProgress` messages (console is sufficient).
- Whether to expose `expires` in `/oauth/status` response to help frontend display token TTL.

### Deferred Ideas (OUT OF SCOPE)

- Exposing `"openai-codex"` as a third provider in the UI — rejected in favor of dynamic remap (D-01); reconsider only if Phase 8 needs user-visible distinction between Codex and standard OpenAI models.
- `onManualCodeInput` paste fallback — rejected for Phase 7 (D-04 keeps 409 behavior). Reconsider if Phase 8 UI surfaces a paste-code flow for headless / port-conflict recovery.
- Validate-before-store via cheap Codex API call — rejected per D-05; reconsider if UAT consistently surfaces scope/auth failures that would be cheaper to catch pre-store.
- Union model list (`/api/models` returning both codex + standard tagged by authMethod) — rejected per D-02; reconsider if Phase 8 wants to preview model compatibility across auth methods.
- Logout/revoke OAuth per provider — deferred to OAUTH-05 (future roadmap).
- Branded callback page — deferred to OAUTH-06 (future roadmap).
- DELETE /oauth/cancel endpoint — still deferred (carried from Phase 6 D-04).
- 5-minute session timeout — still deferred (carried from Phase 6 D-04).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OAUTH-02 | User pode autenticar via OAuth PKCE com OpenAI Codex (`loginOpenAICodex` via pi-ai) | `loginOpenAICodex` API signature verified in pi-ai v0.64.0 source (Standard Stack + Code Examples); provider-remap helper pattern documented (D-01); port 1455 pre-check pattern proven in Phase 6 (D-04); credential persistence via existing `storeOAuthTokens` (Phase 5); dispatch pattern proven in Phase 6's per-provider `PendingSession` Map (D-03). |
| OAUTH-03 | Tokens OAuth sao refreshed automaticamente antes de expirar | `refreshOpenAICodexToken` already imported and wired in Phase 5's `resolveCredential` (setup.ts); per-provider refresh mutex + 60s buffer already implemented; debug force-expire endpoint pattern documented (D-06) to validate end-to-end refresh without waiting 6h. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack lock:** `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core` obrigatorios — `loginOpenAICodex` MUST be sourced from `@mariozechner/pi-ai/oauth`, no replacement or wrapper
- **Infrastructure:** Sem banco de dados, sem deploy, local-only (in-memory state only) — OAuth tokens stay in the Phase 5 in-memory store, no disk persistence
- **Security:** API keys and OAuth tokens nao podem ser expostas no frontend — proxy obrigatorio, tokens stay server-side. Backend never echoes `access`/`refresh` values in responses.
- **GSD workflow:** All edits must go through a GSD command (`/gsd:execute-phase` for this phase)
- **Single-user:** POC for the author; no multi-user OAuth sessions
- **Provider type stability:** Keep frontend-facing `Provider = "anthropic" | "openai"` — the Codex remap is a backend-internal concern (D-01 enforces this).

## Summary

Phase 7 extends the Phase 6 OAuth state machine to the OpenAI Codex flow. The infrastructure is almost entirely in place: `storeOAuthTokens` accepts the exact `OAuthCredentials` shape returned by `loginOpenAICodex`, `refreshOpenAICodexToken` is already wired into Phase 5's `resolveCredential` (setup.ts lines 34-49), and `pendingSessions: Map<Provider, PendingSession>` is already keyed per-provider in `src/server/routes/oauth.ts`. The remaining work is three-fold:

1. **Route dispatch (D-03)** — Remove the `if (provider !== "anthropic")` guard in `POST /start` and add an `else if (provider === "openai")` branch that calls `loginOpenAICodex` instead of `loginAnthropic`. Port pre-check becomes `ensurePortFree(provider === "anthropic" ? 53692 : 1455)`. The Promise-resolver pattern on `onAuth`, the background promise lifecycle, the `storeOAuthTokens` call on success, and the session-guard on status transitions all work identically (`loginOpenAICodex` exposes the same `onAuth: (info: { url, instructions? }) => void` callback shape — verified in `openai-codex.d.ts`).

2. **Provider remap (D-01, D-02)** — pi-ai ships two distinct providers for OpenAI: `"openai"` (standard models, `api.openai.com/chat/completions`, API-key auth) and `"openai-codex"` (Codex models like `gpt-5.1`, `chatgpt.com/backend-api`, OAuth via ChatGPT subscription). These are NOT interchangeable: a standard `"openai"` model passed an OAuth token rejects with a scope error; a Codex model passed an API key fails provider auth. The fix is a centralized `resolvePiProvider` helper in `credentials.ts` that peeks at `getAuthStatus(provider).activeMethod`. Every pi-ai call site that accepts a provider (`getModel` in setup.ts line 62, `getModels` in models.ts line 20) must go through this helper.

3. **Auto-refresh validation (D-06, D-07)** — Natural OpenAI Codex tokens expire after ~6 hours, too long for a UAT loop. A debug endpoint `POST /api/auth/oauth/debug/force-expire?provider=openai` writes `expires = Date.now() - 1_000` into the stored credential. The next chat request triggers `resolveCredential`, which detects the near-expiry (< 60s buffer), takes the per-provider mutex, calls `refreshOpenAICodexToken(credential.refresh)`, stores the new tokens, and returns the new access token to pi-agent-core mid-stream. This exercises the entire refresh path end-to-end, proving OAUTH-03.

The Codex-specific gotcha — port 1455 conflicting with Codex CLI — is handled by the same `ensurePortFree` helper that already protects port 53692. pi-ai's `loginOpenAICodex` has a built-in fallback to manual code paste on EADDRINUSE, but the web UI has no CLI paste path, so the pre-check + 409 response (D-04) is the correct UX. The `onManualCodeInput` callback is deliberately NOT passed so `loginOpenAICodex` never enters paste mode.

**Primary recommendation:** Extend `src/server/routes/oauth.ts` to dispatch both providers, add `resolvePiProvider` to `credentials.ts` as a pure lookup, call it at the two pi-ai integration points (`getModel` in setup.ts, `getModels` in models.ts), and add `POST /debug/force-expire` in `oauthRoutes` for UAT. No new dependencies; all pi-ai APIs are in `@mariozechner/pi-ai@0.64.0` already installed.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mariozechner/pi-ai` | 0.64.0 (installed) | `loginOpenAICodex`, `refreshOpenAICodexToken`, `openaiCodexOAuthProvider`, `getModel`/`getModels` over `"openai-codex"` registry | Validation target — the POC exists to test this; already wired for OpenAI refresh in Phase 5 via `refreshOpenAICodexToken` import |
| `hono` | 4.12.x (installed) | HTTP routing, JSON response envelope | Project backend framework (CLAUDE.md lock) |
| `@hono/node-server` | 1.19.x (installed) | Node.js runtime for Hono | Required for `http.createServer` port pre-check |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:http` | Node.js built-in | Port 1455 pre-check via `createServer().listen()` | D-04 pre-check before `loginOpenAICodex` (same helper as Phase 6's 53692 pre-check) |
| Phase 5 `credentials.ts` | internal | `storeOAuthTokens`, `getActiveCredential`, `getAuthStatus` | Persist OAuth tokens post-completion, drive the `resolvePiProvider` decision |
| Phase 6 `oauth.ts` | internal | `pendingSessions` Map, `ensurePortFree` helper, Promise-resolver for `onAuth` | Extend existing route file — do NOT create a parallel `oauth-openai.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `resolvePiProvider` helper (D-01) | Expose `"openai-codex"` as a third public Provider type | Forces Phase 8 UI to fork on three providers; rejected — remap is a backend-internal routing concern |
| Centralized helper in `credentials.ts` | Inline remap logic at each pi-ai call site | Two call sites today (setup.ts, models.ts) would diverge over time; helper keeps the rule in one place |
| Debug force-expire endpoint (D-06) | Wait 6h for natural expiry, or mock the clock | Natural expiry breaks UAT cadence; clock mocking adds a test-only library dependency; real refresh call is the point of the UAT |
| Enabled always (D-07) | Gate debug endpoint on `NODE_ENV !== "production"` | POC has no production deploy per REQUIREMENTS.md; gating is premature complexity |
| Pre-check port 1455 (D-04) | Catch EADDRINUSE inside `loginOpenAICodex` and fall back to `onManualCodeInput` | Web UI has no paste UX; pre-check produces clearer 409 response than a stalled session waiting for code input |
| Second endpoint `POST /oauth/openai/start` | Extend existing `POST /start` with dispatch (D-03) | Duplicates port-check, Promise-resolver, and session-lifecycle logic; existing per-provider Map already supports multi-provider dispatch |

**Installation:** No new dependencies. Everything required is already in `package.json` via Phase 5 + Phase 6.

**Version verification:**
- `@mariozechner/pi-ai` @ 0.64.0 — confirmed in `node_modules/@mariozechner/pi-ai/package.json`; verified `loginOpenAICodex`, `refreshOpenAICodexToken`, `openaiCodexOAuthProvider` exports in `dist/utils/oauth/index.d.ts` line 15
- `hono` @ ^4.12.0 — project lock (package.json)
- `@hono/node-server` @ ^1.19.0 — project lock
- `node:http` — Node.js >= 18 built-in

**pi-ai v0.64.0 verified surface (direct source inspection):**
- `loginOpenAICodex(options: { onAuth, onPrompt, onProgress?, onManualCodeInput?, originator? }): Promise<OAuthCredentials>` — `openai-codex.d.ts` lines 19-28
- `refreshOpenAICodexToken(refreshToken: string): Promise<OAuthCredentials>` — `openai-codex.d.ts` line 32
- `openaiCodexOAuthProvider: OAuthProviderInterface` (id: `"openai-codex"`, `usesCallbackServer: true`) — `openai-codex.js` lines 354-372
- `OAuthCredentials = { refresh: string, access: string, expires: number, [key: string]: unknown }` — `types.d.ts` lines 2-7 (shape identical to Anthropic; pi-ai adds `accountId` as an extra field but Phase 5's `storeOAuthTokens` picks only `{access, refresh, expires}` which is the minimum contract)
- `KnownProvider` includes `"openai"` AND `"openai-codex"` as distinct entries — `types.d.ts` line 5
- `MODELS["openai-codex"]` contains: `gpt-5.1`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, `gpt-5.2`, `gpt-5.2-codex`, `gpt-5.3-codex` — all with `api: "openai-codex-responses"`, `baseUrl: "https://chatgpt.com/backend-api"` — `models.generated.js` lines 5814+

## Architecture Patterns

### Recommended Project Structure
```
src/server/
├── routes/
│   ├── oauth.ts            # EXTEND: dispatch both providers, add /debug/force-expire
│   ├── auth.ts             # UNCHANGED: /apikey, /status (Phase 5 authoritative)
│   ├── models.ts           # EDIT: call resolvePiProvider before getModels
│   └── chat.ts             # UNCHANGED: passes provider to createAgent; createAgent handles remap
├── agent/
│   └── setup.ts            # EDIT: call resolvePiProvider before getModel
├── lib/
│   └── credentials.ts      # EXTEND: add resolvePiProvider helper + PiProvider type
└── index.ts                # UNCHANGED: oauthRoutes already mounted at /api/auth/oauth
```

### Pattern 1: Provider-dispatch inside existing route
**What:** `POST /start` uses the provider from the request body to select which pi-ai login function to call. Everything else (port pre-check, Promise-resolver on `onAuth`, background promise, session map update, status endpoint) stays provider-agnostic.
**When to use:** When adding a second OAuth provider to an existing per-provider session Map (D-01 from Phase 6 was designed for this).
**Example:**
```typescript
// Source: pi-ai v0.64.0 dist/utils/oauth/openai-codex.d.ts + existing Phase 6 oauth.ts pattern
import { loginAnthropic, loginOpenAICodex } from "@mariozechner/pi-ai/oauth"

const ANTHROPIC_OAUTH_PORT = 53692
const OPENAI_OAUTH_PORT = 1455

function portForProvider(provider: Provider): number {
  return provider === "anthropic" ? ANTHROPIC_OAUTH_PORT : OPENAI_OAUTH_PORT
}

function loginFnForProvider(provider: Provider) {
  return provider === "anthropic" ? loginAnthropic : loginOpenAICodex
}

// Inside POST /start, after port pre-check succeeds:
const loginFn = loginFnForProvider(provider)
loginFn({
  onAuth: (info) => resolveAuthUrl(info.url),
  onPrompt: async () => "",            // no CLI paste path in web UI
  onProgress: (msg) => console.log(`[oauth:${provider}] ${msg}`),
  // deliberately no onManualCodeInput — callback server is the only acquisition path
})
  .then((creds) => {
    storeOAuthTokens(provider, creds)
    if (pendingSessions.get(provider) === session) session.status = "done"
  })
  .catch((err) => { /* same as Phase 6 */ })
```

### Pattern 2: Provider remap at pi-ai call sites
**What:** A pure helper `resolvePiProvider(provider: Provider): "anthropic" | "openai" | "openai-codex"` reads the active auth method and returns the pi-ai provider slug that is compatible with whichever credential will be used.
**When to use:** Every place that calls `getModel`, `getModels`, or any other pi-ai function keyed by provider slug.
**Example:**
```typescript
// Source: decision D-01; verified against pi-ai v0.64.0 types.d.ts line 5 (KnownProvider)
// In src/server/lib/credentials.ts:
export type PiProvider = "anthropic" | "openai" | "openai-codex"

export function resolvePiProvider(provider: Provider): PiProvider {
  if (provider === "openai" && getAuthStatus("openai").activeMethod === "oauth") {
    return "openai-codex"
  }
  return provider
}

// In src/server/agent/setup.ts createAgent (replaces line 62):
const model = getModel(resolvePiProvider(provider), modelId)

// In src/server/routes/models.ts (replaces line 20):
const models = getModels(resolvePiProvider(typedProvider))
```

### Pattern 3: Debug force-expire for refresh UAT
**What:** A Phase-7-scoped dev endpoint that mutates the stored OAuth credential's `expires` field to trigger the existing refresh path on the next chat request. Writes directly into the store via a new credentials.ts helper (e.g. `forceExpireOAuth(provider)`).
**When to use:** When the natural token lifetime is too long to exercise refresh in a manual UAT loop (~6h for OpenAI Codex, ~1h for Anthropic).
**Example:**
```typescript
// Source: D-06; credentials.ts in-memory store is already keyed per-provider
// New helper in credentials.ts:
export function forceExpireOAuth(provider: Provider): { ok: boolean; previousExpires?: number } {
  const entry = store.get(provider)
  if (!entry?.oauth) return { ok: false }
  const previous = entry.oauth.expires
  entry.oauth.expires = Date.now() - 1000  // 1s in the past
  return { ok: true, previousExpires: previous }
}

// New route in oauthRoutes:
oauthRoutes.post("/debug/force-expire", (c) => {
  const provider = c.req.query("provider") as Provider | undefined
  if (!provider || !["anthropic", "openai"].includes(provider)) {
    return c.json({ status: "error", message: "Invalid provider" }, 400)
  }
  const result = forceExpireOAuth(provider)
  if (!result.ok) return c.json({ status: "error", message: "No OAuth credential stored" }, 404)
  return c.json({ status: "ok", provider, previousExpires: result.previousExpires, newExpires: Date.now() - 1000 })
})
```

### Anti-Patterns to Avoid
- **Calling `getModel("openai", "gpt-5.1")` with OAuth credential** — `"openai"` provider maps to the API-key registry (gpt-4o, gpt-4o-mini, etc.) using `api.openai.com/chat/completions`. Codex models only exist under `"openai-codex"` at `chatgpt.com/backend-api`. The `resolvePiProvider` helper (D-01) prevents this.
- **Passing `onManualCodeInput` callback in Phase 7** — it races with the callback server (verified in `openai-codex.js` lines 249-293). Web UI has no paste field; omitting this callback makes the callback server the only acquisition path (happy path) and fails cleanly if the port is blocked.
- **Awaiting `loginOpenAICodex` inside the route handler** — it blocks until the user completes consent in the browser (which can be seconds or minutes). Use the background-promise + Promise-resolver pattern already proven in Phase 6.
- **Storing `accountId` in the credential store** — pi-ai re-extracts `chatgpt_account_id` from the JWT at every call (`openai-codex-responses.js` line 81: `const accountId = extractAccountId(apiKey)`). Phase 5's `storeOAuthTokens` correctly persists only `{access, refresh, expires}`.
- **Gating debug endpoint on NODE_ENV** — D-07 rejects this; POC has no production deploy.
- **Introducing a second OAuth route file** — extend existing `oauth.ts`; the per-provider Map + ensurePortFree already supports multi-provider dispatch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PKCE challenge/verifier generation | Custom crypto.randomBytes + SHA-256 + base64url encoder | pi-ai's `loginOpenAICodex` | Already implemented in `pi-ai/dist/utils/oauth/pkce.js`; OAuth 2.0 PKCE has subtle base64url encoding rules |
| OAuth callback HTTP server on port 1455 | Custom `http.createServer` with state validation and HTML response pages | `loginOpenAICodex` (it creates the server) | pi-ai v0.64.0 already binds `127.0.0.1:1455`, validates `state`, parses `code`, renders success/error HTML pages, calls `options.onAuth` |
| Token exchange with `https://auth.openai.com/oauth/token` | Custom `fetch` with `grant_type=authorization_code` + `code_verifier` + `client_id` body | `loginOpenAICodex` (it does the exchange) | Already implemented in `openai-codex.js` lines 72-100; handles error responses |
| Refresh token exchange | Custom refresh fetch with `grant_type=refresh_token` | `refreshOpenAICodexToken(refreshToken)` | Already implemented; returns fresh `OAuthCredentials` with new `access`, `refresh`, `expires` |
| accountId extraction from JWT | Custom base64 decode + JSON parse + claim path lookup | pi-ai's `openai-codex-responses.js` provider adapter | `extractAccountId(apiKey)` is called at chat-request time (line 81), automatically setting `chatgpt-account-id` header on the Codex API call. Zero storage required. |
| Refresh mutex / single-flight | New Map<Provider, Promise> | Phase 5's `refreshInFlight` Map in setup.ts | Already implemented with 60s buffer; handles OpenAI via the generic `provider` key |
| Provider slug routing for model lookups | Conditional logic scattered across call sites | `resolvePiProvider` helper (D-01) | Two call sites today; helper keeps routing rule in one place, trivial to test in isolation |
| Credential store | New Map + serialization | Phase 5's `getActiveCredential`, `storeOAuthTokens`, `getAuthStatus` | Already handles compound credentials, OAuth-preferred policy, per-type clearing |

**Key insight:** Phase 7 is primarily *wiring* — connecting existing pi-ai OAuth primitives to the existing Phase 5 credential infrastructure via the existing Phase 6 route state machine. The only genuinely NEW code is (a) dispatch on provider in `POST /start`, (b) `resolvePiProvider` helper, (c) `forceExpireOAuth` + debug route. Everything else is parameter changes.

## Runtime State Inventory

> Phase 7 is an additive wiring phase, not a rename/refactor. This section is included for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | OAuth credentials will be added to the existing in-memory `store: Map<Provider, ProviderCredentials>` at key `"openai"`. No existing OpenAI OAuth entries to migrate (Phase 7 is first introduction). | None — new entries only |
| Live service config | None — the Codex OAuth app at `auth.openai.com` is pre-registered by pi-ai (CLIENT_ID `app_EMoamEEZ73f0CkXaXp7hrann`, scope `openid profile email offline_access`). No project-side app registration. | None |
| OS-registered state | pi-ai's `loginOpenAICodex` dynamically binds `127.0.0.1:1455` at runtime and closes it on completion. No persistent OS registration. Codex CLI, if installed, may own port 1455 — handled by D-04 pre-check. | User must stop Codex CLI before OAuth start (surfaced via 409 error message) |
| Secrets/env vars | None — no environment variable dependencies introduced. The OAuth CLIENT_ID is hardcoded in pi-ai's `openai-codex.js` line 20. | None |
| Build artifacts | None — no code generation, no compiled artifacts named after providers. | None |

**Verified by:** Direct source inspection of `node_modules/@mariozechner/pi-ai/dist/utils/oauth/openai-codex.js` and `src/server/lib/credentials.ts`.

## Common Pitfalls

### Pitfall 1: Port 1455 conflict with Codex CLI
**What goes wrong:** User has Codex CLI running (which binds `127.0.0.1:1455` for its own OAuth callback). `loginOpenAICodex` is called, its internal `server.listen(1455, "127.0.0.1")` fails with `EADDRINUSE`, pi-ai logs "Falling back to manual paste" (`openai-codex.js` line 209), and `waitForCode()` resolves `null`. Without `onManualCodeInput`, the flow then waits for `onPrompt` to return a code — but in a web context `onPrompt` returns empty string (per D-03/D-04), so `loginOpenAICodex` throws `"Missing authorization code"`.
**Why it happens:** Port 1455 is hardcoded by pi-ai because the OAuth redirect URI `http://localhost:1455/auth/callback` is pre-registered with OpenAI's OAuth app and cannot be changed client-side.
**How to avoid:** Pre-check port 1455 with `ensurePortFree(1455)` BEFORE calling `loginOpenAICodex` (D-04). On `EADDRINUSE`, return HTTP 409 with a message naming Codex CLI as the likely cause. Close the pre-check server immediately so pi-ai can bind its own.
**Warning signs:** UAT hangs at "browser should open" step; no auth URL ever returned; backend logs show "Falling back to manual paste" then "Missing authorization code" rejection.
**Confidence:** HIGH — verified in pi-ai source `openai-codex.js` line 199 + fallback path lines 208-222.

### Pitfall 2: Wrong pi-ai provider slug → scope mismatch at chat time
**What goes wrong:** Backend stores OpenAI OAuth tokens, user sends chat with `provider: "openai"` and `model: "gpt-5.1"`. If `createAgent` calls `getModel("openai", "gpt-5.1")`, pi-ai throws because `gpt-5.1` does not exist under the `"openai"` provider — it exists under `"openai-codex"`. Alternatively, if somehow the `"openai"` API adapter IS invoked with a Codex model name, it calls `api.openai.com/chat/completions` with an OAuth Bearer token, which gets rejected with a scope error (`model.request` missing).
**Why it happens:** pi-ai treats `"openai"` (API-key, api.openai.com) and `"openai-codex"` (OAuth, chatgpt.com/backend-api) as distinct providers with separate model registries and API adapters. They share NO models. The OAuth token scope `openid profile email offline_access` is valid for `chatgpt.com/backend-api` but NOT for `api.openai.com`.
**How to avoid:** Route through `resolvePiProvider` (D-01) at every pi-ai call site. When auth method is OAuth, map `"openai"` → `"openai-codex"` BEFORE calling `getModel`/`getModels`. This ensures Codex models are resolved and the Codex API adapter is used.
**Warning signs:** Chat request returns `"Model not found"` or `"unsupported provider configuration"`; backend makes request to `api.openai.com` with Bearer token and gets 401/403; `/api/models` returns an empty list or standard GPT models instead of gpt-5.1 when OAuth is active.
**Confidence:** HIGH — verified by inspecting `pi-ai/dist/models.generated.js` (separate "openai" and "openai-codex" registries) + `openai-codex-responses.js` DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api".

### Pitfall 3: Stale accountId if credential is copy-pasted between users
**What goes wrong:** Not applicable to this POC (single-user), but worth noting: pi-ai extracts `chatgpt_account_id` from the access-token JWT at every call (`extractAccountId(apiKey)` in `openai-codex-responses.js` line 81). If someone copied a stored credential from one machine to another, the accountId would still match because it travels inside the JWT.
**Why it happens:** By design — pi-ai stores `accountId` on the returned `OAuthCredentials` (see `openai-codex.js` line 328) but does NOT rely on the stored value at call time; it re-derives from the token.
**How to avoid:** Do NOT persist `accountId` separately; Phase 5's `storeOAuthTokens` already drops it (keeps only `access`, `refresh`, `expires`). Let pi-ai do the extraction.
**Warning signs:** None in single-user POC.
**Confidence:** HIGH — verified in pi-ai source.

### Pitfall 4: Refresh token race mid-stream
**What goes wrong:** Chat SSE stream is active, token approaches 60s-before-expiry mid-stream, pi-agent-core calls `getApiKey` for the next LLM sub-request (e.g. tool-call fan-out), `resolveCredential` detects near-expiry, initiates refresh. Meanwhile another concurrent chat request also detects near-expiry and attempts its own refresh with the same refresh token — second refresh fails because refresh tokens are single-use.
**Why it happens:** Concurrent `getApiKey` calls without a mutex would both pass the expiry check and both hit `refreshOpenAICodexToken`. OpenAI rejects the second call (refresh token already consumed).
**How to avoid:** ALREADY SOLVED by Phase 5's `refreshInFlight: Map<Provider, Promise<string | undefined>>` in setup.ts. Second caller awaits the in-flight promise instead of starting its own. No Phase 7 work required — but the force-expire UAT endpoint (D-06) MUST respect this (i.e. don't bypass `resolveCredential`).
**Warning signs:** UAT force-expire test followed by multiple chat requests returns `401` on some streams but not others; backend logs show multiple simultaneous "refreshing OpenAI token" messages.
**Confidence:** HIGH — verified in `src/server/agent/setup.ts` lines 14, 31-52.

### Pitfall 5: Second `/start` during active flow leaks port listener
**What goes wrong:** User triggers `POST /start` for OpenAI, then triggers it again before the first completes. Per Phase 6 D-03, second call discards the first session from `pendingSessions` but the first `loginOpenAICodex` promise is still alive and its callback server still bound to port 1455. The second `/start` tries its port pre-check and gets `EADDRINUSE` → 409.
**Why it happens:** pi-ai's `loginOpenAICodex` closes its server only in `finally` (line 331) after the promise resolves or rejects. An "orphaned" promise (no consumer) takes longer to settle.
**How to avoid:** Either (a) accept this as correct behavior (409 surfaces the stale flow, user waits for timeout or kills backend — matches Phase 6 D-04), or (b) add an explicit session-abort that cancels the pi-ai flow (deferred). D-03/D-04 carry forward: single-user POC accepts "second /start retries port check, 409 surfaces the conflict".
**Warning signs:** UAT "retry /start" test returns 409 with "Port 1455 in use" even though Codex CLI is not running.
**Confidence:** HIGH — verified in `openai-codex.js` line 331 (`finally { server.close() }`).

### Pitfall 6: `onPrompt` returning empty string but not `onManualCodeInput` missing
**What goes wrong:** Edge case — if `loginOpenAICodex`'s callback server succeeds but `waitForCode` resolves without a code (e.g. state mismatch after retry), pi-ai falls through to `onPrompt` asking for a paste. If `onPrompt` returns `""`, `parseAuthorizationInput("")` returns `{ code: undefined }`, and pi-ai throws `"Missing authorization code"` cleanly. This is the designed-for behavior.
**Why it happens:** Web context has no user-facing prompt; fallback path is acceptable IF it fails fast and loudly.
**How to avoid:** Implement `onPrompt: async () => ""` exactly as Phase 6 does for `loginAnthropic`. Do NOT implement `onManualCodeInput`. The resulting "Missing authorization code" error bubbles up to the background-promise `.catch` and becomes `session.error` visible in `/oauth/status`.
**Warning signs:** `/oauth/status` returns `{ status: "error", message: "Missing authorization code" }` after user completed browser consent — indicates callback server did not receive the code (port conflict, state mismatch, browser closed early).
**Confidence:** HIGH — verified in `openai-codex.js` lines 303-314.

## Code Examples

Verified patterns from pi-ai v0.64.0 source and Phase 6 working implementation:

### Example 1: `loginOpenAICodex` invocation with web-context callbacks
```typescript
// Source: node_modules/@mariozechner/pi-ai/dist/utils/oauth/openai-codex.d.ts lines 19-28
// Usage pattern mirrors src/server/routes/oauth.ts lines 81-101 (loginAnthropic)
import { loginOpenAICodex } from "@mariozechner/pi-ai/oauth"

loginOpenAICodex({
  onAuth: (info) => {
    // info.url is the https://auth.openai.com/oauth/authorize?... URL
    // info.instructions is optional extra text ("A browser window should open...")
    resolveAuthUrl(info.url)  // Promise resolver from the route handler
  },
  onPrompt: async () => "",   // Web context has no CLI paste path
  onProgress: (msg) => console.log(`[oauth:openai] ${msg}`),
  // onManualCodeInput: NOT PASSED — callback server is the only acquisition path
  // originator: NOT PASSED — defaults to "pi" (fine for our CLIENT_ID)
})
  .then((creds) => {
    // creds: { access, refresh, expires, accountId } — pi-ai adds accountId
    // storeOAuthTokens picks only {access, refresh, expires} (Phase 5 contract)
    storeOAuthTokens("openai", creds)
    // session-guard from Phase 6:
    if (pendingSessions.get("openai") === session) session.status = "done"
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    if (pendingSessions.get("openai") === session) {
      session.status = "error"
      session.error = message
    }
    rejectAuthUrl(err)  // unblocks the authUrl Promise if onAuth never fired
  })
```

### Example 2: Port pre-check with provider-aware port selection
```typescript
// Source: decision D-04 + existing ensurePortFree helper in src/server/routes/oauth.ts lines 18-26
const PORT_BY_PROVIDER: Record<Provider, number> = {
  anthropic: 53692,
  openai: 1455,
}

const port = PORT_BY_PROVIDER[provider]
try {
  await ensurePortFree(port)
} catch (err: unknown) {
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === "EADDRINUSE") {
    const conflictMessage = provider === "anthropic"
      ? "Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again."
      : "Port 1455 is already in use by another process. This port is required by the OpenAI Codex OAuth callback. If you have Codex CLI running, please stop it and try again."
    return c.json({ status: "error", message: conflictMessage }, 409)
  }
  return c.json(
    { status: "error", message: `Could not probe port ${port}: ${code ?? "unknown error"}` },
    500
  )
}
```

### Example 3: `resolvePiProvider` helper with narrow return type
```typescript
// Source: decision D-01; verified pi-ai v0.64.0 KnownProvider in types.d.ts line 5
// In src/server/lib/credentials.ts (new export)

// Narrow type to exactly the three providers we route to:
export type PiProvider = "anthropic" | "openai" | "openai-codex"

export function resolvePiProvider(provider: Provider): PiProvider {
  // Only remap OpenAI + OAuth → openai-codex
  // Anthropic stays "anthropic" for both API-key and OAuth
  // OpenAI + API-key stays "openai"
  if (provider === "openai" && getAuthStatus("openai").activeMethod === "oauth") {
    return "openai-codex"
  }
  return provider
}
```

### Example 4: `getModel` with remap in `createAgent`
```typescript
// Source: src/server/agent/setup.ts line 62 (current) → below (after D-01)
import { resolvePiProvider } from "../lib/credentials"

export function createAgent({ provider, modelId, systemPrompt }: CreateAgentOptions): Agent {
  // resolvePiProvider returns a pi-ai KnownProvider slug; modelId cast remains
  // because pi-ai's getModel uses template-literal type inference that doesn't
  // narrow when the provider is itself a union at the call site.
  const piProvider = resolvePiProvider(provider)
  const model = getModel(piProvider, modelId as any)
  // ... rest unchanged
}
```

### Example 5: `/api/models` with remap
```typescript
// Source: src/server/routes/models.ts line 20 (current) → below (after D-01/D-02)
import { hasAnyCredential, resolvePiProvider } from "../lib/credentials"

modelRoutes.get("/", (c) => {
  const provider = c.req.query("provider")
  if (!provider || !["anthropic", "openai"].includes(provider)) {
    return c.json({ error: "Invalid provider. Use 'anthropic' or 'openai'." }, 400)
  }
  const typedProvider = provider as Provider
  if (!hasAnyCredential(typedProvider)) {
    return c.json({ error: "Not authenticated", needsAuth: true }, 401)
  }
  // D-02: return models for the ACTIVE credential
  const models = getModels(resolvePiProvider(typedProvider))
  return c.json({
    models: models.map((m) => ({ id: m.id, name: m.name, reasoning: m.reasoning })),
  })
})
```

### Example 6: `forceExpireOAuth` helper + debug route
```typescript
// Source: decisions D-06 / D-07
// In src/server/lib/credentials.ts:
export function forceExpireOAuth(provider: Provider): { ok: boolean; previousExpires?: number } {
  const entry = store.get(provider)
  if (!entry?.oauth) return { ok: false }
  const previousExpires = entry.oauth.expires
  entry.oauth.expires = Date.now() - 1000
  return { ok: true, previousExpires }
}

// In src/server/routes/oauth.ts (new endpoint, no env gate):
oauthRoutes.post("/debug/force-expire", (c) => {
  const provider = c.req.query("provider") as Provider | undefined
  if (!provider || !["anthropic", "openai"].includes(provider)) {
    return c.json({ status: "error", message: "Invalid provider. Use 'anthropic' or 'openai'." }, 400)
  }
  const result = forceExpireOAuth(provider)
  if (!result.ok) {
    return c.json({ status: "error", message: "No OAuth credential stored for this provider" }, 404)
  }
  const newExpires = Date.now() - 1000
  return c.json({
    status: "ok",
    provider,
    previousExpires: result.previousExpires,
    newExpires,
    note: "Next /api/chat call will trigger refresh via resolveCredential",
  })
})
```

### Example 7: `refreshOpenAICodexToken` already wired in setup.ts
```typescript
// Source: src/server/agent/setup.ts lines 34-49 — NO Phase 7 changes needed here
// Included for reference — this is what the force-expire UAT exercises

const refreshPromise = (async (): Promise<string | undefined> => {
  try {
    const newCreds: OAuthCredentials = provider === "anthropic"
      ? await refreshAnthropicToken(credential.refresh)
      : await refreshOpenAICodexToken(credential.refresh)
    storeOAuthTokens(provider, newCreds)
    return newCreds.access
  } catch {
    return undefined
  } finally {
    refreshInFlight.delete(provider)
  }
})()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single OpenAI provider slug for both API-key and OAuth | pi-ai splits into `"openai"` + `"openai-codex"` with distinct registries | pi-ai ≥ 0.50 (Codex OAuth subscription models added) | Phase 7 must remap at call sites (D-01) |
| OAuth credentials include `accountId` persistently | JWT-embedded `chatgpt_account_id`, re-extracted at call time | pi-ai ≥ 0.60 | Phase 5's `storeOAuthTokens` correctly drops it; zero storage overhead |
| Manual token refresh cron / periodic check | Refresh-on-demand inside `getApiKey` callback with 60s buffer | Phase 5 (CRED-02) | Phase 7 inherits this; no new refresh orchestration needed |
| `openai-codex` API served from `api.openai.com` | `chatgpt.com/backend-api` with OAuth Bearer + `chatgpt-account-id` header | pi-ai ≥ 0.55 | Scope `openid profile email offline_access` is sufficient; no `model.request` scope required (verified in D-05 analysis) |

**Deprecated/outdated:**
- The original v1.0 assumption that OAuth requires `model.request` scope — incorrect; that scope applies to `api.openai.com/chat/completions`, NOT to `chatgpt.com/backend-api` used by `openai-codex` models. Verified in D-05. Risk from STATE.md blockers list is mitigated.
- Assuming `loginOpenAICodex` returns just `{access, refresh, expires}` — it actually returns those PLUS `accountId` (verified in `openai-codex.js` line 324-329). Phase 5's `storeOAuthTokens` handles this correctly (ignores extra fields).

## Open Questions

1. **Does UAT require logging in with a real ChatGPT Plus/Pro account?**
   - What we know: `loginOpenAICodex` routes through `auth.openai.com/oauth/authorize` which is a standard ChatGPT login. CLIENT_ID is `app_EMoamEEZ73f0CkXaXp7hrann`, the pi-ai (Codex CLI) registered app.
   - What's unclear: Whether a free ChatGPT account can authorize or whether a Plus/Pro subscription is mandatory for the resulting token to call `chatgpt.com/backend-api/responses` successfully. OpenAI's docs for the `openai-codex` backend are not public.
   - Recommendation: UAT prerequisite should say "ChatGPT Plus/Pro account (Codex access required)" — human tester will self-gate. If free accounts work, SC#3 passes; if they don't, error will be surfaced in chat response with a clear message (D-05 accepts this).

2. **Exact TTL of OpenAI Codex OAuth access tokens**
   - What we know: pi-ai sets `expires = Date.now() + json.expires_in * 1000` (`openai-codex.js` line 98). `expires_in` is provider-driven.
   - What's unclear: Whether `expires_in` is consistently ~6h (CONTEXT.md assumption) or varies.
   - Recommendation: Not a blocker — D-06 force-expire endpoint makes TTL irrelevant for UAT. Log the actual `expires - now` value once during implementation to record it.

3. **Whether `/oauth/status` should expose the OAuth `expires` value**
   - What we know: Claude's Discretion explicitly lists this as open ("Whether to expose `expires` in `/oauth/status` response to help frontend display token TTL").
   - What's unclear: Phase 8 UI-03 needs token-health badges; `expires` would be useful but `/api/auth/status` (Phase 5) already exposes `oauthExpiry`.
   - Recommendation: Do NOT add to `/oauth/status`. Frontend should consume `/api/auth/status` for token TTL (consistent with Phase 5's role as authoritative post-completion source). Keeps `/oauth/status` focused on the transient flow state.

## Environment Availability

> Phase 7 depends primarily on the existing Node.js backend + pi-ai stack. All external network dependencies are pre-registered by pi-ai.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@mariozechner/pi-ai@0.64.x` with `loginOpenAICodex` export | D-03, Example 1 | ✓ | 0.64.0 installed | — |
| Node.js ≥ 18 (for `node:http`, `node:crypto`) | Port pre-check, pi-ai's callback server | ✓ | Project runtime | — |
| Port 1455 free at OAuth-start time | `loginOpenAICodex` callback server | Runtime-checked | — | 409 error with Codex CLI message (D-04) |
| Outbound HTTPS to `auth.openai.com` | OAuth authorize + token exchange (pi-ai internal) | ✓ (assumed) | — | Error bubbles up via `session.error` |
| Outbound HTTPS to `chatgpt.com/backend-api` | Codex chat completions (UAT) | ✓ (assumed) | — | Chat request fails with clear error |
| ChatGPT Plus/Pro account with Codex access | UAT step D-08 (real chat call) | User-dependent | — | None — UAT cannot complete SC#3 without valid account |
| Browser on same machine as backend | OAuth consent redirect to `localhost:1455` | ✓ (local-only POC) | — | None — web flow requires browser |

**Missing dependencies with no fallback:**
- ChatGPT Plus/Pro account — UAT step D-08 (SC#3) cannot validate without it. Human tester self-gates.

**Missing dependencies with fallback:**
- Port 1455 — pre-check returns 409 with Codex CLI guidance (D-04). User stops Codex CLI and retries.

## Validation Architecture

> **SKIPPED** — `.planning/config.json` has `workflow.nyquist_validation: false`. No automated test requirements to document.

## Sources

### Primary (HIGH confidence) — direct source inspection
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/openai-codex.d.ts` — `loginOpenAICodex`, `refreshOpenAICodexToken`, `openaiCodexOAuthProvider` signatures (lines 19-33)
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/openai-codex.js` — PKCE, callback server binding to 127.0.0.1:1455, CLIENT_ID, scope, code exchange, refresh implementation, accountId extraction
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/types.d.ts` — `OAuthCredentials`, `OAuthLoginCallbacks`, `OAuthProviderInterface`
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/index.d.ts` line 15 — exports of `loginOpenAICodex`, `refreshOpenAICodexToken`, `openaiCodexOAuthProvider`
- `node_modules/@mariozechner/pi-ai/dist/providers/openai-codex-responses.js` lines 77-89 — `extractAccountId` at call time, `buildSSEHeaders` with `chatgpt-account-id`, `DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api"`
- `node_modules/@mariozechner/pi-ai/dist/models.generated.js` lines 5814+ — `"openai-codex"` model registry (gpt-5.1, gpt-5.1-codex, gpt-5.1-codex-max, gpt-5.1-codex-mini, gpt-5.2, gpt-5.2-codex, gpt-5.3-codex)
- `node_modules/@mariozechner/pi-ai/dist/types.d.ts` line 5 — `KnownProvider` includes both `"openai"` and `"openai-codex"`
- `node_modules/@mariozechner/pi-ai/dist/models.d.ts` lines 6-8 — `getModel`, `getModels` signatures
- `node_modules/@mariozechner/pi-ai/package.json` exports map — `./oauth` subpath exposing `dist/utils/oauth/index.js`

### Primary (HIGH confidence) — project internal verified
- `src/server/lib/credentials.ts` — store shape, `storeOAuthTokens`, `getActiveCredential`, `getAuthStatus`
- `src/server/agent/setup.ts` lines 14, 31-49, 62 — `refreshInFlight` mutex, `resolveCredential`, `getModel` call site
- `src/server/routes/oauth.ts` — Phase 6 template for dispatch + port pre-check + Promise-resolver + background-promise lifecycle
- `src/server/routes/models.ts` line 20 — `getModels` call site
- `src/server/routes/chat.ts` lines 9-22 — `/api/chat` contract (expects `message` / `model` / `provider` fields)
- `src/server/index.ts` line 13 — `oauthRoutes` mounted at `/api/auth/oauth`
- `package.json` — version locks for pi-ai 0.64.0, hono 4.12.x, @hono/node-server 1.19.x

### Secondary (MEDIUM confidence) — project research docs
- `.planning/research/PITFALLS.md` Pitfalls 3, 4, 5 — port conflicts, CLI-only constraint, refresh race
- `.planning/phases/06-anthropic-oauth-flow/06-RESEARCH.md` — Phase 6 template research (same patterns)
- `.planning/phases/06-anthropic-oauth-flow/06-UAT.md` — Phase 6 UAT approach (template for Phase 7 UAT)
- `.planning/research/ARCHITECTURE.md` §OAuth Login Flow — sequence diagram
- `.planning/phases/05-credential-infrastructure/05-CONTEXT.md` — D-01 OAuth preferred, D-04 async refresh

### Tertiary (LOW confidence) — flagged for human judgment
- ChatGPT Plus/Pro subscription requirement for Codex OAuth — inferred from pi-mono docs and Codex CLI behavior; no authoritative public docs. UAT tester self-gates.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct source inspection of pi-ai v0.64.0, all exports verified
- Architecture (dispatch, remap, force-expire): HIGH — patterns copied from working Phase 6 code + verified against pi-ai types
- Pitfalls: HIGH — 6 pitfalls all verified against pi-ai source line numbers or existing Phase 5/6 code
- Environment: MEDIUM — network availability assumed; ChatGPT account requirement inferred
- Subscription requirement for UAT: LOW — user must verify manually

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (30 days — pi-ai moves fast but v0.64.0 is pinned locally; Phase 7 does NOT require staying current with pi-ai minor releases)

---
*Phase: 07-openai-oauth-flow*
*Research complete: 2026-04-05*
