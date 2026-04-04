# Project Research Summary

**Project:** Pi AI Chat Web — v1.1 OAuth Authentication
**Domain:** OAuth integration for LLM providers (Anthropic + OpenAI Codex) in a local-only SPA + Hono backend
**Researched:** 2026-04-04
**Confidence:** HIGH

## Executive Summary

This milestone adds OAuth authentication as an alternative to API Key auth for the existing pi-ai chat POC. The core implementation is already shipped inside `@mariozechner/pi-ai ^0.64.0`: complete PKCE flows, local callback servers, token refresh, and credential management exist for both Anthropic and OpenAI Codex. Zero new npm dependencies are required. The work is entirely about wiring these existing utilities into the Hono backend and exposing a UI path in the React frontend.

**RESOLVED DISCREPANCY — Anthropic OAuth current state (April 4, 2026):** The three research files produced conflicting descriptions. STACK.md said "routes to Extra Usage billing but works." FEATURES.md said "banned with active enforcement since January 2026." PITFALLS.md said "DEAD — sk-ant-oat tokens rejected by Messages API." All three were describing different points on a timeline that has now closed. The accurate current state is: Anthropic banned third-party subscription OAuth in January 2026 (server-side enforcement), formalized it in February 2026 ToS, and closed the Extra Usage billing path on April 3, 2026. As of today, `sk-ant-oat*` tokens are rejected server-side by the Messages API with `"OAuth authentication is currently not supported."` PITFALLS.md holds the most current and highest-confidence finding (verified in the Claude Code GitHub issue tracker). STACK.md described a brief window that has already closed. **Anthropic OAuth must be dropped from this milestone's scope entirely. API Key (`sk-ant-api03-*` from console.anthropic.com) remains the only supported Anthropic auth method.**

OpenAI Codex OAuth is a different story: explicitly permitted, with active official partnerships with OpenCode and RooCode. The flow works. The meaningful risk is a scope gap — pi-ai requests `openid profile email offline_access` but Codex API may require `model.request`. This cannot be confirmed from documentation alone and must be validated empirically in Phase 1 by making an actual API call immediately after token acquisition. The architecture is backend-initiated (pi-ai uses `node:http.createServer` on hardcoded ports, making browser-side initiation impossible), with frontend polling for completion and per-request credential resolution using a single-flight mutex to prevent refresh races.

## Key Findings

### Recommended Stack

No new dependencies are needed. Everything required lives in `@mariozechner/pi-ai/oauth` (already installed at `^0.64.0`).

**Core technologies:**
- `@mariozechner/pi-ai/oauth`: `openaiCodexOAuthProvider`, `getOAuthProvider`, `getOAuthApiKey`, and the `OAuthCredentials`/`OAuthLoginCallbacks`/`OAuthProviderInterface` types — zero new packages
- `Hono ^4.12.0`: Hosts two new OAuth endpoints using the same patterns as existing auth routes — zero config changes
- `node:http` (Node.js built-in, used internally by pi-ai): Ephemeral callback server on port 1455 (OpenAI only) — managed by pi-ai, not by the app directly
- `@mariozechner/pi-agent-core ^0.64.0`: `getApiKey` already supports `async Promise<string | undefined>` — no changes needed to the agent runtime itself

**Port allocation after OAuth:**
| Port | Owner | Purpose |
|------|-------|---------|
| 5173 | Vite | Frontend dev server |
| 3001 | Hono | Backend API routes |
| 1455 | pi-ai (OpenAI) | Ephemeral OAuth callback (during login only) |
| 53692 | pi-ai (Anthropic) | DO NOT USE — Anthropic OAuth is banned |

### Expected Features

**Must have (table stakes for v1.1 core):**
- O3: Auth method selector (API Key vs OAuth) — per-provider, not global; OpenAI gets both options, Anthropic gets API Key only
- O1: OAuth login button — single click initiates the backend-orchestrated flow (OpenAI only)
- O2: Browser popup for provider consent — `window.open()` opens the auth URL returned by the backend, then frontend polls for completion
- O4: Server-side OAuth token storage — extend existing `Map<Provider, string>` to a dual-store supporting `OAuthCredentials`
- O5: Transparent token-to-apikey conversion — `resolveApiKey()` returns the access token as a string; downstream chat/streaming code is unchanged
- O6: Automatic token refresh — async `getApiKey` in agent factory with single-flight mutex to prevent race conditions on concurrent requests
- O7: OAuth failure handling — port 1455 conflicts, popup blockers, consent denied, scope errors (with specific error messages)
- O8: Connection status indicator — show auth method (API Key vs OAuth) badge in connected state
- O9: Disconnect — clear OAuth credentials from in-memory store; no token revocation needed (no provider endpoint available)

