---
phase: 07-openai-oauth-flow
plan: 04
subsystem: auth
tags: [oauth, pi-ai, pi-agent-core, openai-codex, sse, streaming, gap-closure, defensive-fix, upstream-blocker]

# Dependency graph
requires:
  - phase: 05-credential-infrastructure
    provides: "storeOAuthTokens, resolveCredential (async getApiKey with refresh mutex)"
  - phase: 06-anthropic-oauth-flow
    provides: "stream-adapter.ts baseline (text_delta, thinking_delta, tool events, done)"
  - plan: 07-01
    provides: "resolvePiProvider remap + forceExpireOAuth helpers"
  - plan: 07-02
    provides: "POST /api/auth/oauth/start (openai), POST /debug/force-expire"
  - plan: 07-03
    provides: "07-UAT.md with FAIL outcome (SC#3 silent stream, SC#4 skipped)"
provides:
  - "Diagnostic log .planning/debug/stream-events-07-04.log — captured 8 events from live Codex chat request, proves ZERO message_update events emitted by pi-agent-core for openai-codex responses"
  - "Exhaustive switch on AssistantMessageEvent.type in src/server/lib/stream-adapter.ts — all 12 subtypes handled (text_delta, thinking_delta, error + 9 lifecycle no-ops), fall-through structurally impossible"
  - "Empirical confirmation that gap is UPSTREAM of stream-adapter (in pi-agent-core / pi-ai openai-codex-responses provider), not in our adapter"
  - "Re-verification section appended to 07-UAT.md documenting SC#3 FAIL post-fix (same symptom) + SC#4 SKIPPED"
