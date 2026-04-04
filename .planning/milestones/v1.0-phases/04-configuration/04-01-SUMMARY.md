---
phase: 04-configuration
plan: 01
subsystem: api
tags: [hono, pi-ai, getModels, harness, agent, systemPrompt, types]

# Dependency graph
requires:
  - phase: 03-tools
    provides: "Working chat with tool visualization, Agent constructor pattern, SSE streaming"
provides:
  - "AgentId, AGENT_CONFIG, ModelInfo types for frontend agent/model selectors"
  - "HarnessFile, HarnessDir, HarnessResult, HarnessState types for harness UI"
  - "GET /api/models endpoint wrapping pi-ai getModels with auth check"
  - "POST /api/harness/load endpoint for directory-based harness discovery"
  - "GET /api/harness/status and POST /api/harness/clear endpoints"
  - "buildSystemPrompt composing harness content into agent system prompt"
  - "createAgent auto-applies active harness when no explicit systemPrompt"
affects: [04-02, 04-03, 04-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [harness-discovery, in-memory-harness-storage, dynamic-system-prompt]

key-files:
  created:
    - src/server/routes/models.ts
    - src/server/routes/harness.ts
    - src/server/agent/harness.ts
  modified:
    - src/client/lib/types.ts
    - src/server/agent/setup.ts
    - src/server/index.ts

key-decisions:
  - "Model list served dynamically from pi-ai getModels, not hardcoded"
  - "Harness stored in-memory with no file watching (D-13)"
  - "createAgent auto-applies active harness to system prompt when no explicit override"

patterns-established:
  - "Harness discovery pattern: read 4 known locations (CLAUDE.md, AGENTS.md, .claude/skills/, .claude/hooks/) from a user-provided directory"
  - "Auth-gated endpoint pattern: return 401 with needsAuth:true for unauthenticated providers"

requirements-completed: [AGENT-02, MODEL-01, MODEL-03, HARN-02, HARN-04]

# Metrics
duration: 3min
completed: 2026-04-04
---

# Phase 04 Plan 01: Backend Types + Models + Harness Summary

**Shared types (AgentId, ModelInfo, HarnessState), models endpoint wrapping pi-ai getModels, harness discovery from directory, and dynamic system prompt injection into createAgent**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-04T10:58:30Z
- **Completed:** 2026-04-04T11:01:24Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added all Phase 4 shared types: AgentId, AGENT_CONFIG, ModelInfo, HarnessFile, HarnessDir, HarnessResult, HarnessState
- Created GET /api/models endpoint that wraps pi-ai getModels with provider validation and auth check (returns 401 with needsAuth:true)
- Created harness discovery module that reads CLAUDE.md, AGENTS.md, .claude/skills/, .claude/hooks/ from any directory with 100KB size limit
- Updated createAgent to auto-apply active harness to system prompt; server registers all 4 route groups

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand types.ts + create models endpoint** - `7a52989b` (feat)
2. **Task 2: Create harness discovery module + harness endpoint** - `57466c4a` (feat)
3. **Task 3: Update createAgent for dynamic systemPrompt + register routes** - `9e242340` (feat)

## Files Created/Modified
- `src/client/lib/types.ts` - Added AgentId, AGENT_CONFIG, ModelInfo, HarnessFile/Dir/Result/State types; updated AppState.harness to HarnessState
- `src/server/routes/models.ts` - GET /api/models wrapping pi-ai getModels with auth check
- `src/server/agent/harness.ts` - discoverHarness reads 4 known locations; buildSystemPrompt composes harness into prompt
- `src/server/routes/harness.ts` - POST /load, GET /status, POST /clear with in-memory storage
- `src/server/agent/setup.ts` - Optional systemPrompt param; auto-applies active harness
- `src/server/index.ts` - Registers /api/models and /api/harness route groups

## Decisions Made
- Model list served dynamically from pi-ai getModels, not hardcoded (per D-04)
- Harness stored in-memory with no file watching (per D-13)
- createAgent auto-applies active harness to system prompt when no explicit override given
- Codex maps to "openai" provider (per D-11), not "openai-codex" which requires OAuth

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all types are fully defined and all endpoints are functional.

## Next Phase Readiness
- All backend API surface for Phase 4 is complete
- Frontend plans (04-02, 04-03, 04-04) can now build agent selector, model selector, and harness loader UI
- Types are shared and ready for frontend consumption

## Self-Check: PASSED

- All 7 files verified present
- All 3 task commits verified in git log (7a52989b, 57466c4a, 9e242340)

---
*Phase: 04-configuration*
*Completed: 2026-04-04*
