---
phase: 08-oauth-connection-ui
plan: 01
subsystem: auth
tags: [oauth, hooks, api-client, shadcn, tabs, disconnect, polling]

# Dependency graph
requires:
  - phase: 05-credential-infrastructure
    provides: clearByType credential store function, ProviderAuthState types
  - phase: 06-anthropic-oauth-flow
    provides: POST /api/auth/oauth/start and GET /api/auth/oauth/status backend routes
  - phase: 07-openai-oauth-flow
    provides: OpenAI OAuth flow support in same backend routes
provides:
  - POST /api/auth/disconnect endpoint (clears both credential types for a provider)
  - shadcn Tabs component (Tabs, TabsList, TabsTrigger, TabsContent)
  - startOAuth, fetchOAuthStatus, disconnectProvider API client functions
  - useAuth hook with startOAuth, cancelOAuth, and backend-aware disconnect
affects: [08-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [polling-with-ref-guard, popup-blocked-detection, best-effort-disconnect]

key-files:
  created:
    - src/client/components/ui/tabs.tsx
  modified:
    - src/server/routes/auth.ts
    - src/client/lib/api.ts
    - src/client/hooks/use-auth.ts

key-decisions:
  - "stopPolling extracted as shared helper used by startOAuth, cancelOAuth, and disconnect"
  - "Polling guard checks pollingRef.has(provider) before AND after async fetchOAuthStatus to prevent stale closure actions"

patterns-established:
  - "Polling-with-ref-guard: setInterval callbacks check ref existence before and after async calls to handle cancellation during flight"
  - "Best-effort disconnect: API call wrapped in try/catch, local state cleared regardless of network result"

requirements-completed: [UI-01, UI-02, UI-03]

# Metrics
duration: 2min
completed: 2026-04-06
---

# Phase 08 Plan 01: OAuth Connection UI Plumbing Summary

**Backend disconnect endpoint, 3 API client functions (startOAuth/fetchOAuthStatus/disconnectProvider), extended useAuth hook with popup-based OAuth flow and polling lifecycle, and shadcn Tabs component**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-06T09:11:34Z
- **Completed:** 2026-04-06T09:13:56Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- POST /api/auth/disconnect endpoint clears both apiKey and oauth credentials for a provider
- Three new API client functions (startOAuth, fetchOAuthStatus, disconnectProvider) wired to backend route contracts
- useAuth hook extended with full OAuth lifecycle: start (API + popup + polling), cancel (stop + reset), and backend-aware disconnect
- Polling auto-stops on terminal states ("ok"/"error") to respect backend session auto-deletion
- shadcn Tabs component installed for auth method selector in Plan 02

## Task Commits

Each task was committed atomically:

1. **Task 1: Add POST /api/auth/disconnect endpoint and install shadcn Tabs** - `c9c2b4e1` (feat)
2. **Task 2: Add OAuth and disconnect API client functions** - `8476327d` (feat)
3. **Task 3: Extend useAuth hook with OAuth flow management and backend-aware disconnect** - `e85f0a1a` (feat)

## Files Created/Modified
- `src/server/routes/auth.ts` - Added clearByType import and POST /disconnect route
- `src/client/components/ui/tabs.tsx` - Generated shadcn Tabs component (base-nova style)
- `src/client/lib/api.ts` - Added startOAuth, fetchOAuthStatus, disconnectProvider functions
- `src/client/hooks/use-auth.ts` - Extended with startOAuth, cancelOAuth, enhanced disconnect, polling lifecycle

## Decisions Made
- Extracted `stopPolling` as a shared helper reused by startOAuth (on terminal state), cancelOAuth, and disconnect — single point of interval cleanup
- Polling callback guards against stale closures by checking `pollingRef.current.has(provider)` both before and after the async `fetchOAuthStatus` call

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All plumbing for Plan 02 (UI components + connection page refactor) is ready
- API functions, hook actions, and Tabs primitive are available for the visual layer
- No blockers

---
*Phase: 08-oauth-connection-ui*
*Completed: 2026-04-06*

## Self-Check: PASSED