**Should have (v1.1 polish, after core works):**
- D1: Dual-provider simultaneous auth — Anthropic via API Key + OpenAI via OAuth at the same time
- D2: Mixed auth methods per provider — independent auth method selection per provider
- D3: Proactive token expiry warning — non-intrusive toast when OpenAI token is within 5 minutes of expiry
- D4: Branded OAuth callback page — pi-ai already provides `oauthSuccessHtml`/`oauthErrorHtml` templates

**Defer to v2+:**
- Persistent OAuth sessions across server restarts (requires file-based storage, violates "no database" constraint)
- Token revocation on disconnect (neither provider exposes a revocation endpoint for these flows)
- Browser-side OAuth (impossible — pi-ai OAuth requires Node.js `http.createServer`)

**Confirmed anti-features:**
- A1: Anthropic OAuth — must not be implemented; server-side enforcement rejects tokens as of April 3, 2026
- A3: Browser-side OAuth initiation — pi-ai explicitly throws `"only available in Node.js environments"`
- A6: OAuth tokens in browser cookies/localStorage — security violation; all tokens must stay server-side

### Architecture Approach

The integration extends the existing SPA + Hono backend without structural changes. The Hono backend orchestrates the entire OAuth flow: it calls pi-ai's login functions (which spin up ephemeral callback servers on hardcoded ports), returns the auth URL to the frontend, and stores tokens in an extended credential store. The frontend only initiates, opens a popup, and polls for status — it never sees tokens. The agent factory's `getApiKey` changes from a static string to a dynamic async resolver that checks both the API key store and the OAuth store, with automatic token refresh and a single-flight mutex.

**Major components:**
1. **OAuth credential store** (`src/server/lib/oauth-credentials.ts`) — `Map<OAuthProviderId, OAuthCredentials>` with expiry checking and refresh mutex; sits alongside the existing API key store
2. **Unified credential resolver** (extended `src/server/lib/credentials.ts`) — `resolveApiKey(provider)` checks API Key store first, then OAuth store with auto-refresh; `hasAnyCredentials(provider)` for route guards; `getAuthMethod(provider)` for frontend status
3. **OAuth routes** (`src/server/routes/oauth.ts`) — `POST /api/auth/oauth/start` (non-blocking: starts the login Promise, returns auth URL immediately) and `GET /api/auth/oauth/status` (polling endpoint, returns `pending`/`ok`/`error`/`none`)
4. **Agent factory** (modified `src/server/agent/setup.ts`) — `getApiKey` becomes `async () => resolveApiKey(provider)` instead of the current static string
5. **Connection UI** (modified `src/client/components/connection/connection-page.tsx` and supporting hooks/types) — auth method selector, OAuth login button, popup handling, 2-second polling loop until completion

**Key architectural patterns:**
- Non-blocking OAuth start: the `/start` endpoint stores a pending Promise and returns the auth URL without waiting for token exchange; the callback fires asynchronously when the user completes login
- Frontend polling: 2-second intervals, 5-minute timeout; simpler than SSE/WebSocket for a one-time auth event
- Provider ID mapping must be centralized: app's `"openai"` maps to pi-ai's `"openai-codex"` OAuthProviderId; mismatch here causes silent failures

### Critical Pitfalls

1. **Anthropic OAuth is banned — scope it out entirely** — `sk-ant-oat*` tokens are rejected server-side with `"OAuth authentication is currently not supported."` as of April 3, 2026. The pi-ai library exports the flow (authored before the ban) but the tokens are useless for API calls. Prevention: remove Anthropic OAuth from scope in Phase 0; encode the decision in the credential store (API Key only for Anthropic).

2. **OpenAI OAuth scope may block API calls** — pi-ai requests `openid profile email offline_access` but Codex API may require `model.request`. Token acquisition succeeds while the first actual API call fails. Prevention: after every successful token exchange, immediately make a cheap test API call before storing credentials or declaring success.

3. **pi-ai OAuth functions are Node.js only — never call from frontend** — both `loginAnthropic()` and `loginOpenAICodex()` call `node:http.createServer` and throw in browser environments. Prevention: all OAuth initiation must happen on the Hono backend; frontend receives only the auth URL and polls for status.

4. **Port 1455 is hardcoded and shared with Codex CLI** — the callback URI is pre-registered at OpenAI; it cannot be changed. If Codex CLI or another pi-ai tool is running, the OAuth server fails to bind. Prevention: implement a port availability pre-check; implement the `onManualCodeInput` fallback that pi-ai supports so users can paste the callback URL manually.

