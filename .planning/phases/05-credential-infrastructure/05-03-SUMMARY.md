---
phase: 05-credential-infrastructure
plan: 03
subsystem: ui
tags: [frontend, react, hooks, auth, typescript, state-management, per-provider]

requires:
  - phase: 05-credential-infrastructure
    provides: "GET /api/auth/status endpoint returning { hasApiKey, hasOAuth, activeMethod, oauthExpiry? }"
provides:
  - "Per-provider frontend auth state — Anthropic and OpenAI track auth independently"
  - "ProviderAuthState exposing authMethod ('apiKey' | 'oauth' | null) per provider for Phase 8 UI badges"
  - "useAuth hook with Map<Provider, ProviderAuthState> state and getProviderAuth accessor"
  - "fetchAuthStatus API client calling GET /api/auth/status"
  - "refreshStatus hook action for syncing frontend state with backend credential state"
  - "API Key connection UX preserved byte-identical to v1.0 (OAUTH-04)"
affects: [06-anthropic-oauth, 07-openai-oauth, 08-oauth-ui, connection-page, auth-badges]

tech-stack:
  added: []
  patterns:
    - "Per-provider state Map in hooks: Map<Provider, ProviderAuthState> with provider-keyed setters/getters"
    - "Immutable Map updates via new Map(prev) for React referential-equality rerenders"
    - "Hook accessor pattern: getProviderAuth(provider) returns fallback DEFAULT_STATE for type safety"
    - "Silent refresh on status endpoint failures — preserves existing state on network errors"

key-files:
  created: []
  modified:
    - src/client/lib/types.ts
    - src/client/lib/api.ts
    - src/client/hooks/use-auth.ts
    - src/client/components/connection/connection-page.tsx
    - src/client/components/chat/chat-layout.tsx

key-decisions:
  - "Per-provider auth state via Map<Provider, ProviderAuthState> (D-06) — Anthropic and OpenAI are independent"
  - "authMethod field on ProviderAuthState (D-05) — prepares UI-03 token health badges in Phase 8"
  - "getProviderAuth accessor returns DEFAULT_STATE fallback — guarantees non-null return for type safety"
  - "refreshStatus silently fails on network errors — preserves current state rather than wiping to disconnected"
  - "Removed stale const { auth } = useAuth() from chat-layout.tsx — dead code, never referenced in component body"

patterns-established:
  - "Per-provider state in React hooks: Map keyed by Provider enum, with initialState() seeding all providers"
  - "Provider-parameterized hook actions: connect(provider, apiKey), disconnect(provider), refreshStatus(provider)"
  - "Conditional spread for optional fields: ...(data.oauthExpiry !== undefined ? { oauthExpiry: ... } : {})"

requirements-completed: [CRED-01, OAUTH-04]

duration: 10 min
completed: 2026-04-04
---

# Phase 05 Plan 03: Per-Provider Frontend Auth State Summary

**Refactored useAuth hook to track Anthropic and OpenAI independently via Map<Provider, ProviderAuthState> with authMethod field, added fetchAuthStatus API client, preserved v1.0 API Key connection UX**

## Performance

- **Duration:** 10 min (code: 1 min 19 sec across 4 tasks; human verification: ~8 min)
- **Started:** 2026-04-04T21:31:10Z
- **Completed:** 2026-04-04T21:41:00Z
- **Tasks:** 5 (4 code + 1 human-verify checkpoint)
- **Files modified:** 5

## Accomplishments

