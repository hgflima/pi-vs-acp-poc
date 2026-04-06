---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: OAuth Authentication
status: verifying
stopped_at: "Completed 07.1-01-error-surfacing-PLAN.md (D-03 shipped, SC#3 Outcome 3 escalation)"
last_updated: "2026-04-06T06:48:13.492Z"
last_activity: 2026-04-06
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 11
  completed_plans: 10
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Provar que pi-ai + pi-agent-core sustentam um chat web com streaming em tempo real, tool calls visiveis e troca de agentes
**Current focus:** Phase 07 — openai-oauth-flow

## Current Position

Phase: 07 (openai-oauth-flow) — BLOCKED
Plan: 4 of 4 (07-04 gap closure executed; SC#3 still FAIL post-fix)
Status: Phase complete — ready for verification
Last activity: 2026-04-06

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 18 (v1.0)
- Average duration: carried from v1.0
- Total execution time: carried from v1.0

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 5. Credential Infrastructure | 0 | - | - |
| 6. Anthropic OAuth Flow | 0 | - | - |
| 7. OpenAI OAuth Flow | 0 | - | - |
| 8. OAuth Connection UI | 0 | - | - |

*Updated after each plan completion*
| Phase 05 P01 | 4min | 3 tasks | 4 files |
| Phase 05-credential-infrastructure P02 | 8min | 3 tasks | 2 files |
| Phase 05 P03 | 10 min | 5 tasks | 5 files |
| Phase 06-anthropic-oauth-flow P01 | 2 min | 2 tasks | 2 files |
| Phase 06-anthropic-oauth-flow P02 | 32 min | 2 tasks | 1 files |
| Phase 07-openai-oauth-flow P01 | 2min | 3 tasks | 3 files |
| Phase 07-openai-oauth-flow P02 | 3 min | 2 tasks | 1 files |
| Phase 07-openai-oauth-flow P03 | 45min | 2 tasks | 1 files |
| Phase 07-openai-oauth-flow P04 | 75min | 3 tasks | 3 files |
| Phase 07.1 P01 | 4min | 2 tasks | 2 files |

## Accumulated Context

### Roadmap Evolution

- Phase 7.1 inserted after Phase 7: solucao do problema encontrado e documentado na fase 7 (URGENT)

### Decisions

All v1.0 decisions logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.1 Roadmap]: Anthropic OAuth included despite research flagging potential ban — user decision to implement regardless.
- [v1.1 Roadmap]: Anthropic OAuth prioritized as Phase 6 (before OpenAI Phase 7) per user request.
- [v1.1 Roadmap]: OpenAI OAuth scope (model.request) needs empirical validation in Phase 7 — cannot confirm from docs alone.
- [Phase 05]: Plan 05-01: OAuth takes priority over API Key when both credentials exist for a provider (D-01)
- [Phase 05]: Plan 05-01: Credential store exposes per-type clearing (clearByType) with auto-cleanup when both become null
- [Phase 05]: Plan 05-01: createAgent signature change deferred to Plan 02 via transitional @ts-expect-error in chat.ts
- [Phase 05]: Plan 05-03: Per-provider frontend auth state via Map<Provider, ProviderAuthState> (D-06) — Anthropic and OpenAI independent
- [Phase 05]: Plan 05-03: authMethod field on ProviderAuthState (D-05) prepares Phase 8 UI-03 token health badges
- [Phase 05]: Plan 05-03: refreshStatus swallows network errors to preserve known-connected state across transient blips
- [Phase 05-credential-infrastructure]: Plan 05-02: D-03 realized — createAgent owns credential resolution (callers pass only provider/modelId)
- [Phase 05-credential-infrastructure]: Plan 05-02: D-04 realized — OAuth refresh happens inline in async getApiKey callback (pi-agent-core awaits it)
- [Phase 05-credential-infrastructure]: Plan 05-02: Per-provider refresh mutex via Map<Provider, Promise> prevents single-use refresh token reuse
- [Phase 05-credential-infrastructure]: Plan 05-02: 60s refresh-ahead buffer (REFRESH_BUFFER_MS) triggers refresh before expiry, avoiding mid-stream failures
- [Phase 06-anthropic-oauth-flow]: Plan 06-01: Promise-resolver with rejectAuthUrl safety handles loginAnthropic rejection before onAuth fires
- [Phase 06-anthropic-oauth-flow]: Plan 06-01: GET /status auto-clears session on done/error (Phase 5's /api/auth/status is authoritative post-completion)
- [Phase 06-anthropic-oauth-flow]: Plan 06-01: D-02 realized — port 53692 pre-check returns HTTP 409 with Claude Code CLI conflict message
- [Phase 06-anthropic-oauth-flow]: Plan 06-02: UAT PASS — Anthropic OAuth token accepted by /api/chat; Feb 2026 sk-ant-oat ban risk did NOT materialise in practice
- [Phase 06-anthropic-oauth-flow]: Plan 06-02: /api/chat contract confirmed — expects message/model fields (not messages/modelId); Test 3 plan curl corrected inline
- [Phase 07-openai-oauth-flow]: Plan 07-01: resolvePiProvider centralizes pi-ai call-site routing (D-01) — Provider type stays 'anthropic' | 'openai' while backend internally remaps to 'openai-codex' when OAuth active
- [Phase 07-openai-oauth-flow]: Plan 07-01: forceExpireOAuth lives in credentials.ts (touches store internal state), always enabled (D-07) — no NODE_ENV gate per POC local-only philosophy
- [Phase 07-openai-oauth-flow]: Plan 07-01: 'as any' cast on modelId removed from setup.ts once PiProvider type aligned with pi-ai's KnownProvider
- [Phase 07-openai-oauth-flow]: Plan 07-02: Provider-dispatch via typed helper functions (portForProvider, loginFnForProvider, portConflictMessage) instead of inline ternaries — single-responsibility branch points keep /start handler readable
- [Phase 07-openai-oauth-flow]: Plan 07-02: D-04 onManualCodeInput NOT wired for openai — web UI has no CLI paste path; port 1455 pre-check prevents loginOpenAICodex from falling back to manual flow
- [Phase 07-openai-oauth-flow]: Plan 07-02: Debug endpoint colocated in oauth.ts (not separate /debug router) — scoped under /api/auth/oauth/debug/* inheriting existing mount
- [Phase 07-openai-oauth-flow]: Plan 07-03 UAT FAIL — SC#1/SC#2/SC#5 PASS, D-01/D-02 remap confirmed live (Codex models in /api/models), but SC#3 chat stream emits only event:done with zero content. Not Pitfall 2 (no scope error). Gap routed to Phase 7.1 debug: adaptAgentEvents event subscription for openai-codex provider.
- [Phase 07-openai-oauth-flow]: Plan 07-03 UAT triage heuristic: silent-but-clean SSE stream (event:done with no text_delta) is FAIL (plumbing), not BLOCKED (policy). Scope rejections surface as error events — absence of error means downstream stream-adapter gap.
- [Phase 07-openai-oauth-flow]: Plan 07-04 diagnose-first confirmed Cause B: pi-agent-core Agent loop emits ZERO message_update events for openai-codex responses. Captured 8-event sequence: agent_start → turn_start → message_start → message_end → message_start → message_end → turn_end → agent_end. Second message_start/message_end pair is the !addedPartial fallback (agent-loop.js 201-203/214-216). Cause A and Cause C ruled out empirically.
- [Phase 07-openai-oauth-flow]: Plan 07-04 exhaustive switch on AssistantMessageEvent.type applied to stream-adapter.ts — defensive, not curative. Fixes a future class of silent fall-through bugs but does NOT resolve the current upstream gap. Re-verification shows SC#3 still FAIL with identical symptom. Phase 7 remains blocked pending Phase 7.2 upstream investigation in pi-ai/pi-agent-core.
- [Phase 07-openai-oauth-flow]: Plan 07-04 DEBUG_EVENTS flag retained in source (gated const false) — provides quick re-enable path for Phase 7.2 diagnostic logging without re-scaffolding.
- [Phase 07.1]: D-03 implemented: case 'message_end' in stream-adapter.ts emits SSE event:error when stopReason==='error' && errorMessage present. Permanent fix (not debug-gated). Closes the silent error-dropping gap from Phase 07-04.
- [Phase 07.1]: SC#3 diagnostic classified Outcome 3 (escalation): OAuth credentials unavailable in worktree, D-02 decision tree handoff to Plan 07.1-02 with live browser consent requirement.

### Pending Todos

None.

### Blockers/Concerns

- Phase 6 risk: OpenAI OAuth scope may be insufficient (pi-ai requests `openid profile email offline_access` but Codex API may require `model.request`). Must validate empirically with live test.
- Port 1455 is hardcoded by pi-ai for OpenAI OAuth callback; conflicts with Codex CLI if running simultaneously.
- Phase 7 SC#3 UPSTREAM gap (post-Plan-07-04): Root cause confirmed as Cause B — pi-agent-core Agent loop emits zero message_update events for openai-codex responses (falls through to !addedPartial path). Our stream-adapter defensive fix (exhaustive switch) did NOT resolve the symptom. Gap is upstream of our code, in pi-ai's openai-codex-responses provider or pi-agent-core's message_update emission logic. Blocks Phase 7 closure and Phase 8 chat wiring for OpenAI. Phase 7.2 required to patch pi-ai locally or write a provider-specific event normalizer in the POC.

## Session Continuity

Last session: 2026-04-06T06:48:13.489Z
Stopped at: Completed 07.1-01-error-surfacing-PLAN.md (D-03 shipped, SC#3 Outcome 3 escalation)
Resume file: None
