---
phase: 05-credential-infrastructure
verified: 2026-04-04T21:55:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 05: Credential Infrastructure Verification Report

**Phase Goal:** Existing API Key auth continues working while the credential system gains the ability to store and resolve compound OAuth credentials per provider
**Verified:** 2026-04-04T21:55:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can still connect with API Key for both Anthropic and OpenAI exactly as in v1.0 (zero regression) | VERIFIED | `POST /api/auth/apikey` route unchanged; `storeApiKey` call preserved at line 64 of auth.ts; human-verified by user (Plan 02 Task 3, Plan 03 Task 5 — all steps approved) |
| 2 | Credential store accepts both API Key (string) and OAuth credentials (access token, refresh token, expiry) per provider without collision | VERIFIED | `credentials.ts` holds `Map<Provider, { apiKey: ApiKeyCredential \| null, oauth: OAuthCredential \| null }>` compound record; `storeApiKey` and `storeOAuthTokens` write to separate fields; `getActiveCredential` returns `oauth ?? apiKey ?? null` (D-01 priority) |
| 3 | Agent factory resolves credentials via async getApiKey that transparently returns the active credential (API Key or OAuth access token) for the current provider | VERIFIED | `setup.ts` wires `getApiKey: (p) => resolveCredential(p as Provider)` to Agent constructor (line 73); `resolveCredential` handles API Key passthrough, fresh OAuth token return, expired OAuth refresh via `refreshAnthropicToken`/`refreshOpenAICodexToken`, and `undefined` on failure (D-02) |
| 4 | Credential store supports both Anthropic and OpenAI providers with either auth method | VERIFIED | `Provider = "anthropic" \| "openai"` exported type; `storeApiKey`, `storeOAuthTokens`, `hasAnyCredential`, `getAuthStatus` all accept `Provider`; frontend `useAuth` seeds both providers in `initialState()`; `fetchAuthStatus` queries backend per provider independently |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/lib/credentials.ts` | Compound credential store with 6 exports + types | VERIFIED | 97 LOC; exports storeApiKey, storeOAuthTokens, getActiveCredential, clearByType, getAuthStatus, hasAnyCredential; exports Provider, AuthMethod, AuthStatus, Credential types; old exports (storeCredentials, getCredentials, hasCredentials, clearCredentials) absent |
| `src/server/routes/auth.ts` | POST /apikey (unchanged) + GET /status | VERIFIED | Imports storeApiKey + getAuthStatus; line 78 adds `authRoutes.get("/status", ...)`; storeApiKey called at line 64 (post-validation); mapErrorMessage and streamSimple unchanged |
| `src/server/routes/models.ts` | Guard using hasAnyCredential | VERIFIED | Imports hasAnyCredential (line 3); calls `hasAnyCredential(typedProvider)` at line 16; 401 + needsAuth response shape unchanged |
| `src/server/routes/chat.ts` | Guard using hasAnyCredential; no apiKey passthrough to createAgent | VERIFIED | Imports hasAnyCredential (line 5); calls `hasAnyCredential(provider)` at line 17; `createAgent({ provider, modelId: model })` at line 22 (no apiKey); no ts-expect-error comment |
| `src/server/agent/setup.ts` | async resolveCredential + refresh mutex; no apiKey in CreateAgentOptions | VERIFIED | REFRESH_BUFFER_MS = 60_000 (line 11); refreshInFlight Map (line 14); async resolveCredential function (line 16); getApiKey wired at line 73; 0 occurrences of "apiKey" in file; refreshInFlight.delete in finally (line 47) |
| `src/client/lib/types.ts` | AuthMethod type + ProviderAuthState interface + AuthState with Map | VERIFIED | AuthMethod at line 7; ProviderAuthState at line 10; AuthState.providers: Map<Provider, ProviderAuthState> at line 18 |
| `src/client/lib/api.ts` | fetchAuthStatus function + AuthStatusResponse interface | VERIFIED | AuthStatusResponse at line 14; fetchAuthStatus at line 21; calls `/api/auth/status?provider=${provider}` |
| `src/client/hooks/use-auth.ts` | Per-provider Map state; getProviderAuth; connect/disconnect/refreshStatus | VERIFIED | 87 LOC; Map<Provider, ProviderAuthState> state; returns { getProviderAuth, connect, disconnect, refreshStatus } at line 86; refreshStatus calls fetchAuthStatus(provider) at line 71 |
| `src/client/components/connection/connection-page.tsx` | Consumes getProviderAuth(provider) | VERIFIED | Line 14: destructures { getProviderAuth, connect }; line 15: `const auth = getProviderAuth(provider)`; connect(provider, apiKey) call preserved; auth.status === "connected" redirect preserved |
| `src/client/components/chat/chat-layout.tsx` | No stale useAuth destructuring | VERIFIED | Zero occurrences of "useAuth" in file; dead code from prior `const { auth } = useAuth()` fully removed including import |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/server/routes/auth.ts` | `src/server/lib/credentials.ts` | storeApiKey import | WIRED | Line 3: `import { storeApiKey, getAuthStatus } from "../lib/credentials"` |
| `src/server/routes/auth.ts` | `src/server/lib/credentials.ts` | getAuthStatus for /status route | WIRED | Line 3 import + line 83 call: `return c.json(getAuthStatus(provider))` |
| `src/server/routes/models.ts` | `src/server/lib/credentials.ts` | hasAnyCredential import | WIRED | Line 3 import + line 16 guard |
| `src/server/routes/chat.ts` | `src/server/lib/credentials.ts` | hasAnyCredential import | WIRED | Line 5 import + line 17 guard |
| `src/server/agent/setup.ts` | `src/server/lib/credentials.ts` | getActiveCredential + storeOAuthTokens | WIRED | Line 8: `import { getActiveCredential, storeOAuthTokens, type Provider } from "../lib/credentials"` |
| `src/server/agent/setup.ts` | `@mariozechner/pi-ai/oauth` | refreshAnthropicToken + refreshOpenAICodexToken | WIRED | Line 3: `import { refreshAnthropicToken, refreshOpenAICodexToken } from "@mariozechner/pi-ai/oauth"` |
| `src/server/agent/setup.ts` | Agent.getApiKey contract | async callback wired to Agent constructor | WIRED | Line 73: `getApiKey: (p) => resolveCredential(p as Provider)` |
| `src/client/hooks/use-auth.ts` | `src/client/lib/types.ts` | ProviderAuthState type import | WIRED | Line 2: `import type { Provider, ProviderAuthState } from "@/client/lib/types"` |
| `src/client/hooks/use-auth.ts` | `src/client/lib/api.ts` | connectProvider + fetchAuthStatus | WIRED | Line 3: `import { connectProvider, fetchAuthStatus } from "@/client/lib/api"` |
| `src/client/components/connection/connection-page.tsx` | `src/client/hooks/use-auth.ts` | useAuth hook | WIRED | Line 7 import + line 14 destructuring + line 15 getProviderAuth call |

