# Phase 7: OpenAI OAuth Flow - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend routes that orchestrate `loginOpenAICodex` from `@mariozechner/pi-ai/oauth`, expose the auth URL to the frontend, hold the in-flight OAuth session until the provider callback completes on port 1455, persist the resulting `OAuthCredentials` into the credential store, and validate that auto-refresh works end-to-end. The existing `createAgent` factory and `/api/models` route must dynamically remap the internal `provider="openai"` to pi-ai's `"openai-codex"` provider when the active credential is OAuth, so chat calls hit ChatGPT Codex models (`gpt-5.1`, `gpt-5.1-codex`, etc.) via `chatgpt.com/backend-api`. No frontend rendering — Phase 8 wires the UI on top. Scope limited to OpenAI Codex OAuth; Anthropic OAuth is Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Provider remap (OAuth → pi-ai openai-codex)
- **D-01:** Internal `Provider` type stays `"anthropic" | "openai"`. A new helper `resolvePiProvider(provider: Provider): PiProvider` lives in `credentials.ts` and returns `"openai-codex"` when `provider === "openai"` AND `getAuthStatus(provider).activeMethod === "oauth"`, otherwise returns the provider unchanged. `createAgent` (setup.ts) and `/api/models` (models.ts) call this helper before invoking `getModel` / `getModels` from pi-ai. Centralizes the routing rule in one place so Phase 8 UI continues to see two providers while the backend transparently hits the correct pi-ai model registry.
- **D-02:** `/api/models?provider=openai` returns the model list for the ACTIVE credential only. OAuth active → `openai-codex` models (gpt-5.1, gpt-5.1-codex, gpt-5.2, gpt-5.2-codex). API Key active → standard `openai` models (gpt-4o, etc.). Consistent with Phase 5 D-01 (OAuth preferred when both exist). Frontend does not need to know about the split — it gets the models compatible with whatever credential it is about to use.

### Route dispatch for OpenAI OAuth
- **D-03:** `POST /api/auth/oauth/start` accepts `provider: "openai"` alongside `"anthropic"`. Dispatch: `provider === "anthropic"` → `loginAnthropic`, `provider === "openai"` → `loginOpenAICodex`. Per-provider `PendingSession` Map from Phase 6 D-01 already supports this — only the hardcoded `if (provider !== "anthropic")` guard needs to go. The same `onAuth` Promise-resolver pattern (Phase 6) captures the auth URL before the route returns.

### Port 1455 conflict detection (SC#5)
- **D-04:** Pre-check binds a throwaway `http.createServer` on `127.0.0.1:1455` BEFORE calling `loginOpenAICodex`, reusing Phase 6 D-02's `ensurePortFree` helper. On `EADDRINUSE`, return `409` with: *"Port 1455 is already in use by another process. This port is required by the OpenAI Codex OAuth callback. If you have Codex CLI running, please stop it and try again."* On success, close the pre-check server immediately so `loginOpenAICodex` can bind its own listener. `ensurePortFree` becomes a generic `ensurePortFree(port)` call site reused by both providers.

### Validate-before-store (OAuth)
- **D-05:** NO validation API call before `storeOAuthTokens`. Mirror Phase 6 D-05 — `storeOAuthTokens(provider, creds)` is invoked immediately after `loginOpenAICodex` resolves. Auth/scope failures surface when the user sends the first chat via `/api/chat`. `pi-ai` internally extracts `accountId` from the JWT at call time (verified in `openai-codex-responses.js` line 81) so no extra storage is needed. Pitfall 2 (missing `model.request` scope) is mitigated because pi-ai routes OAuth through `openai-codex` models at `chatgpt.com/backend-api`, NOT `api.openai.com/chat/completions` — the `openid profile email offline_access` scopes the token carries are sufficient for that backend.

