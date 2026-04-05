# Phase 6: Anthropic OAuth Flow - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend routes that orchestrate `loginAnthropic` from `@mariozechner/pi-ai/oauth`, expose the auth URL to the frontend, hold the in-flight OAuth session until the provider callback completes, and persist the resulting `OAuthCredentials` into the credential store built in Phase 5. No frontend rendering in this phase — Phase 8 wires the UI on top of these routes. Scope is limited to Anthropic; OpenAI Codex OAuth is Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Session state model
- **D-01:** Backend tracks in-flight OAuth flows via `Map<Provider, PendingSession>` keyed by provider. Each slot holds the `loginAnthropic` promise, captured auth URL, status (`pending` | `done` | `error`), and error message. Forward-compatible with Phase 7 (OpenAI) without refactor; supports running Anthropic and OpenAI OAuth concurrently when Phase 7 lands.

### Port 53692 conflict detection (SC#4)
- **D-02:** Pre-check binds a throwaway `http.createServer` on `127.0.0.1:53692` **before** calling `loginAnthropic`. If bind fails with `EADDRINUSE`, return `409` with an explicit message mentioning Claude Code CLI as the most likely cause: *"Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again."* On success, close the pre-check server immediately and proceed to `loginAnthropic` (which opens its own listener on that port). The pre-check avoids the user seeing a "connecting…" spinner before an eventual EADDRINUSE surfaces.

### Flow lifecycle (cancel / timeout / retry)
- **D-03:** Second `POST /start` for the same provider aborts the first. Implementation: discard the old `PendingSession` from the Map (the orphaned promise is left to reject naturally when its callback server is closed; pi-ai closes the server in its `finally`). Caller is responsible for closing any lingering callback server before starting a fresh `loginAnthropic` — the new pre-check handles that deterministically because the port will be either free or still-held by the previous flow (409 surfaces the conflict).
- **D-04:** No timeout and no explicit `DELETE /cancel` endpoint. The single-user POC accepts "user restarts the server if OAuth hangs forever" as a valid recovery path. New `/start` calls are the only retry mechanism.

### SC#3 verification — proving the OAuth token works for chat
- **D-05:** End-of-phase validation uses **manual UAT via curl**, documented in `06-UAT.md`. Flow: start OAuth via `curl POST /api/auth/oauth/start`, complete consent in browser, then `curl POST /api/chat` with `provider: "anthropic"` and verify stream response flows. Re-uses the existing `/api/chat` route (no new test endpoints). Since Phase 8 delivers the real UI, Phase 6 only needs to prove the credential plumbing works end-to-end.

### Claude's Discretion
- Route path structure — likely `/api/auth/oauth/start` and `/api/auth/oauth/status` to coexist with existing `/api/auth/apikey` and `/api/auth/status`.
- Exact JSON response shape for `/start` and `/status` (must at minimum expose the auth URL and provider; status must expose pending/done/error + any error message).
- Internal `PendingSession` TypeScript type and how the captured auth URL is exposed by the `onAuth` callback (likely a resolver on a Promise).
- Auto-clear semantics for `/status` after a completed flow (clear on first read vs persist until new /start) — either is acceptable; `/api/auth/status` (Phase 5) is the authoritative post-completion source.
- `onPrompt` / `onManualCodeInput` callback implementations for `loginAnthropic` — web context has no CLI prompt path; returning an empty string or rejecting is fine since the callback server is the happy path.
- Logging strategy for `onProgress` messages (console is sufficient).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### pi-ai OAuth library (the wrapper being integrated)
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.d.ts` — `loginAnthropic` signature and callback shape (`onAuth`, `onPrompt`, `onProgress`, `onManualCodeInput`)
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.js` — Reference implementation: PKCE generation, callback server on 127.0.0.1:53692, CLIENT_ID, SCOPES, token exchange with https://platform.claude.com/v1/oauth/token
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/index.d.ts` — OAuth provider registry; confirms `loginAnthropic`, `refreshAnthropicToken`, `anthropicOAuthProvider` are the supported entry points
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/types.d.ts` — `OAuthCredentials`, `OAuthLoginCallbacks`, `OAuthPrompt` types

### Credential infrastructure (Phase 5 — the plumbing Phase 6 feeds)
- `src/server/lib/credentials.ts` — `storeOAuthTokens`, `getActiveCredential`, `getAuthStatus`, `OAuthCredential` type, compound Map<Provider, ProviderCredentials> store
- `src/server/agent/setup.ts` — `resolveCredential` with async refresh mutex; OAuth tokens flow through `createAgent` unchanged once stored
- `.planning/phases/05-credential-infrastructure/05-CONTEXT.md` — Phase 5 D-01 (OAuth priority), D-02 (no silent fallback), D-04 (async refresh), D-07 (granular per-type API), D-08 (status query endpoint)