- **Per-provider auth state (D-06):** Replaced single `AuthState { status, provider, error }` with `AuthState { providers: Map<Provider, ProviderAuthState> }`. Anthropic and OpenAI can now have independent auth methods/statuses simultaneously.
- **authMethod field (D-05):** `ProviderAuthState` exposes `authMethod: 'apiKey' | 'oauth' | null` per provider, preparing the Phase 8 UI-03 badge system (Connected via API Key vs Connected via OAuth).
- **useAuth hook refactor:** New signature returns `{ getProviderAuth(provider), connect(provider, apiKey), disconnect(provider), refreshStatus(provider) }`. State keyed by Provider, updated immutably via `new Map(prev)`.
- **fetchAuthStatus API function:** New typed client for `GET /api/auth/status?provider=...` exposing `AuthStatusResponse { hasApiKey, hasOAuth, activeMethod, oauthExpiry? }` — the contract established by Plan 05-01.
- **Connection page migration:** `connection-page.tsx` consumes `getProviderAuth(provider)` — UI behavior (connecting/connected/error states, auto-redirect) identical to v1.0.
- **chat-layout.tsx cleanup:** Removed dead `const { auth } = useAuth()` destructuring and its import — auth was never referenced in the component body and would have broken tsc after the hook refactor.
- **OAUTH-04 preserved on frontend:** User-verified API Key connect flow works byte-identical to v1.0 (8-step manual verification passed).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types.ts with per-provider auth types** - `d7b8f098` (refactor)
2. **Task 2: Add fetchAuthStatus to api.ts** - `ee75331a` (feat)
3. **Task 3: Refactor use-auth.ts + chat-layout.tsx cleanup** - `7bcd0e05` (refactor)
4. **Task 4: Update connection-page.tsx** - `bf229fe3` (refactor)
5. **Task 5: Human verify — Connection UI zero regression** - no code commit (checkpoint task)

## Files Created/Modified

- `src/client/lib/types.ts` — Added `AuthMethod` type, `ProviderAuthState` interface; replaced single-provider `AuthState` with `{ providers: Map<Provider, ProviderAuthState> }`
- `src/client/lib/api.ts` — Added `fetchAuthStatus(provider)` function and `AuthStatusResponse` interface; imported `AuthMethod` type
- `src/client/hooks/use-auth.ts` — Rewrote hook from single-provider scalar state to per-provider Map state; added `getProviderAuth`, `refreshStatus`, and provider-parameterized `connect`/`disconnect`
- `src/client/components/connection/connection-page.tsx` — Switched from `const { auth, connect }` to `const { getProviderAuth, connect }` + `const auth = getProviderAuth(provider)`; reordered hook calls so `provider` state is declared before `getProviderAuth` is called
- `src/client/components/chat/chat-layout.tsx` — Removed dead `const { auth } = useAuth()` destructuring and unused `useAuth` import (auth was never referenced in component body)

## Decisions Made

- **Per-provider Map state (D-06 from 05-CONTEXT.md):** Chose `Map<Provider, ProviderAuthState>` over two separate state variables or a flat record. Rationale: scales naturally if a third provider is added, reads cleanly via `getProviderAuth(provider)`, and immutable updates via `new Map(prev)` integrate with React's referential-equality rerender model.
- **authMethod on ProviderAuthState (D-05):** Chose to include `authMethod: 'apiKey' | 'oauth' | null` on the per-provider state rather than deriving it elsewhere. Rationale: Phase 8 UI-03 needs a simple accessor for the badge and this pre-computes it during state transitions (set at connect time, read at render time).
- **getProviderAuth returns DEFAULT_STATE fallback:** `providers.get(provider) ?? DEFAULT_STATE`. Rationale: `initialState()` seeds every Provider so the `??` never fires in practice, but the type system requires a non-null return since `Map.get` returns `T | undefined`. DEFAULT_STATE keeps the hook contract simple for consumers.
- **refreshStatus swallows errors:** On fetch failure, leaves current state intact rather than transitioning to "error". Rationale: `refreshStatus` is for sync-on-mount and background polling — a transient network blip shouldn't wipe a known-connected state. Real user-driven actions (connect/disconnect) do surface errors.
- **Removed stale destructuring in chat-layout.tsx:** The line `const { auth } = useAuth()` was verified to never reference `auth` anywhere in the component body. After Task 3's hook refactor, this destructuring would have failed tsc ("Property 'auth' does not exist"). Removing both the call and the import is safe and keeps the build green.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria for Tasks 1-4 passed on first verification. Human verification (Task 5) passed all 8 manual checks on first run: provider toggle, placeholder switching, invalid key error state, valid key success + redirect, /api/auth/status curl response, chat page load verification.