### SC#4 — proving auto-refresh works (UAT method)
- **D-06:** UAT uses a dev endpoint `POST /api/auth/oauth/debug/force-expire?provider=openai` that mutates the stored `expires` to `Date.now() - 1s`. Next `POST /api/chat` call triggers `resolveCredential` (setup.ts), which detects the expired token and invokes `refreshOpenAICodexToken` for real — proving the end-to-end refresh cycle (mutex, pi-ai refresh call, store update, new access token in chat stream) without waiting for the natural ~6h expiry. The debug endpoint lives in the same `oauthRoutes` sub-router.
- **D-07:** Debug force-expire endpoint is ALWAYS enabled (no `NODE_ENV` gate, no removal after UAT). Consistent with project philosophy: POC is local-only, single-user, in-memory, no deploy (REQUIREMENTS.md "Out of Scope"). Gates add overhead for zero benefit in this context. The endpoint stays as a permanent UAT/debugging tool.

### SC#3 — proving OAuth token works for chat (UAT method)
- **D-08:** End-of-phase validation via manual UAT with curl, documented in `07-UAT.md`. Flow: `curl POST /api/auth/oauth/start` with `provider: "openai"`, complete consent in browser, then `curl POST /api/chat` with `provider: "openai"` and a valid Codex `model` (e.g. `gpt-5.1`) to verify the SSE stream flows. Re-uses existing `/api/chat` route — no new test endpoints. Same pattern as Phase 6 D-05. Also validates D-01/D-02 (the remap actually routes to Codex models).

