---
phase: 06-anthropic-oauth-flow
plan: 02
subsystem: auth
tags: [oauth, uat, anthropic, validation, pkce]

# Dependency graph
requires:
  - phase: 06-anthropic-oauth-flow
    provides: "POST /api/auth/oauth/start, GET /api/auth/oauth/status, port pre-check, PendingSession Map (from plan 06-01)"
  - phase: 05-credential-infrastructure
    provides: "GET /api/auth/status, credential resolver, OAuth token persistence"
provides:
  - "End-to-end UAT record proving Anthropic OAuth PKCE flow works end-to-end (D-05)"
  - "Empirical proof: SC#1, SC#2, SC#3, SC#4 all PASS — OAuth token accepted by Anthropic API (no Feb 2026 ban observed)"
  - "Documented /api/chat contract: frontend must send `message` / `model` fields (not `messages` / `modelId`)"
affects: [07-openai-oauth-flow, 08-oauth-connection-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual UAT via curl (per D-05 — Phase 8 delivers real UI)"
    - "Port-conflict simulation via nc stand-in listener"

key-files:
  created:
    - ".planning/phases/06-anthropic-oauth-flow/06-UAT.md"
  modified: []

key-decisions:
  - "UAT result: PASS — Anthropic OAuth token accepted for /api/chat (Feb 2026 ban risk did not materialise in practice for this token/endpoint combination)"
  - "Test 3 curl in plan 06-02 was authored with wrong field names; corrected inline — documentation error, not a code bug"

patterns-established:
  - "UAT template scaffold separates automated structure (Task 1) from human execution (Task 2 checkpoint)"

requirements-completed: [OAUTH-01]

# Metrics
duration: 32min
completed: 2026-04-05
---

# Phase 06 Plan 02: Anthropic OAuth Flow UAT Summary

**End-to-end UAT validated the Anthropic OAuth PKCE flow — all four success criteria PASS, including SC#3 (OAuth token accepted by Anthropic API for real chat request)**

## Performance

- **Duration:** 32 min (scaffold 2026-04-05T13:02Z → UAT completion 2026-04-05T13:34Z)
- **Started:** 2026-04-05T13:02Z (Task 1 scaffold)
- **Completed:** 2026-04-05T13:34Z (Task 2 human UAT complete)
- **Tasks:** 2 (scaffold + human execution checkpoint)
- **Files modified:** 1 (06-UAT.md created in Task 1, filled in Task 2)

## Accomplishments
- **SC#1 PASS:** `POST /api/auth/oauth/start` returned HTTP 200 with `authUrl` starting with `https://claude.ai/oauth/authorize` (PKCE params attached)
- **SC#2 PASS:** `GET /api/auth/oauth/status` transitioned pending → ok after browser consent; Phase 5's `/api/auth/status` confirmed `hasOAuth:true`, `activeMethod:"oauth"`
- **SC#3 PASS:** OAuth token was accepted by Anthropic API — real `/api/chat` call streamed assistant content containing "OK" (Feb 2026 `sk-ant-oat*` ban risk flagged in 06-RESEARCH.md Pitfall 1 did NOT materialise for this combination)
- **SC#4 PASS:** Port 53692 occupied by `nc` listener → `/api/auth/oauth/start` returned HTTP 409 with the exact Claude Code CLI conflict message from D-02

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold 06-UAT.md template with SC#1-SC#4 sections and curl commands** — `d0c7cca0` (docs)
2. **Task 2: Human UAT execution — record results, all SCs PASS** — `2605d08a` (test)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `.planning/phases/06-anthropic-oauth-flow/06-UAT.md` — NEW (Task 1), filled in with real UAT results (Task 2). Records status: PASS, executed: 2026-04-05, per-SC outcomes, and the Test 3 curl contract correction note.

## Decisions Made
- **UAT outcome: PASS** — the Anthropic Feb 2026 policy pitfall from 06-RESEARCH.md (rejection of `sk-ant-oat*` tokens for non-Claude-Code apps) did NOT trigger in practice for this flow. The OAuth token issued by `loginAnthropic` successfully called Anthropic's Messages API via pi-agent-core without a policy error.
- **Test 3 curl correction is a documentation/plan-authoring error, not a code bug.** The `/api/chat` endpoint correctly expects `message` / `model` (single message, model id) per `src/server/routes/chat.ts:10`, and the real frontend caller at `src/client/hooks/use-chat.ts:200` already sends those fields. The plan's UAT curl was inconsistent with this contract and was corrected inline during execution.

## Deviations from Plan

None - plan executed exactly as written. The Test 3 curl contract mismatch was a documentation issue in the PLAN.md itself, not an execution deviation; the user corrected the curl inline to match the endpoint's actual contract and recorded the correction in 06-UAT.md under Test 3.

## Issues Encountered
- **Plan 06-02 Test 3 curl was mis-authored** — used `messages` / `modelId` field names, but `/api/chat` expects `message` / `model`. First attempt returned `"No model configured"` because both fields destructured to `undefined`. User corrected the payload and reran; corrected curl passed. Follow-up documented in 06-UAT.md "Follow-up actions".

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Phase 6 COMPLETE** — Anthropic OAuth flow validated end-to-end. All four success criteria PASS.
- **Phase 8 (OAuth Connection UI) is unblocked.** Key contract notes for Phase 8:
  - Frontend should call `POST /api/auth/oauth/start` with `{"provider":"anthropic"}`, open returned `authUrl` in new tab, poll `GET /api/auth/oauth/status?provider=anthropic` until `status:"ok"`, then call `GET /api/auth/status?provider=anthropic` for authoritative credential state.
  - `/api/chat` contract: send `message` (string, single message) + `model` (model id string) + `provider`. Phase 8 UI already aligns with this contract (verified at `src/client/hooks/use-chat.ts:200`) — no change needed.
- **Phase 7 (OpenAI OAuth) can reuse the PendingSession Map pattern** — per 06-01-SUMMARY.md, additions needed are provider="openai" branch + port 1455 pre-check + OpenAI login function call.

**Known risks (unchanged):**
- Phase 7 OpenAI scope may need empirical validation (pi-ai requests `openid profile email offline_access`; Codex may need `model.request`).
- Anthropic Feb 2026 policy risk not triggered today but remains a latent concern for future tokens/endpoints.

---
*Phase: 06-anthropic-oauth-flow*
*Completed: 2026-04-05*

## Self-Check: PASSED

- Created files exist: .planning/phases/06-anthropic-oauth-flow/06-UAT.md, 06-02-SUMMARY.md
- Task commits exist: d0c7cca0 (Task 1 scaffold), 2605d08a (Task 2 UAT results)