5. **Token refresh race condition with one-time-use refresh tokens** — if two concurrent requests both detect an expired token, both attempt refresh; the second call fails with `refresh_token_reused`. Prevention: single-flight mutex in `resolveApiKey()` — when a refresh is in-progress, other callers await the same Promise instead of starting a new refresh.

6. **Credential store must be refactored before any OAuth code is written** — the existing `Map<Provider, string>` cannot store `OAuthCredentials` (compound type: access, refresh, expires). Overwriting either credential type loses the other. Prevention: refactor to a dual-store as Phase 0; this is a hard prerequisite.

## Implications for Roadmap

### Phase 0: Credential Store Refactor (Hard Prerequisite)

**Rationale:** The existing `Map<Provider, string>` is structurally incompatible with OAuth's compound credentials. Writing any OAuth code against the old store will corrupt existing API key credentials. This refactor also forces the Anthropic OAuth decision to be encoded in code (not just docs): the store accepts OAuth only for OpenAI, never for Anthropic.

**Delivers:** Dual-store credential architecture — `storeApiKey`, `storeOAuthCredentials`, `resolveApiKey` (with auto-refresh), `hasAnyCredentials`, `getAuthMethod`. All existing API Key flows continue to work identically.

**Files changed:** `src/server/lib/credentials.ts` (refactored), `src/server/lib/oauth-credentials.ts` (new)

**Avoids:** Pitfall 6 (credential collision), Pitfall 1 (Anthropic OAuth scope creep)

### Phase 1: OpenAI OAuth Backend

**Rationale:** The backend flow must be validated end-to-end — including the scope validation test (Pitfall 2) — before any frontend work begins. This is the highest-risk phase because it depends on OpenAI's live OAuth infrastructure and scope enforcement behavior that cannot be fully predicted from documentation.

**Delivers:** Working `POST /api/auth/oauth/start` and `GET /api/auth/oauth/status` endpoints for OpenAI Codex. Dynamic `getApiKey` in agent factory with single-flight refresh mutex. Port conflict detection and manual paste fallback. Empirical validation that OpenAI OAuth tokens can actually make API calls.

**Files changed/created:** `src/server/routes/oauth.ts` (new), `src/server/agent/setup.ts` (modified), `src/server/index.ts` (mount routes)

**Avoids:** Pitfall 2 (scope test before storing), Pitfall 3 (backend-only login), Pitfall 4 (port conflict + fallback), Pitfall 5 (refresh mutex)

### Phase 2: OAuth Frontend Integration

**Rationale:** Once the backend OAuth flow is validated in Phase 1, wire the frontend. Lower risk — React state and fetch calls using proven patterns. Depends entirely on Phase 1 being stable.

**Delivers:** Auth method selector per provider (OpenAI gets OAuth option, Anthropic shows only API Key), OAuth login button with `window.open()`, 2-second polling loop until `{ status: "ok" }`, connection status badge showing auth method, disconnect logic for OAuth tokens. Features O1, O2, O3, O8, O9.

**Files changed:** `src/client/components/connection/connection-page.tsx`, `src/client/hooks/use-auth.ts`, `src/client/lib/api.ts`, `src/client/lib/types.ts`, `src/client/components/config/inline-auth.tsx`

**Avoids:** UX pitfalls — popup blocker handling, "waiting for auth" spinner, actionable error messages for port conflicts

### Phase 3: Polish and Multi-Provider UX (Optional for v1.1)

**Rationale:** Dual-provider simultaneous auth (D1), mixed auth methods (D2), proactive expiry warnings (D3), and branded callback pages (D4) are low-cost additions once the core is stable. Defer if Phase 1 reveals OpenAI OAuth scope issues that make the feature unreliable.

**Delivers:** D1, D2, D3, D4 — enhanced multi-provider experience

**Condition:** Only proceed if Phase 1 confirms OpenAI OAuth tokens can make real API calls.

### Phase Ordering Rationale

- Phase 0 before everything: the credential store is a structural dependency; without it, OAuth code corrupts API key credentials
- Phase 1 before Phase 2: the backend must be empirically validated (especially the scope issue and port behavior) before building UI around an uncertain foundation
- OpenAI only, never Anthropic: encode this constraint in Phase 0 and never revisit it — the ban is not a gray area
- Phase 3 is explicitly optional: the v1.1 validation goal (OAuth coexistence with API Key, at least for one provider) is met by Phases 0-2 alone

