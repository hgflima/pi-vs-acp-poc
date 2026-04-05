---
phase: 06-anthropic-oauth-flow
plan: 01
subsystem: auth
tags: [oauth, pkce, anthropic, hono, sse]

# Dependency graph
requires:
  - phase: 05-credential-infrastructure
    provides: "storeOAuthTokens(), Provider type, credential store infrastructure"
provides:
  - "POST /api/auth/oauth/start endpoint (orchestrates loginAnthropic PKCE flow)"
  - "GET /api/auth/oauth/status endpoint (polls in-flight OAuth session state)"
  - "Per-provider PendingSession Map for tracking in-flight OAuth flows (D-01)"
  - "Port 53692 pre-check with Claude Code CLI conflict detection (D-02)"
  - "oauthRoutes Hono sub-router mounted at /api/auth/oauth"
affects: [07-openai-oauth-flow, 08-oauth-connection-ui]

# Tech tracking
tech-stack:
  added: ["@mariozechner/pi-ai/oauth (loginAnthropic subpath import)"]
  patterns:
    - "Promise-resolver auth URL capture (Pattern 1)"
    - "Background promise lifecycle for long-running OAuth flow (Pattern 4)"
    - "Session identity guard prevents stale state updates"
    - "Port pre-check via node:http createServer probe"

key-files:
  created:
    - "src/server/routes/oauth.ts"
  modified:
    - "src/server/index.ts"

key-decisions:
  - "Promise-resolver with rejectAuthUrl safety — handles loginAnthropic rejection before onAuth fires (prevents hang)"
  - "Auto-clear GET /status on done/error — first poll after completion returns final state then clears"
  - "D-01: Per-provider Map<Provider, PendingSession> — supports concurrent Anthropic+OpenAI flows"
  - "D-02: Pre-check port 53692 before loginAnthropic — returns 409 with Claude Code CLI message"
  - "D-03: Second POST /start discards first session — no reclaim mechanism"

patterns-established:
  - "Promise-resolver for async callback-to-sync-response bridging"
  - "Session identity guard (Map.get(k) === session) for stale-update prevention"
  - "Port probe via createServer.listen() + immediate close for EADDRINUSE detection"

requirements-completed: [OAUTH-01]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 06 Plan 01: Anthropic OAuth Flow Routes Summary

**Hono sub-router orchestrating loginAnthropic PKCE flow with port-conflict detection, Promise-resolver URL capture, and per-provider session tracking**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-05T13:02:53Z
- **Completed:** 2026-04-05T13:04:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- POST /api/auth/oauth/start synchronously returns the authUrl for the frontend to open
- GET /api/auth/oauth/status polling endpoint returns pending/ok/error/none
- Port 53692 pre-check returns HTTP 409 with Claude Code CLI message on conflict
- Per-provider PendingSession Map ready for Phase 7 OpenAI coexistence

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/server/routes/oauth.ts** — `382312c1` (feat)
2. **Task 2: Mount oauthRoutes at /api/auth/oauth** — `53ecb769` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `src/server/routes/oauth.ts` — NEW. Hono sub-router exporting `oauthRoutes` with POST /start and GET /status handlers, PendingSession Map, ensurePortFree() probe, Promise-resolver URL capture, background loginAnthropic promise with storeOAuthTokens persistence
- `src/server/index.ts` — MODIFIED. Added `import { oauthRoutes }` and `app.route("/api/auth/oauth", oauthRoutes)` mount line

## Decisions Made
- **Promise-resolver + rejectAuthUrl safety:** onAuth callback resolves the authUrl promise; the `.catch()` on loginAnthropic calls `rejectAuthUrl` to unblock the route handler if loginAnthropic rejects before onAuth fires (e.g., PKCE generation failure). Without this, the route would hang forever.
- **Auto-clear on done/error in GET /status:** First poll after completion returns the terminal state then deletes the session entry. Phase 5's `/api/auth/status` is the authoritative post-completion source.
- **Session identity guard:** `pendingSessions.get(provider) === session` before mutating `session.status` — prevents a stale (aborted) session from overwriting a fresh one when D-03 discards fire.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 06-02 ready: frontend state machine + UX polling loop for /api/auth/oauth/start and /status
- Phase 7 (OpenAI OAuth) can reuse the PendingSession Map pattern — change would be 1) add "openai" branch in POST /start provider check, 2) add port 1455 pre-check, 3) call pi-ai's OpenAI login function (same Promise-resolver pattern)
- Phase 8 (Connection UI) will consume: POST /api/auth/oauth/start → open authUrl in new tab → poll GET /api/auth/oauth/status → on "ok", call existing GET /api/auth/status for authoritative state

**Known limitations (by design per plan):**
- Second POST /start while first is still in-flight silently discards the first (D-03). Recovery = server restart (D-04: cancellation deferred).
- No timeout on in-flight sessions. Long-abandoned sessions accumulate in the Map until next /start for same provider (D-04: timeout deferred).

---
*Phase: 06-anthropic-oauth-flow*
*Completed: 2026-04-05*

## Self-Check: PASSED

- Created files exist: src/server/routes/oauth.ts, 06-01-SUMMARY.md
- Task commits exist: 382312c1 (Task 1), 53ecb769 (Task 2)