affects: [07.2-upstream-investigation, 08-oauth-connection-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diagnose-before-fix for symptom-ambiguous bugs: capture real event stream to log file, confirm hypothesis empirically, THEN apply targeted fix"
    - "Defensive vs curative fix distinction: exhaustive switch eliminates a CLASS of silent-failure (fall-through) even if the current symptom's root cause is upstream"

key-files:
  created:
    - .planning/debug/stream-events-07-04.log
  modified:
    - src/server/lib/stream-adapter.ts
    - .planning/phases/07-openai-oauth-flow/07-UAT.md

key-decisions:
  - "Root cause is Cause B (pi-agent-core emits zero message_update for Codex), confirmed by diagnostic log — NOT Cause A (switch mismatch) or Cause C (upstream HTTP denial). Stream-adapter fix is defensive-only for the current symptom."
  - "Applied the switch exhaustiveness fix anyway (commit 589b292a) — it prevents a future class of bug (silent fall-through on new AssistantMessageEvent subtypes) and improves code readability. Correctness stands regardless of upstream behavior."
  - "Phase 7 remains BLOCKED after 07-04 — OAUTH-02 and OAUTH-03 stay incomplete. Next step is Phase 7.2: investigate pi-ai openai-codex-responses provider stream behavior (why it does not emit text_delta through the pi-agent-core event bus)."
  - "DEBUG_EVENTS flag left in source gated to false (const boolean) — provides quick diagnostic re-enable path for Phase 7.2 without re-authoring logging scaffolding."

patterns-established:
  - "Gap closure plan structure: Task 1 diagnose → Task 2 targeted fix → Task 3 human re-verify with UAT update-in-place. Avoids speculative fixes on multi-hypothesis bugs."
  - "Re-verification section in UAT: append `## Re-verification (Phase X.Y gap closure)` AFTER original Final Outcome (keep original as historical record), update frontmatter status only if overall changes to PASS."

requirements-completed: []  # OAUTH-02 and OAUTH-03 still NOT verified end-to-end — SC#3 still FAILs post-fix. Requirements will be marked complete only after Phase 7.2 lands SC#3 green.

# Metrics
duration: ~75min
completed: 2026-04-05
---

# Phase 7 Plan 04: Stream Adapter Gap Closure Summary

**Gap closure executed: Cause B confirmed empirically (pi-agent-core emits zero `message_update` events for openai-codex responses). Defensive exhaustive-switch fix applied to `stream-adapter.ts` (correctness improvement, NOT curative). SC#3 still FAILs post-fix — gap is upstream of our adapter. Phase 7 remains blocked pending Phase 7.2 upstream investigation.**

## Performance

- **Duration:** ~75 min (Task 1 diagnose ~25min, Task 2 fix ~10min, Task 3 re-verify ~40min including backend restart + port cleanup + OAuth re-consent)
- **Started:** 2026-04-05T18:30:00Z (Task 1 diagnostic logging added)
- **Completed:** 2026-04-05T19:09:08Z (Task 3 re-verification recorded, UAT updated in place)
- **Tasks:** 3 (Task 1 diagnose — autonomous, Task 2 fix — autonomous, Task 3 re-verify — human-verify checkpoint)
- **Files created:** 2 (07-04-SUMMARY.md, .planning/debug/stream-events-07-04.log)
- **Files modified:** 2 (src/server/lib/stream-adapter.ts, 07-UAT.md re-verification section)

## Accomplishments

- **Root cause identified empirically (Task 1 — commit `f5b3bd69`):** Added `DEBUG_EVENTS=true` flag + `logEvent()` helper to `adaptAgentEvents`; fired live POST /api/chat with `provider=openai, model=gpt-5.1`; captured 8-event sequence to `.planning/debug/stream-events-07-04.log`. Confirmed **Cause B**: pi-agent-core Agent loop emits ZERO `message_update` events for openai-codex responses. Captured sequence: `agent_start → turn_start → message_start → message_end → message_start → message_end → turn_end → agent_end`.
- **Cause A and Cause C ruled out:** No `message_update` event reached the switch (so it cannot be missing a subtype match — Cause A). No error event or HTTP 4xx/5xx surfaced (so it is not upstream denial — Cause C). The second `message_start/message_end` pair is the assistant response via pi-agent-core's `!addedPartial` fallback path (agent-loop.js lines 201-203/214-216), which fires when pi-ai's stream produces no events that set `partialMessage`.
- **Exhaustive switch applied (Task 2 — commit `589b292a`):** Replaced `if (ame.type === "text_delta")` with exhaustive `switch (ame.type)` covering all 12 AssistantMessageEvent subtypes from pi-ai types.d.ts. `text_delta` still writes SSE event:`text_delta` data:{data:ame.delta} (unchanged contract). `thinking_delta` now writes SSE event:`thinking_delta` for reasoning visibility. `error` writes SSE event:`error`. Nine lifecycle events (start, text_start, text_end, thinking_start, thinking_end, thinking_signature, tool_use_start, tool_use_delta, tool_use_end) are explicit no-ops with comments. Silent fall-through is structurally impossible.
- **DEBUG_EVENTS gated off:** Flag left at `const DEBUG_EVENTS = false` — provides quick diagnostic re-enable path for Phase 7.2 without re-scaffolding logging.
- **Re-verification executed (Task 3):** Backend restarted (tsx watch hot reload lost OAuth state); stale port 1455 listener killed (lingering pi-ai OAuth callback from prior session); OAuth re-consent completed; SC#3 curl re-run. **SC#3 still FAIL** — identical symptom: 3-line SSE output with only `event: done` + `data: {}`, zero text_delta events. **SC#4 SKIPPED** (depends on SC#3). Result confirms gap is upstream of stream-adapter.

## Task Commits

1. **Task 1: Add diagnostic logging, capture Codex event stream** — `f5b3bd69` (feat)
2. **Task 2: Exhaustive switch on ame.type, gate DEBUG_EVENTS off** — `589b292a` (fix)
3. **Task 3: Re-verify SC#3+SC#4, update 07-UAT.md in place** — pending (this commit)

**Plan metadata commit:** pending (this SUMMARY.md + STATE.md + ROADMAP.md + previously-untracked 07-VERIFICATION.md + 07-UI-SPEC.md)

## Files Created/Modified

- **Created** `.planning/debug/stream-events-07-04.log` — 44-line diagnostic log: 8-event captured sequence + analysis section proving Cause B. Artifact for Phase 7.2 investigation.
- **Modified** `src/server/lib/stream-adapter.ts` — exhaustive switch on ame.type; DEBUG_EVENTS flag (gated off); logEvent helper retained for Phase 7.2 re-enable.
- **Modified** `.planning/phases/07-openai-oauth-flow/07-UAT.md` — appended `## Re-verification (Phase 7.1 gap closure)` section after original Final Outcome. Documents post-fix SC#3 FAIL, SC#4 SKIPPED, updated outcome breakdown, Phase 7 STILL BLOCKED. Frontmatter `status: FAIL` preserved (overall did not change).

## Decisions Made

- **Diagnose-first on Cause B finding:** Verified the three root-cause hypotheses empirically BEFORE applying a fix, per 07-VERIFICATION.md requirement. Avoided speculative fix that would have masked the real (upstream) gap.
- **Applied switch-exhaustiveness fix despite defensive-only nature:** Correctness improvement stands regardless of which Cause is active — prevents a FUTURE class of silent failures on new AssistantMessageEvent subtypes. Do not ship incomplete switches on discriminated unions.
- **Kept DEBUG_EVENTS flag in source (gated off):** Phase 7.2 will need to re-enable diagnostic logging in stream-adapter AND add similar logging in pi-agent-core / pi-ai to trace where the message_update emission fails. Leaving the flag avoids re-scaffolding.
- **Overall outcome stays FAIL:** Did NOT change frontmatter `status: FAIL` → `status: PASS` in 07-UAT.md because post-fix SC#3 still FAILs. Overall verdict unchanged; gap remains open.

## Remaining Gap (Phase 7.2 — upstream investigation)

**Symptom persists post-fix:** `POST /api/chat` with Codex models returns HTTP 200, opens SSE stream, emits single `event: done` + `data: {}`, closes. Zero `text_delta` events. Same as original 07-03 UAT.

**Root cause (confirmed):** pi-agent-core's Agent loop does NOT emit `message_update` events for openai-codex responses. The fallback `!addedPartial` path (agent-loop.js lines 201-203/214-216) synthesizes a message via `message_start/message_end` only — no delta stream.

**Open question for Phase 7.2:** Why does pi-ai's `openai-codex-responses` provider NOT trigger pi-agent-core's `partialMessage` assignment path? Possible sub-causes (for Phase 7.2 to triage):
1. pi-ai's openai-codex-responses provider returns a non-streaming response shape (chatgpt.com/backend-api may not support SSE for this endpoint), and pi-agent-core's per-chunk `partialMessage` update is not triggered.
2. pi-ai streams but uses a different internal event shape that pi-agent-core's `run()` loop does not recognize — a version mismatch between pi-ai's openai-codex-responses output and pi-agent-core's handler.
3. Codex-specific response format (reasoning tokens? tool invocations only?) bypasses the text-stream code path entirely.

**Phase 7.2 recommended scope:**
- Re-enable `DEBUG_EVENTS=true` in stream-adapter to confirm the 8-event signature reproduces
- Add event logging inside pi-agent-core's `run()` loop (`node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js` — read-only inspection first)
- Add request logging inside pi-ai's openai-codex-responses provider to capture the raw HTTP response from chatgpt.com/backend-api
- Compare Codex response body shape vs standard OpenAI chat completions SSE format
- Decide: patch pi-ai locally (submit upstream issue/PR), OR write a provider-specific adapter in this POC that normalizes Codex responses into the expected pi-agent-core event shape

**Phase 8 impact:** UI Connection work for OpenAI (login button, status polling, port-conflict surfacing) can proceed in parallel since SC#1/SC#2/SC#5 remain green. Chat wiring for OpenAI must wait for Phase 7.2.

## Notes for Phase 8 UI (carried forward from 07-03)

No change from 07-03-SUMMARY.md. TTL display, refresh-state indicator, and chat-disabled state for OpenAI until 7.2 green — all still apply.

## Deviations from Plan

### Environment Issues (not code changes)

**1. Backend lost OAuth state on tsx watch reload**
- **Found during:** Task 3 preparation (after Task 2 commit)
- **Issue:** tsx watch hot-reloaded when stream-adapter.ts changed in Task 2. In-memory credential store (Phase 5 design) lost the OAuth token.
- **Fix:** Re-ran `POST /api/auth/oauth/start`, user completed fresh browser consent, credential re-stored. Normal POC behavior, not a bug.
- **Time cost:** ~5 min

**2. Port 1455 held by stale pi-ai OAuth callback listener**
- **Found during:** Task 3 preparation (re-consent flow)
- **Issue:** A pi-ai OAuth callback listener from the prior (Task 1) session was still bound to 127.0.0.1:1455, blocking fresh `POST /start` with HTTP 409. pi-ai does NOT auto-cleanup the callback server after token exchange completes.
- **Fix:** Killed stale listener PID (`kill 79765`), which unexpectedly cascaded to killing the backend process itself (parent-child process tree). Restarted backend via `npm run dev:backend` in background.
- **Time cost:** ~5 min
- **Follow-up:** Consider filing upstream issue with pi-mono — pi-ai should close its OAuth callback listener after the token exchange completes, or expose a cleanup hook.

**Total deviations:** 2 environmental (zero code changes beyond the planned fix)
**Impact on plan:** Neither affected the diagnostic or fix. Both are normal POC-ergonomics issues; added ~10min to Task 3 execution time.

## Issues Encountered

- **rtk token-killer filtered curl JSON responses** (non-blocking): The `rtk` proxy auto-filter showed JSON schema types (e.g., `{authUrl: string[402], provider: string, status: string}`) instead of actual JSON content. Worked around with `rtk proxy curl ...` to bypass filtering. Normal RTK behavior.

## User Setup Required

None — same OAuth flow as Phase 7 Plan 03 (live Codex OAuth via browser consent).

## Known Stubs

None. All placeholders in 07-UAT.md Re-verification section are filled with real values. DEBUG_EVENTS gating is not a stub — it is intentional instrumentation for Phase 7.2.

## Next Phase Readiness

- **Phase 7 NOT complete** — OAUTH-02 and OAUTH-03 remain un-verified. SC#3 FAIL persists post-fix.
- **Phase 7.2 required** — upstream investigation in pi-ai / pi-agent-core. Scope outlined above.
- **Phase 8 UI work can proceed for connection flow** (SC#1/SC#2/SC#5 green) but NOT for chat wiring on OpenAI.
- **Anthropic OAuth path unaffected** — Phase 6 chat wiring still works; fix is additive (switch exhaustiveness).

## Self-Check: PASSED

**Files verified:**
- FOUND: `src/server/lib/stream-adapter.ts` (exhaustive switch applied, DEBUG_EVENTS=false gated)
- FOUND: `.planning/debug/stream-events-07-04.log` (44 lines, 8-event sequence + analysis)
- FOUND: `.planning/phases/07-openai-oauth-flow/07-UAT.md` (Re-verification section appended, 282 lines total)
- FOUND: `.planning/phases/07-openai-oauth-flow/07-04-SUMMARY.md` (this file)

**Commits verified:**
- FOUND: `f5b3bd69` (Task 1 — diagnostic logging + captured log)
- FOUND: `589b292a` (Task 2 — exhaustive switch + gate DEBUG_EVENTS)
- PENDING: Task 3 commit (07-UAT.md re-verification + this SUMMARY + STATE/ROADMAP)

**Outcome recorded:** 07-UAT.md frontmatter `status: FAIL` preserved (correct — overall unchanged); Re-verification section explicit about SC#3 FAIL post-fix.

---
*Phase: 07-openai-oauth-flow*
*Plan 04: Stream Adapter Gap Closure*
*Completed: 2026-04-05 (with SC#3 still FAIL — Phase 7 still blocked, Phase 7.2 needed)*
