---
phase: 05-credential-infrastructure
plan: 02
subsystem: auth
tags: [credentials, oauth, api-key, async-resolver, refresh-mutex, pi-ai, pi-agent-core, typescript]

requires:
  - phase: 05-credential-infrastructure
    provides: "Compound credential store with getActiveCredential, storeOAuthTokens (Plan 01)"
provides:
  - "Async credential resolver wired to Agent.getApiKey callback"
  - "Per-provider refresh mutex preventing single-use refresh token reuse"
  - "On-demand OAuth token refresh (60s buffer) via pi-ai refreshAnthropicToken / refreshOpenAICodexToken"
  - "createAgent factory with internal credential resolution (callers no longer pass apiKey)"
  - "D-02 no-silent-fallback: refresh failure returns undefined (pi-agent-core surfaces 'no API key' error)"
affects: [06-anthropic-oauth, 07-openai-oauth, 08-oauth-ui, credentials, agent-factory, token-refresh]

tech-stack:
  added: []
  patterns:
    - "Async getApiKey callback resolver pattern: Agent -> resolveCredential -> store + refresh"
    - "Per-provider refresh mutex via Map<Provider, Promise<string | undefined>> with finally cleanup"
    - "Refresh-ahead buffer (REFRESH_BUFFER_MS = 60_000) to avoid mid-request token expiration"
    - "Contract-safe error handling: catch in getApiKey returns undefined (never throws)"

key-files:
  created: []
  modified:
    - src/server/agent/setup.ts
    - src/server/routes/chat.ts

key-decisions:
  - "D-03 realized: createAgent owns credential resolution — callers only pass { provider, modelId, systemPrompt? }"
  - "D-04 realized: OAuth refresh happens inline inside the async getApiKey resolver (pi-agent-core awaits it)"
  - "D-02 realized: refresh failure returns undefined (no silent API Key fallback)"
  - "60s refresh-ahead buffer chosen over post-expiry reactive refresh (avoids mid-stream failures)"
  - "Refresh mutex keyed by Provider (not per-credential) — matches single-active-credential-per-provider model"

patterns-established:
  - "Async credential resolver: Agent.getApiKey = async (p) => store.get(p) -> if OAuth expired: refresh() -> storeOAuthTokens(new) -> return access"
  - "Refresh mutex with finally cleanup: refreshInFlight.set -> await -> refreshInFlight.delete in finally"
  - "Contract-compliant getApiKey: try/catch that returns undefined instead of throwing (per pi-agent-core types.d.ts contract)"

requirements-completed: [CRED-02]

duration: 8min
completed: 2026-04-04
---

# Phase 05 Plan 02: Async Credential Resolver + Refresh Mutex Summary

**Async getApiKey resolver wired to Agent with per-provider refresh mutex, on-demand OAuth refresh via pi-ai's refreshAnthropicToken/refreshOpenAICodexToken, and no-silent-fallback error handling**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-04T21:31:00Z (approx — from task 1 commit metadata)
- **Completed:** 2026-04-04T21:39:00Z (approx — includes human verification window)
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 2

## Accomplishments

- Rewrote `createAgent` to drop the `apiKey` parameter — factory now owns credential resolution (D-03)
- Async `resolveCredential` callback wired to `Agent.getApiKey`: API Key → key string; fresh OAuth → access token; expired OAuth → refresh inline
- Per-provider refresh mutex (`Map<Provider, Promise<string | undefined>>`) prevents concurrent requests from reusing a single-use refresh token
- 60s `REFRESH_BUFFER_MS` triggers refresh before actual expiry, avoiding mid-stream token failures
- Refresh failures return `undefined` (no throw per pi-agent-core contract, no silent fallback per D-02) — pi-agent-core surfaces "no API key" error cleanly
- Removed transitional `@ts-expect-error` from `chat.ts` — full backend now compiles cleanly against the new signature (zero new TS errors)
- Human-verified: v1.0 API Key flow + chat streaming still works end-to-end with zero regression (OAUTH-04)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite setup.ts with async credential resolver + refresh mutex** — `150402d0` (refactor)
2. **Task 2: Remove ts-expect-error from chat.ts** — `0865506a` (refactor)
3. **Task 3: Human verify — API Key smoke test** — checkpoint (user approved all 6 steps)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `src/server/agent/setup.ts` — Rewrote factory: added async `resolveCredential` with refresh mutex, removed `apiKey` from `CreateAgentOptions`, wired `getApiKey: (p) => resolveCredential(p as Provider)` to Agent (76 LOC total, +52 / -5 vs baseline)
- `src/server/routes/chat.ts` — Removed `@ts-expect-error` comment (-1 line); `createAgent({ provider, modelId: model })` call compiles cleanly against new signature

## Decisions Made

