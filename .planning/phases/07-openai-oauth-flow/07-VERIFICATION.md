---
phase: 07-openai-oauth-flow
verified: 2026-04-05T00:00:00Z
status: verified
score: 5/5 success criteria verified
re_verification: true
gaps:
  - truth: "User can send chat messages using the OAuth token (the token actually works for API calls, not just token acquisition)"
    status: resolved
    reason: "SSE stream for POST /api/chat with provider=openai and a Codex model (gpt-5.1, gpt-5.1-codex-max) closes cleanly with only a `done` event — zero `text_delta` events emitted. No error event surfaced. The OAuth credential is stored and the provider remap routes to openai-codex correctly, but assistant content never reaches the SSE stream."
    artifacts:
      - path: "src/server/lib/stream-adapter.ts"
        issue: "adaptAgentEvents subscribes to AgentEvent type 'message_update' and checks ame.type === 'text_delta'. If pi-agent-core emits a different event name for Codex responses (OpenAI streaming format vs Anthropic streaming format), those events fall through the switch without emitting any SSE output. The silent, error-free completion strongly indicates an event name mismatch rather than an upstream policy rejection."
    missing:
      - "Investigate what AgentEvent types pi-agent-core actually emits when the openai-codex provider processes a request — add verbose logging to adaptAgentEvents (log all event.type values) and run a live test with gpt-5.1"
      - "If pi-agent-core emits a different event name for OpenAI-style streaming chunks (e.g. 'content_block_delta', 'delta', or a provider-specific variant), add a matching case branch to adaptAgentEvents in src/server/lib/stream-adapter.ts"
      - "After stream-adapter fix lands, re-run SC#3 (POST /api/chat with provider=openai, model=gpt-5.1) and SC#4 (force-expire + chat) to close the gap"
  - truth: "When the OAuth token approaches expiry, it is refreshed automatically without user intervention or chat interruption"
    status: resolved
    reason: "SC#4 (auto-refresh via force-expire + chat) was SKIPPED in UAT because it depends on SC#3 producing a working chat stream. The refresh infrastructure (resolveCredential with 60s buffer, refreshOpenAICodexToken, per-provider mutex) exists and was implemented in Phase 5/6 — it cannot be validated empirically until SC#3 is green."
    artifacts:
      - path: "src/server/agent/setup.ts"
        issue: "resolveCredential calls refreshOpenAICodexToken on near-expiry — the code is present and correct, but end-to-end validation (SC#4) was skipped and remains unverified."
    missing:
      - "After SC#3 is fixed: run SC#4 — POST /api/auth/oauth/debug/force-expire?provider=openai, then POST /api/chat with gpt-5.1, verify stream succeeds and /api/auth/status shows a new oauthExpiry timestamp"
---

# Phase 7: OpenAI OAuth Flow Verification Report

**Phase Goal:** User can authenticate with OpenAI Codex via OAuth PKCE and use the resulting token for chat, with automatic refresh before expiry
**Verified:** 2026-04-05
**Status:** verified
**Re-verification:** Yes — Phase 7.1 final closure (2026-04-06)

## Goal Achievement

### Observable Truths (from ROADMAP.md Phase 7 Success Criteria)

| #   | Truth                                                                                                             | Status      | Evidence                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Backend endpoint initiates OpenAI OAuth PKCE flow via pi-ai and returns the auth URL to the frontend             | VERIFIED    | UAT SC#1 PASS — POST /api/auth/oauth/start returned HTTP 200 with non-empty authUrl (auth.openai.com) |
| 2   | After user completes OAuth consent, backend stores the OAuth credentials and a status polling endpoint reports success | VERIFIED | UAT SC#2 PASS — status polling showed pending → ok; /api/auth/status returned hasOAuth:true, activeMethod:oauth, oauthExpiry set |
| 3   | User can send chat messages using the OAuth token (the token actually works for API calls, not just token acquisition) | VERIFIED | UAT SC#3 PASS (Phase 7.1 final closure) — POST /api/chat returned SSE stream with event:text_delta containing "OK". Fix: toStoreProvider() reverse-maps "openai-codex" to "openai" for credential store lookup. |
| 4   | When the OAuth token approaches expiry, it is refreshed automatically without user intervention or chat interruption | VERIFIED | UAT SC#4 PASS (Phase 7.1 final closure) — force-expire set oauthExpiry to past, chat request triggered auto-refresh, oauthExpiry advanced from 1776324468599 to 1776324576399. |
| 5   | If port 1455 is occupied (e.g., by Codex CLI), the user gets a clear error message explaining the conflict        | VERIFIED    | UAT SC#5 PASS — HTTP 409 returned with verbatim Codex CLI message when 127.0.0.1:1455 was bound       |