### Research Flags

**Needs empirical validation during implementation (cannot resolve from docs):**
- **Phase 1:** OpenAI OAuth scope requirement (`model.request`) — pi-ai does not request this scope; whether it blocks API calls requires a live test. This is the make-or-break question for the entire milestone.
- **Phase 1:** Port 1455 manual paste fallback — the `onManualCodeInput` callback exists in pi-ai's interface but its actual UX behavior in the current library version has not been verified.

**Standard patterns (no additional research needed):**
- **Phase 0:** TypeScript refactor using patterns already in the codebase; the architecture file provides complete code samples
- **Phase 2:** React state + fetch polling; well-established patterns; architecture file provides full data flow

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All dependencies verified by reading installed node_modules source; zero new packages confirmed |
| Features | HIGH | Feature list is grounded in pi-ai's verified capabilities and provider policies from multiple independent news sources |
| Architecture | HIGH | Implementation patterns are concrete, grounded in existing codebase file paths, and include verified code samples from pi-ai source |
| Pitfalls | HIGH | Anthropic ban verified across 4+ independent sources including the authoritative Claude Code GitHub issue tracker; scope issue verified in pi-ai source and OpenClaw issue tracker; port behavior verified in source and Codex GitHub issues |

**Overall confidence:** HIGH

### Gaps to Address

- **OpenAI OAuth scope requirement (`model.request`):** The milestone's viability depends on this. Cannot be resolved before implementation. If scopes are insufficient and pi-ai does not update them, OpenAI OAuth falls back to API Key only, and the credential store refactor (Phase 0) is the milestone's primary deliverable.
- **Anthropic OAuth final state permanence:** Anthropic's policy shifted three times between January and April 2026. PITFALLS.md's "tokens rejected" finding is the most current. Treat as permanent unless Anthropic explicitly announces an API-accessible OAuth path, which would require a new `sk-ant-api03-*`-equivalent scope, not OAuth subscription tokens.
- **Anthropic Extra Usage billing path (from STACK.md):** The STACK.md researcher described a scenario where Extra Usage billing enables Anthropic OAuth. This appears to describe an intermediate state on April 3-4, 2026 that has since closed, or a forward-looking possibility that has not materialized. Do not implement based on this finding. PITFALLS.md's server-side rejection evidence supersedes it.

## Sources

### Primary (HIGH confidence — source code verified)
- `@mariozechner/pi-ai/dist/utils/oauth/openai-codex.js` — Full PKCE implementation, port 1455, scope list, JWT parsing
- `@mariozechner/pi-ai/dist/utils/oauth/anthropic.js` — Full PKCE implementation, port 53692, `isOAuthToken()` detection, Bearer auth switching
- `@mariozechner/pi-ai/dist/utils/oauth/index.js` — Provider registry, `getOAuthApiKey()` with auto-refresh logic
- `@mariozechner/pi-ai/dist/utils/oauth/types.d.ts` — `OAuthCredentials`, `OAuthLoginCallbacks`, `OAuthProviderInterface`
- `@mariozechner/pi-agent-core/dist/agent.d.ts` — `getApiKey` supports `async Promise<string | undefined>`
- [Anthropic OAuth ban (Claude Code Issue #28091)](https://github.com/anthropics/claude-code/issues/28091) — server-side enforcement confirmed, authoritative source
- [OpenAI Codex Authentication Docs](https://developers.openai.com/codex/auth) — OAuth permitted for third-party tools
- [Anthropic bans third-party OAuth (The Register)](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access) — February 2026 ToS update
- [Anthropic Extra Usage billing change (OpenClaw docs)](https://docs.openclaw.ai/providers/anthropic) — April 4, 2026 billing path closure
- [pi-mono providers docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md) — OAuth provider configuration reference

### Secondary (MEDIUM confidence)
- [OpenAI OAuth tokens missing model.request scope (OpenClaw Issue #24720)](https://github.com/openclaw/openclaw/issues/24720) — scope issue community report
- [Port 1455 conflict issues (Codex Issue #8112)](https://github.com/openai/codex/issues/8112) — port conflict behavior confirmed
- [OAuth token refresh race conditions (Nango Blog)](https://nango.dev/blog/concurrency-with-oauth-token-refreshes) — single-flight mutex pattern
- [Anthropic bans third-party OAuth (WinBuzzer)](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/) — additional coverage
- [OpenCode Codex OAuth implementation](https://github.com/anomalyco/opencode/issues/3281) — third-party reference implementation details

---
*Research completed: 2026-04-04*
*Ready for roadmap: yes*
