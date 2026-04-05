# Phase 6: Anthropic OAuth Flow - Research

**Researched:** 2026-04-05
**Domain:** OAuth 2.0 PKCE flow orchestration via pi-ai, Hono async route state, in-memory per-provider session tracking
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Session state model:** Backend tracks in-flight OAuth flows via `Map<Provider, PendingSession>` keyed by provider. Each slot holds the `loginAnthropic` promise, captured auth URL, status (`pending` | `done` | `error`), and error message. Forward-compatible with Phase 7 (OpenAI) without refactor; supports running Anthropic and OpenAI OAuth concurrently when Phase 7 lands.

**D-02 — Port 53692 conflict detection (SC#4):** Pre-check binds a throwaway `http.createServer` on `127.0.0.1:53692` **before** calling `loginAnthropic`. If bind fails with `EADDRINUSE`, return `409` with an explicit message mentioning Claude Code CLI as the most likely cause: *"Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again."* On success, close the pre-check server immediately and proceed to `loginAnthropic` (which opens its own listener on that port).

**D-03 — Flow lifecycle (cancel / retry):** Second `POST /start` for the same provider aborts the first. Implementation: discard the old `PendingSession` from the Map (orphaned promise left to reject naturally when its callback server is closed by pi-ai's `finally`). New pre-check handles residual port contention deterministically because the port will be either free or still-held by the previous flow (409 surfaces the conflict).

**D-04 — No timeout, no cancel endpoint:** No timeout and no explicit `DELETE /cancel` endpoint. Single-user POC accepts "user restarts the server if OAuth hangs forever" as a valid recovery path. New `/start` calls are the only retry mechanism.

**D-05 — SC#3 verification via manual UAT:** End-of-phase validation uses manual UAT via curl, documented in `06-UAT.md`. Flow: start OAuth via `curl POST /api/auth/oauth/start`, complete consent in browser, then `curl POST /api/chat` with `provider: "anthropic"` and verify stream response. Re-uses existing `/api/chat` route (no new test endpoints). Phase 8 delivers the real UI.

### Claude's Discretion

- Route path structure — likely `/api/auth/oauth/start` and `/api/auth/oauth/status` to coexist with existing `/api/auth/apikey` and `/api/auth/status`.
- Exact JSON response shape for `/start` and `/status` (must at minimum expose the auth URL and provider; status must expose pending/done/error + any error message).
- Internal `PendingSession` TypeScript type and how the captured auth URL is exposed by the `onAuth` callback (likely a resolver on a Promise).
- Auto-clear semantics for `/status` after a completed flow (clear on first read vs persist until new /start) — either is acceptable; `/api/auth/status` (Phase 5) is the authoritative post-completion source.
- `onPrompt` / `onManualCodeInput` callback implementations for `loginAnthropic` — web context has no CLI prompt path; returning an empty string or rejecting is fine since the callback server is the happy path.
- Logging strategy for `onProgress` messages (console is sufficient).

### Deferred Ideas (OUT OF SCOPE)

- Branded custom callback HTML page (replacing pi-ai's built-in success/error pages) — future OAUTH-06 in REQUIREMENTS.md.
- OAuth logout/revoke endpoint per provider — future OAUTH-05 in REQUIREMENTS.md.
- `DELETE /oauth/cancel` endpoint — deferred per D-04; reconsider if Phase 8 UI requires explicit user-driven cancel.
- 5-minute session timeout with automatic cleanup — deferred per D-04.
- SSE-based status updates instead of polling — research already settled on polling; revisit only if polling proves insufficient.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OAUTH-01 | User pode autenticar via OAuth PKCE com Anthropic (`loginAnthropic` via pi-ai) | `loginAnthropic` API signature documented (Standard Stack + Code Examples); PendingSession Map pattern documented (D-01 realisation); port pre-check pattern documented (D-02 realisation); credential persistence verified via existing `storeOAuthTokens` (Phase 5). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack lock:** `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core` obrigatorios — cannot be replaced or wrapped away
- **Infrastructure:** Sem banco de dados, sem deploy, local-only (in-memory state only)
- **Security:** API keys (and OAuth tokens) nao podem ser expostas no frontend — proxy obrigatorio, tokens stay server-side
- **GSD workflow:** All edits must go through a GSD command (`/gsd:execute-phase` for this phase)
- **Single-user:** POC for the author; no multi-user OAuth sessions

## Summary

Phase 6 wires the Anthropic OAuth PKCE flow into the existing Hono backend using pi-ai's `loginAnthropic` function. The flow is **backend-orchestrated**: the frontend (Phase 8) will trigger `/api/auth/oauth/start`, receive an auth URL, open it in a browser tab, and poll `/api/auth/oauth/status` until completion. pi-ai handles all the OAuth mechanics — PKCE generation, the `127.0.0.1:53692` callback server, code exchange with `platform.claude.com`. Phase 6's job is the **surrounding state machine**: expose the auth URL via a Promise resolver bound to the `onAuth` callback, track the in-flight flow in a `Map<Provider, PendingSession>` (D-01), pre-check port 53692 before starting (D-02), and persist the resulting `OAuthCredentials` via `storeOAuthTokens` from Phase 5.

The shape of the credential store and the refresh mutex are **already done** in Phase 5. `storeOAuthTokens(provider, tokens)` in `src/server/lib/credentials.ts` accepts the exact `OAuthCredentials` object that `loginAnthropic` resolves to. The `resolveCredential` function in `src/server/agent/setup.ts` already calls `refreshAnthropicToken` transparently. Phase 6 adds **only** the route file and mounts it.

The canonical reference sketch in `.planning/research/ARCHITECTURE.md` §OAuth Route Implementation Pattern uses a **global** `pendingOAuth` singleton. D-01 overrides this with a per-provider `Map`, so the sketch must be adapted — the global singleton is forward-incompatible with Phase 7 (OpenAI OAuth concurrent with Anthropic).

**Primary recommendation:** Create `src/server/routes/oauth.ts` with a module-scoped `Map<Provider, PendingSession>`, implement `POST /start` with port pre-check → Promise-resolver pattern on `onAuth` → awaits auth URL before responding, implement `GET /status` as read-only over the Map. Mount at `/api/auth/oauth` in `src/server/index.ts`. All state persistence already exists in Phase 5 infrastructure.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mariozechner/pi-ai` | 0.64.0 (installed) | `loginAnthropic`, `refreshAnthropicToken`, `OAuthCredentials` types | Validation target — the whole POC exists to test this; already wired for refresh in Phase 5 |
| `hono` | 4.12.x (installed) | HTTP routing, JSON response envelope | Project backend framework (CLAUDE.md lock) |
| `@hono/node-server` | 1.19.x (installed) | Node.js runtime for Hono | Required for `http.createServer` pre-check (D-02) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:http` | Node.js built-in | Port 53692 pre-check via `createServer().listen()` | D-02 pre-check before calling `loginAnthropic` |
| Phase 5 `credentials.ts` | internal | `storeOAuthTokens(provider, tokens)`, `getAuthStatus` | Persist OAuth tokens post-completion; `/api/auth/status` remains authoritative post-completion source |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Promise resolver on `onAuth` | `onProgress` callback to leak URL | `onProgress` takes plain strings; `onAuth` is purpose-built for passing the URL |
| Per-provider Map (D-01) | Global `pendingOAuth` singleton | Singleton forward-incompatible with Phase 7 (OpenAI concurrent flow); rejected per D-01 |
| Pre-check port bind | Try/catch on `loginAnthropic` EADDRINUSE | pi-ai's `loginAnthropic` already surfaces EADDRINUSE via the server's `"error"` event, but the error reaches the caller only **after** the user sees a "starting" state. Pre-check lets us 409 immediately (D-02) |
| Polling `/status` | SSE status updates | Research already settled polling (see `.planning/research/ARCHITECTURE.md` §Why Polling); polling already proven in app |
| `DELETE /cancel` endpoint | Discard session on second `/start` | D-04 rejects explicit cancel; `/start` retry is sufficient for single-user POC |

**Installation:** No new dependencies. Everything required is already in `package.json` via Phase 5.

**Version verification:**
- `@mariozechner/pi-ai` @ 0.64.0 — confirmed in `node_modules/@mariozechner/pi-ai/package.json` (lockfile-stable)
- `hono` @ ^4.12.0 — project lock
- `node:http` — Node.js >= 18 built-in

## Architecture Patterns

### Recommended Project Structure
```
src/server/
├── routes/
│   ├── auth.ts          # Phase 5: /api/auth/apikey, /api/auth/status (unchanged)
│   └── oauth.ts         # NEW Phase 6: /api/auth/oauth/start, /api/auth/oauth/status
├── lib/
│   └── credentials.ts   # Phase 5: storeOAuthTokens, getAuthStatus (unchanged)
├── agent/
│   └── setup.ts         # Phase 5: resolveCredential with refresh mutex (unchanged)
└── index.ts             # MODIFIED: app.route("/api/auth/oauth", oauthRoutes)
```

### Pattern 1: Promise-resolver to capture auth URL from callback

`loginAnthropic` returns a Promise that resolves **after** the user completes the browser flow (30-60 seconds). But the auth URL is needed **immediately** so the frontend can open a browser tab. The URL is delivered via the `onAuth` callback, which fires synchronously before `loginAnthropic` awaits the callback server. Capture it with a Promise resolver:

```typescript
// Source: adapted from .planning/research/ARCHITECTURE.md §OAuth Route Implementation Pattern
let resolveAuthUrl!: (url: string) => void
const authUrlPromise = new Promise<string>((resolve) => {
  resolveAuthUrl = resolve
})

const loginPromise = loginAnthropic({
  onAuth: (info) => resolveAuthUrl(info.url),     // resolves the promise with the auth URL
  onPrompt: async () => "",                        // no CLI prompting in web context
  onProgress: (msg) => console.log(`[oauth:anthropic] ${msg}`),
})

// Wait for auth URL to land (fast — happens before callback server blocks)
const authUrl = await authUrlPromise

// loginPromise continues in the background, resolving with OAuthCredentials
// after the user completes consent and the callback fires
```

### Pattern 2: Per-provider PendingSession Map (D-01)

```typescript
type SessionStatus = "pending" | "done" | "error"

interface PendingSession {
  promise: Promise<void>      // background login flow; caller doesn't await
  authUrl: string             // captured from onAuth
  status: SessionStatus
  error?: string              // populated when status === "error"
  startedAt: number           // for debug logging
}

type Provider = "anthropic" | "openai"
const pendingSessions = new Map<Provider, PendingSession>()
```

Lookup keyed by provider is O(1). Phase 7 (OpenAI) re-uses the same Map unchanged.

### Pattern 3: Port pre-check with throwaway server (D-02)

```typescript
// Source: Node.js http docs + D-02
import { createServer } from "node:http"

async function checkPortFree(port: number, host = "127.0.0.1"): Promise<void> {
  const probe = createServer()
  await new Promise<void>((resolve, reject) => {
    probe.once("error", (err: NodeJS.ErrnoException) => {
      reject(err)  // EADDRINUSE surfaces here
    })
    probe.listen(port, host, () => {
      probe.close(() => resolve())  // close immediately before returning
    })
  })
}
```

Wrapped in try/catch inside the route: on `EADDRINUSE`, return 409 with the D-02 message mentioning Claude Code CLI. On success, the server is closed synchronously before `loginAnthropic` starts its own listener on the same port — no self-conflict.

### Pattern 4: Background promise lifecycle (fire-and-track)

The `loginAnthropic` promise is **not awaited** in the request handler — it runs in the background and updates the session's `status` field via `.then()` / `.catch()`. The route returns the auth URL before `loginAnthropic` resolves. This is the only way to satisfy "return auth URL immediately + hold flow open for 30-60s browser consent":

```typescript
// Source: .planning/research/ARCHITECTURE.md §OAuth Route Implementation Pattern (adapted)
const session: PendingSession = { promise: null!, authUrl: "", status: "pending", startedAt: Date.now() }

session.promise = loginAnthropic({ onAuth: ..., onPrompt: async () => "", onProgress: ... })
  .then((creds) => {
    storeOAuthTokens("anthropic", creds)
    session.status = "done"
  })
  .catch((err) => {
    session.status = "error"
    session.error = err instanceof Error ? err.message : String(err)
  })

pendingSessions.set("anthropic", session)

const authUrl = await authUrlPromise
session.authUrl = authUrl
return c.json({ status: "started", authUrl, provider: "anthropic" })
```

### Anti-Patterns to Avoid

- **Awaiting `loginAnthropic` in the route handler** — blocks the HTTP response for 30-60 seconds, causes proxy timeouts, user sees nothing.
- **Forgetting to close the pre-check server** — `loginAnthropic` will fail with EADDRINUSE on the port it just freed if you don't await `probe.close()`.
- **Storing the global `pendingOAuth` singleton** (as in the original `.planning/research/ARCHITECTURE.md` sketch) — rejected per D-01; must use per-provider Map.
- **Calling `storeOAuthTokens` inside `onAuth`** — `onAuth` only receives the URL, not credentials. Credentials arrive only when the main `loginAnthropic` promise resolves.
- **Not clearing `pendingSessions` on a second `/start`** — D-03 requires the second `/start` to discard the first session. Leaving the old entry in the Map risks ambiguous `/status` responses.
- **Validating `OAuthCredentials` before storing** — unlike API keys (which are validated via a test `streamSimple` call in `auth.ts`), OAuth tokens are inherently validated by the exchange step inside `loginAnthropic`. A second validation would be wasteful and noisy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PKCE generation | Custom code_verifier/challenge hashing | `loginAnthropic` (pi-ai) | Base64URL encoding has edge cases; S256 challenge must match exactly; already implemented correctly |
| OAuth callback server | `http.createServer` + route handler on `/callback` | `loginAnthropic` (pi-ai) | pi-ai handles state validation, error params, success/error HTML pages, 404s on wrong path |
| State parameter validation | `state === expectedState` check | `loginAnthropic` (pi-ai) | Bypassing state check reintroduces CSRF risk; pi-ai already mismatches and rejects |
| Token exchange POST | `fetch` to `platform.claude.com/v1/oauth/token` | `loginAnthropic` (pi-ai) | Anthropic client_id is base64-obfuscated in pi-ai; request shape has specific required fields |
| Token refresh | Custom refresh POST | `refreshAnthropicToken` (pi-ai) | Already integrated in Phase 5's `resolveCredential`; refresh tokens are single-use and rotate |
| OAuth success/error HTML | Custom HTML page | pi-ai's built-in (`oauthSuccessHtml`, `oauthErrorHtml`) | Deferred to OAUTH-06 per CONTEXT.md |
| Token persistence/refresh mutex | Custom store | Phase 5's `storeOAuthTokens` + `resolveCredential` | Single-flight refresh and 60s buffer already solved in Phase 5 |

**Key insight:** Phase 6 writes **~80 lines of glue code**. Everything substantive (PKCE, callback server, token exchange, refresh, credential store, refresh mutex) is already implemented in pi-ai and Phase 5. The entire value of Phase 6 is the **state machine around `loginAnthropic`**: capture URL, track status, report status, handle port conflict.

## Runtime State Inventory

*(Not a rename/refactor/migration phase. This phase adds new routes and in-memory state; it doesn't modify stored data or registered services.)*

| Category | Items | Action |
|----------|-------|--------|
| Stored data | None — in-memory `Map<Provider, PendingSession>` per CLAUDE.md constraint "sem banco de dados" | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None (pi-ai's Anthropic `CLIENT_ID` is embedded in the library, not an env var) | None |
| Build artifacts | None — TypeScript changes compile via Vite dev server HMR | None |

## Common Pitfalls

### Pitfall 1: Anthropic OAuth Token May Be Rejected by the Messages API

**What goes wrong:** User completes OAuth, token stored, but `POST /api/chat` fails with `"OAuth authentication is currently not supported."` from Anthropic. The flow works mechanically; the token is useless.

**Why it happens:** Per `.planning/research/PITFALLS.md §Pitfall 1`, Anthropic revised terms in Feb 2026 to ban `sk-ant-oat*` tokens for third-party apps. Starting April 3, 2026, subscription OAuth tokens are reserved for Claude Code and Claude.ai. This finding existed BEFORE the user decided to implement anyway (per STATE.md: "Anthropic OAuth included despite research flagging potential ban — user decision to implement regardless").

**How to avoid:** This is **accepted risk**, not avoidable. SC#3 (send a real chat via OAuth) is the empirical test. If it fails, the failure is expected and informative — it proves the policy enforcement is live.

**Warning signs:**
- Token obtained successfully but first `/api/chat` call returns 400/401 with `oauth` in the error body
- pi-ai's Anthropic provider detects `sk-ant-oat01-*` prefix and switches to Bearer auth with Claude Code headers — **detection still works**, but the API rejects regardless
- Error message contains phrases like "OAuth not supported" or "invalid authentication method"

**Impact:** If this happens, SC#3 fails and UAT (06-UAT.md) records a "blocked by upstream policy" result. Phase 6 code is still correct; the phase is marked complete with a note. User has been warned.

### Pitfall 2: Port 53692 Already In Use (Claude Code CLI)

**What goes wrong:** User runs Claude Code CLI locally (likely given CLAUDE.md GSD workflow), then tries to authenticate via Anthropic OAuth in this app. `EADDRINUSE` on port 53692 because Claude Code CLI's OAuth callback uses the same port.

**Why it happens:** pi-ai and Claude Code share the same Anthropic OAuth client_id and redirect URI — they MUST use the same port (53692) because it's pre-registered with Anthropic. The port cannot be changed without registering a new OAuth app.

**How to avoid:** D-02's pre-check. Bind a throwaway server on `127.0.0.1:53692` before calling `loginAnthropic`. If bind fails, return 409 with the explicit message: *"Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again."*

**Warning signs:**
- User sees "starting OAuth" but then immediately gets EADDRINUSE
- Any `lsof -i :53692` shows a listener (verify during UAT by running `lsof -nP -iTCP:53692 -sTCP:LISTEN`)
- Running `claude` CLI concurrently with the POC

### Pitfall 3: Second `/start` Leaves First Flow's Callback Server Running

**What goes wrong:** User clicks "Login" twice (or the frontend retries). First `loginAnthropic` is still listening on 53692. Second `/start` call:
1. D-02 pre-check binds 53692 → **EADDRINUSE** (because the first flow holds it).
2. Returns 409.
3. User stuck — neither flow finishes.

**Why it happens:** The first `loginAnthropic`'s callback server closes only when:
- (a) the user completes the flow successfully, OR
- (b) the `loginAnthropic` promise is explicitly rejected/cancelled (pi-ai's `finally` block closes the server).

Merely discarding the `PendingSession` entry from the Map does NOT close the server.

**How to avoid:** D-03 accepts this: the 409 on the second `/start` surfaces the conflict deterministically. The user's recovery is either (a) complete the first flow in the browser, or (b) restart the backend (D-04). This is **by design** for single-user POC.

**Warning signs:**
- Two `/start` calls in quick succession
- Second `/start` returns 409 with port-conflict message even though user never opened Claude Code CLI

**Mitigation:** If this becomes annoying, track the underlying callback server's close Promise and await it before the second `/start` proceeds. Deferred — not in phase scope.

### Pitfall 4: Unhandled Promise Rejection Leaks from Background `loginAnthropic`

**What goes wrong:** `loginAnthropic` rejects (network error, user cancels in browser, state mismatch). If no `.catch()` is attached, Node emits `UnhandledPromiseRejection` warnings and may terminate the process in strict modes.

**Why it happens:** The route returns immediately after getting the auth URL. The `loginAnthropic` promise continues in the background. Without an attached `.catch`, rejections float.

**How to avoid:** Always attach `.catch()` to the background promise chain that updates `session.status = "error"`. This is shown in Pattern 4 above.

**Warning signs:**
- Node logs `UnhandledPromiseRejection at ...`
- `/status` returns `pending` forever after a rejection because no handler flipped status to `error`

### Pitfall 5: `onPrompt` Callback Returning Empty String Can Cause State Mismatch

**What goes wrong:** pi-ai's `loginAnthropic` has a fallback path: if `onManualCodeInput` is not provided AND the callback server never receives a code, it calls `onPrompt` asking for manual paste. If `onPrompt` returns `""`, pi-ai's `parseAuthorizationInput("")` returns `{ code: undefined }`, then throws `"Missing authorization code"`.

**Why it happens:** In a web context, we have no CLI and no way to prompt the user. The callback server IS the path. But pi-ai's control flow still calls `onPrompt` in the no-code fallback branch.

**How to avoid:** Implement `onPrompt: async () => ""` — the happy path is the callback server; if it fails, `"Missing authorization code"` propagates to the `.catch` handler, which sets `session.error = "Missing authorization code"`. This is acceptable error handling.

**Alternative:** `onPrompt: async () => { throw new Error("Manual code input not supported in web context") }` — same net effect but more explicit.

**Warning signs:** None during normal flow. Only triggers if the callback server exits without a code (e.g., user closes the browser tab before consenting).

### Pitfall 6: Auth URL Race — Responding Before `onAuth` Fires

**What goes wrong:** Route returns `{ status: "started", authUrl: "" }` because the code reads `session.authUrl` before `onAuth` has fired.

**Why it happens:** `onAuth` fires synchronously inside `loginAnthropic` after PKCE generation but before the callback server `listen` callback. In practice, it's microseconds — but if you `await` nothing between `loginAnthropic(...)` and reading `session.authUrl`, the read happens before the callback fires.

**How to avoid:** Use the Promise-resolver pattern (Pattern 1). Create `authUrlPromise` BEFORE calling `loginAnthropic`, pass a resolver to `onAuth`, then `await authUrlPromise` before responding. This is the only correct pattern.

**Warning signs:** Empty or undefined `authUrl` in the response to `/start`.

## Code Examples

Verified patterns from pi-ai source code (`node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.js` lines 189-287) and the Phase 5 code at `src/server/lib/credentials.ts`:

### Calling `loginAnthropic` with web-context callbacks

```typescript
// Source: node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.d.ts
import { loginAnthropic, type OAuthCredentials } from "@mariozechner/pi-ai/oauth"

const credentials: OAuthCredentials = await loginAnthropic({
  onAuth: (info) => {
    // info.url is the Anthropic authorize URL to open in the browser
    // info.instructions is pi-ai's human-readable hint
    console.log("Auth URL:", info.url)
  },
  onPrompt: async (_prompt) => {
    // Called only if callback server never receives code; we return empty
    // to let loginAnthropic throw "Missing authorization code" (acceptable)
    return ""
  },
  onProgress: (msg) => console.log(`[oauth] ${msg}`),
  // onManualCodeInput intentionally omitted — we don't support manual paste
})
// credentials: { access: string, refresh: string, expires: number }
```

### Persisting credentials via Phase 5 API

```typescript
// Source: src/server/lib/credentials.ts
import { storeOAuthTokens } from "../lib/credentials"

// After loginAnthropic resolves:
storeOAuthTokens("anthropic", credentials)
// storeOAuthTokens normalises to { type: "oauth", access, refresh, expires }
// and places it in the per-provider compound credential store.
// OAuth takes priority over API Key automatically (Phase 5 D-01).
```

### Port pre-check before starting OAuth (D-02)

```typescript
// Source: Node.js http docs + D-02
import { createServer } from "node:http"

async function ensurePortFree(port: number, host = "127.0.0.1"): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
    probe.once("error", (err: NodeJS.ErrnoException) => reject(err))
    probe.listen(port, host, () => {
      probe.close(() => resolve())
    })
  })
}

// In the route:
try {
  await ensurePortFree(53692)
} catch (err: unknown) {
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === "EADDRINUSE") {
    return c.json({
      status: "error",
      message: "Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again.",
    }, 409)
  }
  // Other bind errors (EACCES, etc.) — surface with a generic message
  return c.json({ status: "error", message: `Could not probe port 53692: ${code ?? "unknown error"}` }, 500)
}
```

### Full route sketch (adapted from `.planning/research/ARCHITECTURE.md` for D-01 per-provider Map)

```typescript
// src/server/routes/oauth.ts
import { Hono } from "hono"
import { loginAnthropic } from "@mariozechner/pi-ai/oauth"
import { createServer } from "node:http"
import { storeOAuthTokens, type Provider } from "../lib/credentials"

const oauthRoutes = new Hono()

type SessionStatus = "pending" | "done" | "error"
interface PendingSession {
  authUrl: string
  status: SessionStatus
  error?: string
  startedAt: number
}
const pendingSessions = new Map<Provider, PendingSession>()

// D-02 pre-check
async function ensurePortFree(port: number): Promise<void> { /* ... see above ... */ }

oauthRoutes.post("/start", async (c) => {
  const { provider } = await c.req.json<{ provider: Provider }>()
  if (provider !== "anthropic") {
    return c.json({ status: "error", message: "Only 'anthropic' is supported in Phase 6" }, 400)
  }

  // D-03: discard any existing session for this provider (second /start aborts first)
  pendingSessions.delete(provider)

  // D-02: pre-check port
  try {
    await ensurePortFree(53692)
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === "EADDRINUSE") {
      return c.json({
        status: "error",
        message: "Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again.",
      }, 409)
    }
    return c.json({ status: "error", message: `Could not probe port 53692: ${code ?? "unknown"}` }, 500)
  }

  // Promise resolver to capture auth URL from onAuth callback (Pattern 1)
  let resolveAuthUrl!: (url: string) => void
  const authUrlPromise = new Promise<string>((resolve) => { resolveAuthUrl = resolve })

  const session: PendingSession = { authUrl: "", status: "pending", startedAt: Date.now() }
  pendingSessions.set(provider, session)

  // Background flow (Pattern 4)
  loginAnthropic({
    onAuth: (info) => resolveAuthUrl(info.url),
    onPrompt: async () => "",
    onProgress: (msg) => console.log(`[oauth:${provider}] ${msg}`),
  })
    .then((creds) => {
      storeOAuthTokens(provider, creds)
      // Only update if this session is still the active one for the provider
      if (pendingSessions.get(provider) === session) session.status = "done"
    })
    .catch((err: unknown) => {
      if (pendingSessions.get(provider) === session) {
        session.status = "error"
        session.error = err instanceof Error ? err.message : String(err)
      }
    })

  const authUrl = await authUrlPromise
  session.authUrl = authUrl
  return c.json({ status: "started", provider, authUrl })
})

oauthRoutes.get("/status", (c) => {
  const provider = c.req.query("provider") as Provider | undefined
  if (!provider || !["anthropic", "openai"].includes(provider)) {
    return c.json({ status: "error", message: "Invalid provider. Use 'anthropic' or 'openai'." }, 400)
  }
  const session = pendingSessions.get(provider)
  if (!session) return c.json({ status: "none" })
  if (session.status === "pending") return c.json({ status: "pending", provider, authUrl: session.authUrl })
  if (session.status === "done") return c.json({ status: "ok", provider })
  return c.json({ status: "error", provider, message: session.error ?? "OAuth flow failed" })
})

export { oauthRoutes }
```

**Guard note:** `pendingSessions.get(provider) === session` ensures `.then`/`.catch` don't overwrite a newer session created by a concurrent `/start` (D-03 race edge).

### Mount in `src/server/index.ts`

```typescript
// Source: src/server/index.ts (current) + new route
import { oauthRoutes } from "./routes/oauth"
// ...
app.route("/api/auth/oauth", oauthRoutes)
// Existing: app.route("/api/auth", authRoutes) — stays exactly as-is
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global `pendingOAuth` singleton (from original architecture research) | Per-provider `Map<Provider, PendingSession>` | D-01 (CONTEXT.md, this phase) | Forward-compatible with Phase 7 OpenAI concurrent OAuth |
| OAuth state flowing through `onProgress` messages | Dedicated Promise resolver bound to `onAuth` callback | Standard pattern since pi-ai introduced typed `onAuth` signature (0.50+) | Clean separation: URL via `onAuth`, telemetry via `onProgress` |
| Direct try/catch on `loginAnthropic` EADDRINUSE | Pre-check throwaway server | D-02 (CONTEXT.md, this phase) | User gets immediate 409 instead of "starting… failed" UX whiplash |
| Timeout + DELETE /cancel endpoint | No timeout, `/start` retry only | D-04 (CONTEXT.md, this phase) | Simpler; server restart is acceptable recovery for single-user POC |

**Deprecated/outdated:**
- Anthropic OAuth for third-party apps: Anthropic's Feb 2026 policy change banned `sk-ant-oat*` tokens for non-Claude-Code apps (per PITFALLS.md). User has accepted the risk; the implementation may be dead code from the API's perspective but the code is still correct.

## Open Questions

1. **Will the stored Anthropic OAuth token work for `/api/chat`?**
   - What we know: pi-ai detects `sk-ant-oat*` prefix and switches to Bearer auth + Claude Code headers; Phase 5's `resolveCredential` returns the access token as the API key. The plumbing is correct.
   - What's unclear: Whether Anthropic's API server-side enforcement (active since April 3, 2026) rejects these tokens. Community reports suggest 100% rejection for third-party clients.
   - Recommendation: SC#3 (UAT curl test) is the empirical answer. If it fails, record outcome in 06-UAT.md and mark phase "code complete, API policy blocks"; do not attempt workarounds.

2. **Should `/status` clear the Map entry after returning `"done"` or `"error"`?**
   - What we know: CONTEXT.md (Claude's Discretion) says either approach is acceptable; `/api/auth/status` (Phase 5) is authoritative post-completion.
   - What's unclear: Whether leaving the entry improves observability or causes stale reads on refresh.
   - Recommendation: Clear on first `/status` read after `done` or `error` — frontend has its own `/api/auth/status` poll and doesn't need OAuth-specific state after completion. Simplest and matches `.planning/research/ARCHITECTURE.md` pattern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | `http.createServer` for D-02 pre-check + pi-ai's OAuth callback server | ✓ | project runtime (already used by Hono backend) | — |
| `@mariozechner/pi-ai` | `loginAnthropic`, `refreshAnthropicToken`, `OAuthCredentials` types | ✓ | 0.64.0 (installed) | — |
| `hono` | Route definition, JSON envelope | ✓ | ^4.12.0 (installed) | — |
| Port `127.0.0.1:53692` | Anthropic OAuth callback (hardcoded by pi-ai + Anthropic's registered redirect URI) | ✓ (free at research time) | — | None technical. D-02 surfaces conflict as 409. |
| Internet egress to `claude.ai` | Browser-side OAuth consent redirect | assumed ✓ | — | None — flow requires live HTTPS to `claude.ai` |
| Internet egress to `platform.claude.com` | Token exchange POST (pi-ai makes this call) | assumed ✓ | — | None — exchange is the critical path |
| Browser (any modern) | User completes OAuth consent in browser tab | assumed ✓ | — | pi-ai's `onManualCodeInput` fallback exists but is intentionally not wired (web context has no paste UI) |

**Missing dependencies with no fallback:** None at environment-probe time. Runtime outages of `claude.ai` or `platform.claude.com` would manifest as `loginAnthropic` rejections and surface via `/status` as `{ status: "error", message: "..." }`.

**Missing dependencies with fallback:** None.

**Verified during research:** `lsof -nP -iTCP:53692 -sTCP:LISTEN` returned no listeners on research machine — port currently free.

## Sources

### Primary (HIGH confidence)
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.d.ts` — `loginAnthropic` signature, callback shape
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.js` lines 189-287 — control flow: PKCE → server start → `onAuth` fires → wait for code → exchange → finally-close-server
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/types.d.ts` — `OAuthCredentials`, `OAuthLoginCallbacks`, `OAuthPrompt`
- `node_modules/@mariozechner/pi-ai/package.json` — version 0.64.0, `./oauth` subpath export maps to `dist/oauth.js` (re-exports `utils/oauth/index.js`)
- `src/server/lib/credentials.ts` (Phase 5) — `storeOAuthTokens`, `getActiveCredential`, store shape
- `src/server/agent/setup.ts` (Phase 5) — refresh mutex, 60s refresh buffer, `resolveCredential`
- `src/server/routes/auth.ts` (Phase 5) — JSON envelope pattern, `mapErrorMessage` helper, `/status` endpoint reference
- `src/server/index.ts` — Hono route mounting pattern

### Secondary (MEDIUM confidence — verified against primary)
- `.planning/research/ARCHITECTURE.md` §New Endpoints, §OAuth Login Flow, §OAuth Route Implementation Pattern — verified against pi-ai source; modified per D-01 (per-provider Map) and D-02 (port pre-check)
- `.planning/research/PITFALLS.md` §Pitfall 1 (Anthropic ban), §Pitfall 4 (port conflicts), §Pitfall 5 (refresh race) — cited directly; ban is acknowledged risk per STATE.md
- `.planning/phases/06-anthropic-oauth-flow/06-CONTEXT.md` — all locked decisions D-01 through D-05

### Tertiary (LOW confidence — needs validation during UAT)
- Assumption that Anthropic OAuth tokens will successfully exchange (flow mechanics work per pi-ai source, but actual API call validation requires UAT)
- Assumption that `loginAnthropic`'s `onAuth` fires before its callback server's `listen` resolves (based on reading `anthropic.js`; verified by code inspection but not empirically tested in this research pass)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pi-ai is the project lock; version verified in `node_modules`; `/oauth` subpath export confirmed
- Architecture patterns: HIGH — pi-ai source read end-to-end for `loginAnthropic`; Promise-resolver pattern is the only correct way to synchronise `onAuth` with HTTP response
- Pitfalls: HIGH for port conflict (D-02 addresses directly); HIGH for Anthropic ban (extensively documented, user-accepted); MEDIUM for second-`/start` port contention edge case (D-03 accepts this behaviour)
- Environment: HIGH at research time (port free, dependencies installed); runtime failures only possible on upstream outage

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (30 days — pi-ai OAuth surface is stable; the only policy-sensitive variable is Anthropic's upstream ban, which is already baked in)