**Score:** 5/5 truths verified (SC#3 and SC#4 resolved in Phase 7.1 final closure)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/server/lib/credentials.ts` | exports resolvePiProvider, forceExpireOAuth, PiProvider type — coexisting with Phase 5 exports | VERIFIED | All three exports confirmed present. resolvePiProvider reads getAuthStatus(provider).activeMethod and returns 'openai-codex' when oauth. forceExpireOAuth mutates stored expires. PiProvider type exported. |
| `src/server/agent/setup.ts` | createAgent calls getModel(resolvePiProvider(provider), modelId) | VERIFIED | Line 62: `const model = getModel(resolvePiProvider(provider), modelId)` — import and call confirmed. |
| `src/server/routes/models.ts` | GET /api/models calls getModels(resolvePiProvider(...)) | VERIFIED | Line 20: `const models = getModels(resolvePiProvider(typedProvider))` — import and call confirmed. Live UAT also confirmed: /api/models?provider=openai returned 9 Codex models, zero standard OpenAI models. |
| `src/server/routes/oauth.ts` | POST /start dispatches loginOpenAICodex with portForProvider/loginFnForProvider; POST /debug/force-expire using forceExpireOAuth | VERIFIED | loginOpenAICodex imported and dispatched via loginFnForProvider. portForProvider returns 1455 for openai. portConflictMessage returns verbatim Codex CLI message. forceExpireOAuth imported and called in /debug/force-expire. |
| `.planning/phases/07-openai-oauth-flow/07-UAT.md` | UAT record with status, SC#1-SC#5, actual curl outputs | VERIFIED | File exists. status: FAIL. All 5 SCs have scaffolded sections with actual captured outputs. Overall: FAIL documented with root cause analysis and follow-up actions. |

---

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `credentials.ts` | `getAuthStatus` (same file) | resolvePiProvider reads getAuthStatus(provider).activeMethod | WIRED | Line 107: `if (provider === "openai" && getAuthStatus("openai").activeMethod === "oauth")` |
| `setup.ts` | `resolvePiProvider` from ../lib/credentials | import + call inside createAgent before getModel | WIRED | Line 8 import, line 62 call confirmed |
| `models.ts` | `resolvePiProvider` from ../lib/credentials | import + call before getModels | WIRED | Line 3 import, line 20 call confirmed |
| `oauth.ts` | `loginOpenAICodex` from @mariozechner/pi-ai/oauth | import + dispatch via loginFnForProvider('openai') | WIRED | Line 2 import; line 34 `return provider === "anthropic" ? loginAnthropic : loginOpenAICodex` |
| `oauth.ts` | `forceExpireOAuth` from ../lib/credentials | import + call in POST /debug/force-expire handler | WIRED | Line 4 import; line 173 `const result = forceExpireOAuth(provider)` |
| `oauth.ts` | `ensurePortFree` (same file) | pre-check called with portForProvider(provider) | WIRED | Line 62: `await ensurePortFree(portForProvider(provider))` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `stream-adapter.ts` | AgentEvent from agent.subscribe | pi-agent-core Agent event bus | Unknown for openai-codex provider — see gap | HOLLOW — wired to Agent subscribe, but Codex events not reaching text_delta case |
| `setup.ts` | resolveCredential (async) | credentials store — getActiveCredential + refreshOpenAICodexToken on near-expiry | Real OAuth token flow confirmed for SC#2 (credential stored); SC#3 chat path not producing output | STATIC for Codex chat path (token resolves but stream produces no content) |

---

### Behavioral Spot-Checks

| Behavior | Method | Result | Status |
| -------- | ------ | ------ | ------ |
| POST /api/auth/oauth/start returns authUrl | UAT SC#1 (live curl) | HTTP 200, non-empty authUrl from auth.openai.com | PASS |
| GET /api/auth/oauth/status → pending → ok lifecycle | UAT SC#2 (live curl) | pending while browser open; ok after consent; /api/auth/status shows hasOAuth:true | PASS |
| GET /api/models?provider=openai returns Codex models only | UAT SC#3a (live curl) | 9 Codex models (gpt-5.1, gpt-5.1-codex-max, ...), zero standard OpenAI models | PASS |
| POST /api/chat with provider=openai produces assistant content | UAT SC#3b (live curl) | HTTP 200 SSE, only `event: done` — zero text_delta events | FAIL |
| POST /api/auth/oauth/start with 127.0.0.1:1455 bound returns 409 | UAT SC#5 (live curl) | HTTP 409 with verbatim Codex CLI message | PASS |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| OAUTH-02 | 07-01, 07-02, 07-03, 07.1-02 | User pode autenticar via OAuth PKCE com OpenAI Codex (loginOpenAICodex via pi-ai) | COMPLETE | SC#3 PASS (Phase 7.1 final closure) — OAuth token works for Codex chat. Fix: toStoreProvider() in setup.ts reverse-maps "openai-codex" to "openai" for credential store lookup. |
| OAUTH-03 | 07-01, 07-02, 07-03, 07.1-02 | Tokens OAuth sao refreshed automaticamente antes de expirar | COMPLETE | SC#4 PASS (Phase 7.1 final closure) — force-expire + chat triggers auto-refresh. oauthExpiry advanced from 1776324468599 to 1776324576399. |

**Note:** OAUTH-02 and OAUTH-03 confirmed complete after Phase 7.1 final closure (2026-04-06). SC#3 and SC#4 both PASS.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/server/lib/stream-adapter.ts` | 36–43 | switch on `event.type` handles `message_update` → checks `ame.type === "text_delta"` but only this one event subtype; no fallback logging for unrecognized event types | WARNING | If pi-agent-core emits a different event name for Codex streaming (e.g. a different ame.type), events fall through silently. This is the prime suspect for SC#3 FAIL. Not a code smell per se — the logic is intentional — but the lack of an unmatched-event log path makes diagnosis harder. |
| `src/server/routes/oauth.ts` | 60 | Comment still says "port 53692 before calling loginAnthropic" in the OpenAI/general branch (copy-paste artifact from Phase 6) | INFO | Cosmetic only — no functional impact. The actual code calls `portForProvider(provider)` correctly. |

---

### Human Verification Required

#### 1. SC#3 Root Cause Confirmation

**Test:** Add a temporary log to `adaptAgentEvents` that prints `event.type` (and `ame.type` when `event.type === "message_update"`) for every event received. Then run `POST /api/chat` with `provider: "openai"` and `model: "gpt-5.1"`. Inspect the server console output.

**Expected:** Either (a) no events are received at all — indicating the Agent loop completes without emitting anything; or (b) events are received with unexpected type names that do not match the current switch cases.

**Why human:** Cannot determine which of the three possible root causes applies without running the server and observing live event emission:
- Cause A: `adaptAgentEvents` switch missing the event type pi-agent-core emits for Codex (fix: add case)
- Cause B: Agent loop completes without emitting any events (fix: investigate Agent configuration for openai-codex)
- Cause C: Silent backend denial — ChatGPT returns 200 with empty body (fix: scope check with `curl -v` against raw pi-ai call)

#### 2. SC#4 Auto-Refresh (after SC#3 is fixed)

**Test:** With SC#3 green, run: (1) `POST /api/auth/oauth/debug/force-expire?provider=openai` to set expiry to past; (2) `POST /api/chat` with `provider: "openai"` and `model: "gpt-5.1"`; (3) `GET /api/auth/status?provider=openai` and verify `oauthExpiry` timestamp is newer than the forced value.

**Expected:** Chat request succeeds (stream produces assistant content), and the new oauthExpiry in /api/auth/status is later than the force-expired value — proving the refresh cycle fired mid-request.

**Why human:** Requires a running backend, live OAuth credentials, and timing-sensitive state verification. Cannot be checked statically.

---

### Gaps Summary

Phase 7 delivered three of its five success criteria cleanly. The OAuth PKCE acquisition flow (SC#1, SC#2), the D-01/D-02 provider remap (Codex model list via OAuth), and the port 1455 conflict handling (SC#5) are all implemented, wired, and empirically verified via live UAT.

The gap blocking phase completion is SC#3 — the stream never produces assistant content for Codex models. The plumbing between the OAuth token, the pi-agent-core Agent loop, and the SSE stream is structurally present, but `adaptAgentEvents` in `src/server/lib/stream-adapter.ts` appears to not be subscribing to (or matching) the event type that pi-agent-core actually emits for OpenAI Codex responses. The stream closes cleanly with no error event, which rules out a scope/authorization rejection (Pitfall 2) and points to an event name mismatch.

SC#4 (auto-refresh) is blocked by SC#3 — the infrastructure is implemented and the debug endpoint is wired, but empirical validation requires a working chat stream first.

**Phase 7.1 (gap closure) should:**
1. Add verbose event logging to `adaptAgentEvents` and run a live Codex chat request to capture what event types pi-agent-core actually emits.
2. Add the missing case branch(es) to the switch in `stream-adapter.ts` for the openai-codex event shape.
3. Re-run SC#3 and SC#4 to close both gaps.

Requirements OAUTH-02 and OAUTH-03 must NOT be considered satisfied until Phase 7.1 gap closure is verified.

---

_Verified: 2026-04-05_
_Verifier: Claude (gsd-verifier)_

---

## Phase 7.1 Closure (re-verified 2026-04-06)

Both gaps resolved. SC#3 and SC#4 now PASS per 07-UAT.md "Re-verification (Phase 7.1 — final closure)" section.

**Fix applied:** Branch A (our code) — added `toStoreProvider()` helper in `src/server/agent/setup.ts` that reverse-maps pi-ai's `"openai-codex"` slug back to the credential store's canonical `"openai"` Provider key inside the `getApiKey` callback. Root cause: `resolvePiProvider` remaps `"openai"` to `"openai-codex"` for OAuth, but pi-agent-core's Agent passes that slug to `getApiKey`, where `getActiveCredential("openai-codex")` returned `null` (store keys by `"openai"`).

**Root cause:** Credential store key mismatch — pi-ai uses `"openai-codex"` internally but our store keys by `"openai"`. The `getApiKey` callback received the remapped slug and could not find the credential.

**Re-verified by:** henriquelima
**Re-verified at:** 2026-04-06T07:32:00Z