---

### Data-Flow Trace (Level 4)

Only `connection-page.tsx` and `use-auth.ts` render dynamic data from the credential flow. Backend modules are logic/store, not rendering components.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `connection-page.tsx` | `auth` (ProviderAuthState) | `getProviderAuth(provider)` → Map<Provider, ProviderAuthState> in useAuth | Yes — state set by `connect(provider, apiKey)` which calls `connectProvider` (real HTTP POST to backend) | FLOWING |
| `use-auth.ts` | `providers` Map | `connectProvider` (POST /api/auth/apikey) + `fetchAuthStatus` (GET /api/auth/status) | Yes — both functions make real fetch calls to Hono backend; responses update Map state | FLOWING |
| `src/server/routes/auth.ts` GET /status | AuthStatus JSON | `getAuthStatus(provider)` → in-memory store | Yes — reads from compound Map store populated by storeApiKey/storeOAuthTokens | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for backend — server must be running for HTTP endpoint checks. Human verification in Plan 02 Task 3 (6 curl steps) and Plan 03 Task 5 (8 UI steps) constitute the behavioral verification. Both reported "approved" by user.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| credentials.ts exports 6 functions | grep count on file | 6 export functions present | PASS |
| Old credential API removed | grep storeCredentials/getCredentials in credentials.ts | 0 matches | PASS |
| setup.ts has no apiKey field | grep apiKey in setup.ts | 0 matches | PASS |
| ts-expect-error removed from chat.ts | grep ts-expect-error in chat.ts | 0 matches | PASS |
| chat-layout.tsx has no stale useAuth | grep useAuth in chat-layout.tsx | 0 matches | PASS |
| All 9 phase commits exist in git log | git log with all commit hashes | All 9 commits present | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CRED-01 | Plans 01, 03 | Credential store supports compound credentials (OAuth tokens + API Key) coexisting per provider | SATISFIED | `credentials.ts` holds `Map<Provider, { apiKey, oauth }>` compound record; frontend `ProviderAuthState` tracks `authMethod` per provider |
| CRED-02 | Plan 02 | Agent factory uses async getApiKey resolver with transparent token refresh | SATISFIED | `setup.ts` wires `async resolveCredential` to `Agent.getApiKey`; handles API Key, fresh OAuth, expired OAuth (refresh + store), and graceful undefined on failure |
| OAUTH-04 | Plans 01, 02, 03 | User can use API Key as alternative to OAuth for any provider | SATISFIED | `POST /api/auth/apikey` behavior preserved byte-identical; `storeApiKey` called after validation; `useAuth.connect()` sets `authMethod: "apiKey"` on success; human-verified end-to-end |

**No orphaned requirements.** All three requirement IDs declared in plan frontmatter are satisfied with evidence. No additional Phase 5 requirements exist in REQUIREMENTS.md beyond these three.

---

### Anti-Patterns Found

None. All 10 phase-modified files were scanned for TODO, FIXME, PLACEHOLDER, "not yet implemented", empty returns, and hardcoded empty state. Zero matches found.

---

### Human Verification Required

All automated checks passed. Human verification was performed during execution:

**Plan 02 Task 3 — API Key Smoke Test (6 steps — APPROVED)**
Steps verified: POST /api/auth/apikey with valid key → 200 ok; invalid key → 401; GET /api/auth/status?provider=anthropic → AuthStatus JSON; GET /auth/status with no credentials → all false/null; invalid provider → 400; end-to-end chat streaming with API Key.

**Plan 03 Task 5 — Connection UI Zero Regression (8 steps — APPROVED)**
Steps verified: provider toggle, placeholder switching, invalid key error state, valid key success + redirect, /api/auth/status curl, chat page load. UI behavior confirmed identical to v1.0.

No additional human verification required for this verification pass.

---

### Gaps Summary

No gaps. All 4 observable truths verified. All 10 artifacts pass levels 1-3 (exist, substantive, wired). All 10 key links are wired. Requirements CRED-01, CRED-02, and OAUTH-04 are satisfied with implementation evidence.

**TypeScript note:** 7 pre-existing backend errors and 4 pre-existing frontend errors exist in files outside phase 5 scope (pi-ai provider narrowing in auth.ts/models.ts/setup.ts; harness-picker, markdown-renderer, scroll-area). These are documented in `deferred-items.md` and confirmed pre-existing via git history (present at v1.0 milestone commit 8c4512b9). Zero new errors introduced by phase 5.

---

_Verified: 2026-04-04T21:55:00Z_
_Verifier: Claude (gsd-verifier)_