**Scope note:** Full `tsc -p tsconfig.app.json --noEmit` reports 4 pre-existing errors in unrelated files (`harness-picker.tsx`, `markdown-renderer.tsx`, `scroll-area.tsx`). These are NOT in any of the 5 plan-modified files. Verified via targeted filter: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -E "(types\.ts|api\.ts|use-auth\.ts|chat-layout\.tsx|connection-page\.tsx)" | wc -l` returns 0. Out of scope per SCOPE BOUNDARY rule — pre-existing warnings in unrelated files, already tracked.

## Authentication Gates

None. The human-verify checkpoint (Task 5) was a UI regression test, not an authentication gate — user exercised the real API Key connect flow in the browser and verified the backend `/api/auth/status` endpoint via curl.

## Issues Encountered

None.

## User Setup Required

None — pure frontend refactor, no external services or environment variables touched.

## Next Phase Readiness

**Phase 05 nearly complete:**
- Plan 05-01 complete: credential store + GET /auth/status endpoint
- Plan 05-02 complete: async getApiKey resolver + refresh mutex (verified via commits 150402d0, 0865506a — but no SUMMARY.md yet on disk for 05-02)
- Plan 05-03 complete (this plan): per-provider frontend auth state

**Phase 6 (Anthropic OAuth) unblocked at the frontend contract level:**
- `ProviderAuthState.authMethod` ready to hold `'oauth'` once Phase 6-7 add OAuth login buttons
- `refreshStatus(provider)` ready to sync state after OAuth callback completes
- `oauthExpiry` field ready for Phase 8 UI-03 token health badges (expiring soon / expired)

**Phase 8 (OAuth Connection UI) unblocked at the frontend state level:**
- UI-03 badges can read `authMethod` directly from `ProviderAuthState`
- Per-provider state means the UI can render independent badges for Anthropic and OpenAI
- `getProviderAuth(provider)` accessor keeps per-card UI logic clean

**Known Stubs:** None.

**Pre-existing TS errors (out of scope):** 4 errors in `harness-picker.tsx` (2), `markdown-renderer.tsx` (1), `scroll-area.tsx` (1). Not introduced by this plan, not in plan scope. Logged here for visibility — should be addressed in a future cleanup plan.

## Self-Check: PASSED

All claimed files exist on disk. All claimed commits exist in git log.

- **Files verified on disk:**
  - `src/client/lib/types.ts` (138 lines, exports AuthMethod + ProviderAuthState)
  - `src/client/lib/api.ts` (61 lines, exports fetchAuthStatus + AuthStatusResponse)
  - `src/client/hooks/use-auth.ts` (87 lines, exports useAuth with getProviderAuth/connect/disconnect/refreshStatus)
  - `src/client/components/connection/connection-page.tsx` (106 lines, uses getProviderAuth(provider))
  - `src/client/components/chat/chat-layout.tsx` (102 lines, no useAuth reference)
  - `.planning/phases/05-credential-infrastructure/05-03-SUMMARY.md` (this file)
- **Commits verified in git log:**
  - `d7b8f098` Task 1 (types.ts)
  - `ee75331a` Task 2 (api.ts)
  - `7bcd0e05` Task 3 (use-auth.ts + chat-layout.tsx)
  - `bf229fe3` Task 4 (connection-page.tsx)
- **Type check verified:** 0 errors in plan-modified files via targeted grep filter on `tsc -p tsconfig.app.json --noEmit` output
- **Human verification verified:** User responded "approved" — all 8 manual verification steps passed (provider toggle, placeholder switching, invalid/valid key flows, /api/auth/status curl, chat page load)

---
*Phase: 05-credential-infrastructure*
*Completed: 2026-04-04*
