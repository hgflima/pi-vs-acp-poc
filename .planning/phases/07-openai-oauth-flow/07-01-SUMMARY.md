---
phase: 07-openai-oauth-flow
plan: 01
subsystem: auth
tags: [oauth, pi-ai, openai-codex, provider-remap, typescript]

# Dependency graph
requires:
  - phase: 05-credential-infrastructure
    provides: "credential store (storeOAuthTokens, getActiveCredential, getAuthStatus, clearByType, hasAnyCredential) and Provider/AuthMethod types"
  - phase: 06-anthropic-oauth-flow
    provides: "setup.ts resolveCredential with refresh mutex (Plan 05-02 baseline extended in Plan 06)"
provides:
  - "resolvePiProvider helper — remaps 'openai' to 'openai-codex' when OAuth is the active credential"
  - "forceExpireOAuth helper — mutates stored OAuth expires for UAT refresh testing"
  - "PiProvider type ('anthropic' | 'openai' | 'openai-codex') for pi-ai call sites"
  - "setup.ts createAgent routes getModel through resolvePiProvider"
  - "models.ts /api/models handler routes getModels through resolvePiProvider"
affects: [07-02-oauth-routes, 07-03-uat, 08-oauth-connection-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backend-internal provider remap via helper (Provider type stays stable for frontend)"
    - "Module-scoped debug helpers coexist with production exports (forceExpireOAuth)"

key-files:
  created: []
  modified:
    - src/server/lib/credentials.ts
    - src/server/agent/setup.ts
    - src/server/routes/models.ts

key-decisions:
  - "Backend-internal remap: frontend-facing Provider stays 'anthropic' | 'openai'; PiProvider is backend-only"
  - "forceExpireOAuth lives in credentials.ts (touches store internal state) — not in oauth.ts route file"
  - "Removed 'as any' cast on modelId in setup.ts once PiProvider type aligned with pi-ai's KnownProvider"

patterns-established:
  - "resolvePiProvider centralizes pi-ai call-site routing rule (single source of truth for OAuth → codex remap)"
  - "Debug helpers (forceExpireOAuth) always enabled — no NODE_ENV gate, consistent with POC local-only philosophy (D-07)"

requirements-completed: [OAUTH-02, OAUTH-03]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 7 Plan 01: Provider Remap Summary

**Added resolvePiProvider/forceExpireOAuth helpers to credentials.ts and wired resolvePiProvider into getModel/getModels call sites so OAuth-backed OpenAI requests route through pi-ai's openai-codex provider.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-05T17:09:45Z
- **Completed:** 2026-04-05T17:11:16Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `resolvePiProvider(provider: Provider): PiProvider` helper added — returns "openai-codex" when provider is "openai" AND activeMethod is "oauth", else returns provider unchanged (D-01)
- `forceExpireOAuth(provider: Provider)` helper added — mutates stored OAuth expires to Date.now() - 1000 and returns { before, after } pair, or null if no OAuth stored (D-06)
- `PiProvider` type export ("anthropic" | "openai" | "openai-codex") for pi-ai call sites
- `setup.ts createAgent` now calls `getModel(resolvePiProvider(provider), modelId)` — removed `as any` cast on modelId
- `models.ts /api/models handler` now calls `getModels(resolvePiProvider(typedProvider))` — so OAuth-active OpenAI returns codex models, API-Key-active returns standard openai models (D-02)
- All existing Phase 5 credentials.ts exports preserved — no breaking changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add resolvePiProvider, forceExpireOAuth, PiProvider to credentials.ts** - `1915b8ef` (feat)
2. **Task 2: Wire resolvePiProvider into getModel call in setup.ts** - `94293014` (feat)
3. **Task 3: Wire resolvePiProvider into getModels call in models.ts** - `76d5a234` (feat)

## Files Created/Modified

- `src/server/lib/credentials.ts` - Added PiProvider type, resolvePiProvider helper, forceExpireOAuth helper (29 lines inserted, existing exports untouched)
- `src/server/agent/setup.ts` - Extended credentials import with resolvePiProvider; getModel call now routes through resolvePiProvider, removed `as any` cast
- `src/server/routes/models.ts` - Extended credentials import with resolvePiProvider; getModels call now routes through resolvePiProvider(typedProvider)

## Decisions Made

- **resolvePiProvider signature** — takes `Provider` (narrow type) not raw string, returns `PiProvider` (widened type including "openai-codex"). Keeps the call-site type narrowing explicit.
- **forceExpireOAuth placement** — lives in credentials.ts because it touches the `store` Map's internal OAuth credential state. Placing it in oauth.ts would require exposing the store or adding a setter API; keeping it in credentials.ts is the minimal surface-area approach.
- **`as any` cast removal in setup.ts** — pi-ai's `getModel(provider, modelId)` accepts `string` for modelId. The cast was only there to quiet TypeScript when provider's narrow type was being widened at call time. With PiProvider now covering all three slugs, the cast is unnecessary.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0
**Impact on plan:** Clean execution. All acceptance criteria pass on first attempt. Project-wide `npx tsc --noEmit` exits 0.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (oauth-routes) can now import `forceExpireOAuth` from credentials.ts for the debug endpoint
- Plan 02 route handlers gain the OpenAI OAuth dispatch; `resolveCredential` in setup.ts already handles the refresh path via `refreshOpenAICodexToken` (Phase 5 plumbing)
- Plan 03 (UAT) will validate end-to-end that `/api/chat?provider=openai` with an OAuth-active credential routes to Codex models (gpt-5.1, gpt-5.1-codex) via chatgpt.com/backend-api
- No blockers for follow-up plans

## Self-Check: PASSED

**Files verified:**
- FOUND: src/server/lib/credentials.ts (contains resolvePiProvider, forceExpireOAuth, PiProvider)
- FOUND: src/server/agent/setup.ts (contains getModel(resolvePiProvider(provider), modelId))
- FOUND: src/server/routes/models.ts (contains getModels(resolvePiProvider(typedProvider)))

**Commits verified:**
- FOUND: 1915b8ef (Task 1 — credentials.ts helpers)
- FOUND: 94293014 (Task 2 — setup.ts getModel)
- FOUND: 76d5a234 (Task 3 — models.ts getModels)

**TypeScript:**
- `npx tsc --noEmit -p tsconfig.json` exits 0 — project-wide type safety

---
*Phase: 07-openai-oauth-flow*
*Completed: 2026-04-05*