- **Async resolver owns refresh (D-04 realized):** Per Plan 05 research, pi-agent-core awaits `getApiKey` before issuing each LLM request, so inline refresh is safe and no timer/background scheduler is needed. Simpler than a background refresh daemon; zero risk of stale-token races.
- **Refresh mutex keyed by Provider:** Matches the single-active-credential-per-provider model (getActiveCredential returns one credential). Two concurrent chat requests for the same provider share the refresh promise via `refreshInFlight.get(provider)`.
- **60s refresh-ahead buffer (REFRESH_BUFFER_MS = 60_000):** Refresh triggers when `Date.now() >= credential.expires - 60_000`. Chosen over post-expiry reactive refresh because a token expiring mid-stream would fail an in-flight LLM call; 60s is more than enough for a refresh round-trip.
- **Catch returns undefined, no API Key fallback (D-02 realized):** The catch block explicitly returns `undefined` instead of reading the API Key from the store. Rationale: if user selected OAuth and it fails, they should see "no API key" and resolve the OAuth issue — silently falling back to API Key would mask revocation/rotation failures and create confusing "why is it still working with wrong account?" bugs.
- **finally cleanup ensures re-attempts:** `refreshInFlight.delete(provider)` runs after resolve OR reject, so a failed refresh doesn't poison the mutex — the next call can re-attempt the refresh.

## Deviations from Plan

None — plan executed exactly as written. Both Task 1 and Task 2 passed acceptance criteria on first verification.

**Minor stylistic choice in Task 1:** Used `credential.type !== "oauth"` instead of `credential.type === "apiKey"` for the API Key branch — both are behaviorally identical (there are only two credential types in the discriminated union), and the `!== "oauth"` form keeps the OAuth path as the primary code flow being analyzed. This is a refactoring-safe equivalence, not a semantic deviation.

**Scope note:** `setup.ts` carries one pre-existing TypeScript error at L62 (`getModel(provider, modelId as any)` — the same class of narrowing issue as `auth.ts:32` and `models.ts:20` already documented in `deferred-items.md`). The `modelId as any` cast was preserved verbatim from the original setup.ts per the plan's explicit action block. Confirmed pre-existing via `git stash` — not introduced by this plan. Added to `deferred-items.md` with root-cause analysis.

Full-backend typecheck (`tsc -p tsconfig.node.json --noEmit`) reports **7 errors — identical to the Plan 05-01 baseline**. Zero new TypeScript errors introduced by this plan.

## Issues Encountered

None.

## User Setup Required

None — the async resolver is fully in-process, no external services touched. OAuth refresh flows delegate to pi-ai's built-in `refreshAnthropicToken` / `refreshOpenAICodexToken` which handle their own HTTP calls to the provider endpoints.

## Next Phase Readiness

**Plan 05-03 unblocked:** `createAgent` signature is stable; frontend per-provider auth state UI (already in flight from wave 2 parallel execution) can depend on this being complete.

**Phase 06 (Anthropic OAuth Flow) unblocked:**
- `storeOAuthTokens("anthropic", tokens)` will be called by the Phase 6 OAuth callback handler
- `refreshAnthropicToken` integration is already wired — Phase 6 only needs to perform the initial login flow
- Refresh mutex will automatically protect the first refresh-after-login cycle

**Phase 07 (OpenAI OAuth Flow) unblocked:**
- Same wiring as Anthropic: `storeOAuthTokens("openai", tokens)` + `refreshOpenAICodexToken` is ready
- Phase 7 only needs to solve the scope/callback-port issues flagged in STATE.md blockers

**Known Stubs:** None.

**Deferred Items (tracked, not blocking):** See `deferred-items.md` — 3 pre-existing TypeScript errors (auth.ts:32, models.ts:20, setup.ts:62) all caused by pi-ai getModel/getModels provider-narrowing type signatures. All carry over from pre-Plan 05 baseline.

## Self-Check: PASSED

All claimed files exist on disk. All claimed commits exist in git log.

- Files verified: `src/server/agent/setup.ts` (76 LOC, async resolver + mutex), `src/server/routes/chat.ts` (no ts-expect-error), `.planning/phases/05-credential-infrastructure/05-02-SUMMARY.md`, `.planning/phases/05-credential-infrastructure/deferred-items.md` (updated)
- Commits verified: `150402d0` (Task 1), `0865506a` (Task 2), human-verify checkpoint approved by user
- Grep checks:
  - `grep -c "apiKey" src/server/agent/setup.ts` = 0 (confirmed — no apiKey references)
  - `grep -c "REFRESH_BUFFER_MS = 60_000" src/server/agent/setup.ts` = 1
  - `grep -c "refreshInFlight = new Map" src/server/agent/setup.ts` = 1
  - `grep -c "async function resolveCredential" src/server/agent/setup.ts` = 1
  - `grep -c "from \"@mariozechner/pi-ai/oauth\"" src/server/agent/setup.ts` = 1
  - `grep -c "refreshInFlight.delete(provider)" src/server/agent/setup.ts` = 1
  - `grep -c "ts-expect-error" src/server/routes/chat.ts` = 0
  - `grep -c "createAgent({ provider, modelId: model })" src/server/routes/chat.ts` = 1
- TypeScript: 7 errors total (identical to Plan 05-01 baseline; zero new)

---
*Phase: 05-credential-infrastructure*
*Completed: 2026-04-04*
