# Phase 6: Anthropic OAuth Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 06-anthropic-oauth-flow
**Areas discussed:** Session state model, Port 53692 conflict UX, Flow lifecycle (cancel/timeout), SC#3 verification approach

---

## Session state model

| Option | Description | Selected |
|--------|-------------|----------|
| Per-provider Map (Recommended) | Map<Provider, PendingSession>. Phase 7 adds OpenAI without refactor. User could start Anthropic and OpenAI in parallel in the future. | ✓ |
| Single global | let pendingOAuth: Session \| null. Simple, one at a time. Phase 7 would need refactor to Map. Matches research/ARCHITECTURE.md draft. | |
| Session ID keyed | Each /start returns an ID; frontend passes ID on /status. Overkill for single-user POC. | |

**User's choice:** Per-provider Map (Recommended)
**Notes:** Forward-compat with Phase 7 was the deciding factor.

---

## Port 53692 conflict detection

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-check before loginAnthropic (Recommended) | Bind throwaway server on 53692 first; fail fast with 409 before opening browser. | ✓ |
| Reactive: catch EADDRINUSE | Let loginAnthropic throw, catch in promise, translate via /status. | |
| Both: pre-check + catch fallback | Belt-and-suspenders. | |

**User's choice:** Pre-check before loginAnthropic (Recommended)
**Notes:** UX priority — user should see error before loading state starts.

## Port conflict error message text

| Option | Description | Selected |
|--------|-------------|----------|
| Specific with probable cause (Recommended) | Mentions Claude Code CLI by name; tells user to stop it and try again. | ✓ |
| Generic technical only | "Port 53692 is unavailable. Close other applications using this port and retry." | |
| Claude-aware + help link | Specific + lists other apps + suggests `lsof -i :53692`. | |

**User's choice:** Specific with probable cause (Recommended)
**Notes:** Claude Code CLI is the most likely collision for this project's author.

---

## Restart behavior when session already pending

| Option | Description | Selected |
|--------|-------------|----------|
| Second /start aborts the first (Recommended) | Discard previous promise, clear slot, start fresh. Natural retry UX. | ✓ |
| Second /start returns 409 conflict | Blocks; requires explicit cancel button on frontend. | |
| Second /start returns existing auth URL | Idempotent; may reuse stale PKCE verifier. | |

**User's choice:** Second /start aborts the first (Recommended)
**Notes:** Retry without extra endpoints.

## Timeout policy

| Option | Description | Selected |
|--------|-------------|----------|
| No timeout, no cancel (Recommended) | User retries via new /start; server restart clears state. Matches POC philosophy. | ✓ |
| 5-minute timeout | Auto-cleanup to prevent leaks; extra complexity. | |
| Timeout + DELETE /cancel | Most complete; extra code for Phase 8 to wire up later if needed. | |

**User's choice:** No timeout, no cancel (Recommended)
**Notes:** Matches single-user POC philosophy (accept server restart as recovery path).

---

## SC#3 verification approach

| Option | Description | Selected |
|--------|-------------|----------|
| Manual UAT via curl (Recommended) | POST /api/chat after OAuth completes; uses existing chat route; documented in 06-UAT.md. | ✓ |
| Automated smoke test post-storage | Backend fires streamSimple right after storeOAuthTokens; surfaces verified: true on /status. | |
| Defer verification to first real call | /status reports ok on storage; failure surfaces only on first real /chat call. | |

**User's choice:** Manual UAT via curl (Recommended)
**Notes:** Zero extra code, re-uses existing /chat route. Phase 8 will deliver the real UI; Phase 6 only needs to prove plumbing.

---

## Claude's Discretion

- Route path structure (/api/auth/oauth/start vs /api/oauth/start)
- Exact JSON response shape for /start and /status
- Internal PendingSession TypeScript type
- /status auto-clear semantics (first-read vs persistent)
- onPrompt / onManualCodeInput callbacks for loginAnthropic (web context has no CLI prompt path)
- Logging strategy for onProgress messages

## Deferred Ideas

- Branded custom callback HTML page — OAUTH-06
- Logout/revoke OAuth token per provider — OAUTH-05
- DELETE /oauth/cancel endpoint — revisit in Phase 8 if needed
- 5-minute session timeout with automatic cleanup
- SSE-based status updates instead of polling