### Architecture research (already done for v1.1)
- `.planning/research/ARCHITECTURE.md` §New Endpoints — Endpoint shape reference (POST /start, GET /status); adapt to per-provider Map per D-01
- `.planning/research/ARCHITECTURE.md` §OAuth Route Implementation Pattern — Existing Hono sketch; replace single-global `pendingOAuth` with per-provider Map per D-01
- `.planning/research/ARCHITECTURE.md` §OAuth Login Flow — Step-by-step sequence (1-13) for Anthropic flow
- `.planning/research/PITFALLS.md` §Port conflicts — 53692 conflict with Claude Code CLI, drives D-02
- `.planning/research/PITFALLS.md` §Browser-side loginAnthropic — Server-side-only constraint

### Existing routes / integration points
- `src/server/routes/auth.ts` — Pattern for auth routes: JSON envelopes, `mapErrorMessage` helper, `storeApiKey` call site pattern, existing `/status` endpoint that OAuth status should remain compatible with
- `src/server/index.ts` — Mount point for new oauth routes (Hono `app.route("/api/auth", ...)`)

### Architecture decisions
- `.harn/docs/adr/0005-api-key-first-oauth-stretch.md` — Original ADR (v1.0 scoped out OAuth); v1.1 roadmap adds OAuth as alternative, not replacement

### Requirements
- `.planning/REQUIREMENTS.md` §OAuth Authentication — OAUTH-01 requirement definition
- `.planning/ROADMAP.md` §Phase 6 — Goal, dependencies, success criteria (1-4)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `storeOAuthTokens(provider, tokens)` in `src/server/lib/credentials.ts` — consumes the exact `OAuthCredentials` shape returned by `loginAnthropic` (verified: `{ access, refresh, expires }`)
- `refreshAnthropicToken` already imported in `src/server/agent/setup.ts` — Phase 5's `resolveCredential` handles refresh transparently once tokens are stored
- `mapErrorMessage` helper in `src/server/routes/auth.ts` — similar error translation pattern can be applied to OAuth failures (401 from provider, network, etc.)
- Hono route mounting pattern (`app.route("/api/auth", authRoutes)`) — new `oauthRoutes` sub-router mounts the same way

### Established Patterns
- Provider type: `"anthropic" | "openai"` — already threaded through credential store, setup.ts, routes
- JSON response envelope: `{ status: "ok" | "error", message?: string, ... }` — use same shape for `/oauth/start` and `/oauth/status`
- In-memory only state — matches Phase 5 store; `pendingOAuth` Map lives in module scope like `credentials.ts`
- Validate-before-store: `/api/auth/apikey` only calls `storeApiKey` after a successful test request. OAuth equivalent: only call `storeOAuthTokens` after `loginAnthropic` resolves successfully

### Integration Points
- `src/server/index.ts` — add `app.route("/api/auth/oauth", oauthRoutes)` or merge into existing authRoutes
- `src/server/routes/auth.ts` `/status` (Phase 5) — already returns `getAuthStatus(provider)` which reflects OAuth storage; remains the authoritative source for post-completion status (frontend keeps polling the existing endpoint after the OAuth session finishes)
- `loginAnthropic` opens its own `http.createServer` on `127.0.0.1:53692` — pre-check server (D-02) must close before `loginAnthropic` is invoked to avoid self-conflict
- `onAuth` callback in `loginAnthropic` fires synchronously with the auth URL before the callback server starts waiting — extract URL via a Promise resolver that the route awaits before returning

</code_context>

<specifics>
## Specific Ideas

- Error message for port conflict (D-02) specifically names Claude Code CLI because the POC author is likely to be running it while working on this project — it's the most probable collision scenario.
- "Server restart clears OAuth state" is accepted as a valid recovery path (D-04) — matches the POC's single-user, in-memory, local-only philosophy that has been consistent from v1.0.

</specifics>

<deferred>
## Deferred Ideas

- Branded custom callback HTML page (replacing pi-ai's built-in success/error pages) — future OAUTH-06 in REQUIREMENTS.md.
- OAuth logout/revoke endpoint per provider — future OAUTH-05 in REQUIREMENTS.md.
- DELETE /oauth/cancel endpoint — deferred per D-04; reconsider if Phase 8 UI requires explicit user-driven cancel.
- 5-minute session timeout with automatic cleanup — deferred per D-04.
- SSE-based status updates instead of polling — research already settled on polling; revisit only if polling proves insufficient.

</deferred>

---

*Phase: 06-anthropic-oauth-flow*
*Context gathered: 2026-04-05*