### Claude's Discretion
- Exact signature of `resolvePiProvider` (return type alias, narrowing).
- Placement of `ensurePortFree` if refactored out of `oauth.ts` into a shared util.
- Exact JSON response shape for `POST /debug/force-expire` (status, before/after expires values are nice-to-haves).
- Exact structure of session dispatch — switch statement vs provider → login-function Map both acceptable.
- `onPrompt` / `onManualCodeInput` callback implementations for `loginOpenAICodex` — web context has no CLI path; returning empty string or leaving `onManualCodeInput` undefined is fine (callback server is the happy path).
- Logging strategy for `onProgress` messages (console is sufficient).
- Whether to expose `expires` in `/oauth/status` response to help frontend display token TTL.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### pi-ai OAuth library (OpenAI Codex — the wrapper being integrated)
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/openai-codex.d.ts` — `loginOpenAICodex` signature, callback shape (`onAuth`, `onPrompt`, `onProgress`, `onManualCodeInput`), `refreshOpenAICodexToken`, `openaiCodexOAuthProvider`
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/openai-codex.js` — Reference implementation: PKCE generation, callback server on 127.0.0.1:1455, CLIENT_ID `app_EMoamEEZ73f0CkXaXp7hrann`, SCOPE `openid profile email offline_access`, token exchange with `https://auth.openai.com/oauth/token`, accountId extraction from JWT `https://api.openai.com/auth` claim
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/types.d.ts` — `OAuthCredentials`, `OAuthLoginCallbacks`, `OAuthPrompt`, `OAuthProviderInterface` types
- `node_modules/@mariozechner/pi-ai/dist/utils/oauth/index.d.ts` — confirms `loginOpenAICodex`, `refreshOpenAICodexToken`, `openaiCodexOAuthProvider` are supported entry points

### pi-ai OpenAI-Codex provider adapter (how OAuth tokens are consumed by chat)
- `node_modules/@mariozechner/pi-ai/dist/providers/openai-codex-responses.js` §line 78-89 — `extractAccountId(apiKey)` re-derives chatgpt_account_id from access token JWT at call time, `buildSSEHeaders` sets `chatgpt-account-id` header automatically (no storage needed for accountId)
- `node_modules/@mariozechner/pi-ai/dist/models.generated.js` §`"openai-codex"` (line 5814+) — Codex model registry: `gpt-5.1`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, `gpt-5.2`, `gpt-5.2-codex`; all use `api: "openai-codex-responses"`, `baseUrl: "https://chatgpt.com/backend-api"`

### Credential infrastructure (Phase 5 — the plumbing Phase 7 consumes)
- `src/server/lib/credentials.ts` — `storeOAuthTokens`, `getActiveCredential`, `getAuthStatus`, `OAuthCredential` type, compound `Map<Provider, ProviderCredentials>` store; new `resolvePiProvider` helper added per D-01
- `src/server/agent/setup.ts` — `resolveCredential` with async refresh mutex and 60s buffer; `refreshOpenAICodexToken` already imported; `createAgent` calls `getModel(provider, modelId)` which must use `resolvePiProvider` per D-01
- `.planning/phases/05-credential-infrastructure/05-CONTEXT.md` — Phase 5 D-01 (OAuth preferred), D-02 (no silent fallback), D-04 (async refresh via `getApiKey` inline), D-07 (granular per-type API), D-08 (status query endpoint)

### Phase 6 implementation (template Phase 7 extends)
- `src/server/routes/oauth.ts` — Existing implementation for Anthropic: pre-check port pattern, Promise-resolver for `authUrl`, background promise lifecycle, auto-clear session on done/error; Phase 7 extends provider dispatch to include `"openai"` and adds debug/force-expire endpoint
- `.planning/phases/06-anthropic-oauth-flow/06-CONTEXT.md` — Phase 6 D-01 (per-provider PendingSession Map), D-02 (port pre-check pattern), D-03 (second /start aborts first), D-04 (no timeout / no /cancel), D-05 (manual UAT via curl)

### Existing routes / integration points
- `src/server/routes/auth.ts` — `mapErrorMessage` helper, JSON envelope pattern, existing `/status` endpoint (Phase 5) that remains authoritative post-completion
- `src/server/routes/chat.ts` — calls `createAgent({ provider, modelId })`; receives `provider: "openai"` from frontend, expects `createAgent` to handle provider remap internally
- `src/server/routes/models.ts` — `/api/models?provider=openai` handler; must call `resolvePiProvider` before passing to `getModels` per D-01/D-02
- `src/server/index.ts` — Hono mount point; `oauthRoutes` already mounted at `/api/auth/oauth`

### Architecture research (v1.1)
- `.planning/research/ARCHITECTURE.md` §OAuth Login Flow — Step-by-step sequence
- `.planning/research/ARCHITECTURE.md` §New Endpoints — POST /start, GET /status shape
- `.planning/research/ARCHITECTURE.md` §OAuth Route Implementation Pattern — existing Hono sketch
- `.planning/research/PITFALLS.md` §Pitfall 2 (model.request scope) — risk mitigated by pi-ai's openai-codex provider routing (drives D-05)
- `.planning/research/PITFALLS.md` §Port conflicts — 1455 conflict with Codex CLI (drives D-04)
- `.planning/research/PITFALLS.md` §Browser-side loginOpenAICodex — server-side-only constraint

### Architecture decisions
- `.harn/docs/adr/0005-api-key-first-oauth-stretch.md` — Original ADR; v1.1 adds OAuth as alternative

### Requirements
- `.planning/REQUIREMENTS.md` §OAuth Authentication — OAUTH-02 (OpenAI OAuth), OAUTH-03 (auto-refresh)
- `.planning/ROADMAP.md` §Phase 7 — Goal, dependencies, success criteria 1-5

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `storeOAuthTokens(provider, tokens)` in `src/server/lib/credentials.ts` — consumes the exact `OAuthCredentials` shape returned by `loginOpenAICodex` (`{ access, refresh, expires }`); `accountId` is not persisted and not needed because pi-ai re-extracts from JWT at call time
- `refreshOpenAICodexToken` already imported in `src/server/agent/setup.ts` — Phase 5's `resolveCredential` handles refresh transparently once tokens are stored; no additional wiring needed beyond the debug/force-expire endpoint for UAT
- `pendingSessions: Map<Provider, PendingSession>` in `src/server/routes/oauth.ts` — already keyed per-provider; removing the `provider !== "anthropic"` guard enables OpenAI without refactor
- `ensurePortFree(port, host)` helper in `src/server/routes/oauth.ts` — port-agnostic already; reuse for 1455
- Promise-resolver pattern for `onAuth` URL capture (oauth.ts lines 66-101) — works identically for `loginOpenAICodex` (same `onAuth: (info: { url, instructions? }) => void` shape)

### Established Patterns
- Provider type: `"anthropic" | "openai"` — consistent across backend and frontend; Phase 7 does NOT change this
- JSON envelope: `{ status: "ok" | "error" | "pending" | "started" | "none", message?, provider?, ... }` — use same shape for new endpoints
- In-memory only state — matches Phase 5 store; new helpers live in module scope
- Validate-before-store — applied for API Key only (per D-05); OAuth tokens are trusted after successful `login*` resolve
- Per-provider refresh mutex via `Map<Provider, Promise>` in setup.ts — already handles OpenAI via the generic `provider` key

### Integration Points
- `src/server/agent/setup.ts` line 62 (`getModel(provider, modelId as any)`) — must become `getModel(resolvePiProvider(provider), modelId)`; `as any` cast removed once types align
- `src/server/routes/models.ts` line 20 (`getModels(provider)`) — same remap via `resolvePiProvider`
- `loginOpenAICodex` opens its own `http.createServer` on `127.0.0.1:1455` — pre-check server (D-04) must close before `loginOpenAICodex` is invoked to avoid self-conflict
- `onAuth` callback in `loginOpenAICodex` fires after callback server binds successfully — same timing as `loginAnthropic`, same resolver pattern works
- `loginOpenAICodex` expects `onManualCodeInput` as optional — NOT passed in Phase 7 (web UI has no CLI paste path); callback server is the only code acquisition path
- `loginOpenAICodex` calls `onPrompt` only as fallback if callback server fails AND no `onManualCodeInput` — return empty string so it rejects with "Missing authorization code" and bubbles up as session.error

</code_context>

<specifics>
## Specific Ideas

- Error message for port 1455 conflict (D-04) specifically names Codex CLI because it is the most likely collision scenario (parallel to Phase 6 naming Claude Code CLI for port 53692).
- Debug force-expire endpoint (D-07) stays permanently enabled because this POC has no production deploy — gating it would be premature complexity that violates the "local-only, single-user, in-memory" philosophy carried forward from v1.0.
- `resolvePiProvider` (D-01) keeps the `Provider` type stable so Phase 8 UI logic doesn't fork on `openai-codex` as a third provider — user mental model stays "Anthropic / OpenAI, with two auth methods each".

</specifics>

<deferred>
## Deferred Ideas

- Exposing `"openai-codex"` as a third provider in the UI — rejected in favor of dynamic remap (D-01); reconsider only if Phase 8 needs user-visible distinction between Codex and standard OpenAI models.
- `onManualCodeInput` paste fallback — rejected for Phase 7 (D-04 keeps 409 behavior). Reconsider if Phase 8 UI surfaces a paste-code flow for headless / port-conflict recovery.
- Validate-before-store via cheap Codex API call — rejected per D-05; reconsider if UAT consistently surfaces scope/auth failures that would be cheaper to catch pre-store.
- Union model list (`/api/models` returning both codex + standard tagged by authMethod) — rejected per D-02; reconsider if Phase 8 wants to preview model compatibility across auth methods.
- Logout/revoke OAuth per provider — deferred to OAUTH-05 (future roadmap).
- Branded callback page — deferred to OAUTH-06 (future roadmap).
- DELETE /oauth/cancel endpoint — still deferred (carried from Phase 6 D-04).
- 5-minute session timeout — still deferred (carried from Phase 6 D-04).

</deferred>

---

*Phase: 07-openai-oauth-flow*
*Context gathered: 2026-04-05*
