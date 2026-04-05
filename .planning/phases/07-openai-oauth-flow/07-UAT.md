---
phase: 07-openai-oauth-flow
type: uat
status: FAIL
executed: 2026-04-05
scope: "End-to-end validation of OpenAI Codex OAuth PKCE flow + auto-refresh per D-06/D-08"
requirements: [OAUTH-02, OAUTH-03]
---

# Phase 7 UAT — OpenAI Codex OAuth Flow

## Scope (from D-06, D-08)

End-of-phase validation uses manual UAT via curl. Flow: start OAuth via `curl POST /api/auth/oauth/start` with `provider: "openai"`, complete consent in browser, then `curl POST /api/chat` with `provider: "openai"` and a Codex model (e.g. `gpt-5.1`) to verify the SSE stream flows. Re-uses the existing `/api/chat` route (no new test endpoints). Force-expire the credential via `POST /api/auth/oauth/debug/force-expire?provider=openai` and send a second chat request to prove auto-refresh (SC#4). Phase 8 delivers the real UI.

## Success Criteria (from ROADMAP.md Phase 7)

- SC#1: Backend endpoint initiates OpenAI OAuth PKCE flow via pi-ai and returns the auth URL to the frontend
- SC#2: After user completes OAuth consent, backend stores the OAuth credentials and a status polling endpoint reports success
- SC#3: User can send chat messages using the OAuth token (the token actually works for API calls, not just token acquisition)
- SC#4: When the OAuth token approaches expiry, it is refreshed automatically without user intervention or chat interruption
- SC#5: If port 1455 is occupied (e.g., by Codex CLI), the user gets a clear error message explaining the conflict

## Prerequisites

- Backend running: `npm run dev:backend` (port 3001) — **scaffold correction**: docs originally said `dev:server` which does not exist
- ChatGPT Plus/Pro subscription (required for OpenAI Codex OAuth — auth.openai.com login)
- Port 1455 free (check with `lsof -nP -iTCP:1455 -sTCP:LISTEN`)
- Browser available to complete OAuth consent
- `jq` installed for JSON inspection

## Test Plan

### Test 1 — SC#1: Start OAuth flow, receive auth URL

```bash
curl -sS -X POST http://localhost:3001/api/auth/oauth/start \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai"}' | jq .
```

**Expected:** HTTP 200, JSON body `{"status":"started","provider":"openai","authUrl":"https://auth.openai.com/..."}` with a non-empty authUrl.

**Actual:**
```
HTTP 200 with JSON body containing status:"started", provider:"openai",
and a complete authUrl starting with https://auth.openai.com/...
(Full URL captured by operator; not reproduced here to avoid leaking PKCE state.)
```

**Result:** PASS

---

### Test 2 — SC#2: Poll status while pending, complete browser flow, verify stored

**Step 2a.** While the browser tab is still being opened, poll status:
```bash
curl -sS "http://localhost:3001/api/auth/oauth/status?provider=openai" | jq .
```
**Expected (while pending):** `{"status":"pending","provider":"openai","authUrl":"https://auth.openai.com/..."}`

**Step 2b.** Open the authUrl from Test 1 in a browser. Complete OpenAI consent screen (sign in with ChatGPT credentials, approve the requested scopes: `openid profile email offline_access`). Browser should redirect to `http://127.0.0.1:1455/callback?...` and show pi-ai's built-in success page.

**Step 2c.** Poll status again after consent completes:
```bash
curl -sS "http://localhost:3001/api/auth/oauth/status?provider=openai" | jq .
```
**Expected (after completion):** `{"status":"ok","provider":"openai"}` (entry is cleared from the Map after this first read).

**Step 2d.** Verify credentials persisted via Phase 5's authoritative status endpoint:
```bash
curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq .
```
**Expected:** `{"hasApiKey":<bool>,"hasOAuth":true,"activeMethod":"oauth","oauthExpiry":<unix-ms>}`

**Actual (2a):**
```
{"status":"pending","provider":"openai","authUrl":"https://auth.openai.com/..."}
```
**Actual (2b — browser flow):**
```
First attempt failed with "State mismatch" (stale state from a prior /start call).
Second attempt with a fresh /start call succeeded — pi-ai success page rendered
at http://127.0.0.1:1455/callback.
```
**Actual (2c):**
```
{"status":"ok","provider":"openai"}
```
**Actual (2d):**
```
{"hasApiKey":<bool>,"hasOAuth":true,"activeMethod":"oauth","oauthExpiry":1776275325880}
```

**Result:** PASS

**Note:** Consent flow requires state to be fresh per /start invocation — reusing an older authUrl after a new /start is called triggers "State mismatch" as expected.

---

### Test 3 — SC#3: Send chat message using OAuth token (Codex model)

This test validates BOTH that the OAuth token works AND that the Plan 01 provider remap (D-01) correctly routes to Codex models.

**Step 3a.** Verify the model list for provider=openai now returns Codex models (D-02):
```bash
curl -sS "http://localhost:3001/api/models?provider=openai" | jq '.models[].id'
```
**Expected:** List contains Codex model IDs like `gpt-5.1`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.2`, `gpt-5.2-codex` — NOT `gpt-4o`, `gpt-4o-mini`, `gpt-5`, etc.

**Step 3b.** With OAuth credentials stored from Test 2, send a chat request to a Codex model:
```bash
curl -sS -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"openai",
    "model":"gpt-5.1",
    "message":"Say OK and nothing else"
  }'
```

**Expected (PASS):** SSE stream with assistant content events; stream completes with assistant content containing "OK".

**Actual (3a — model list):**
```
Codex models returned:
  gpt-5.1
  gpt-5.1-codex-max
  gpt-5.1-codex-mini
  gpt-5.2
  gpt-5.2-codex
  gpt-5.3-codex
  gpt-5.3-codex-spark
  gpt-5.4
  gpt-5.4-mini
Zero standard OpenAI models (no gpt-4o, gpt-4o-mini, gpt-5, gpt-4-turbo).
D-01/D-02 provider remap confirmed wired correctly.
```
**Actual (3b — stream output):**
```
HTTP 200 with SSE stream containing only a single event: done marker.
Zero text_delta events. Zero tool_start events. Zero error events.
Reproduced identically with model:"gpt-5.1" and model:"gpt-5.1-codex-max".

Symptom: stream closes cleanly (no exception surfaced) but never emits
any assistant content — the Agent loop appears to complete without the
Codex backend returning any text chunks via pi-agent-core's event bus.
```

**Result:** FAIL (plumbing-level gap — SSE stream emits no assistant content)

**Analysis:**
- Not BLOCKED: no "insufficient scope" / "unauthorized_client" / "model.request" error surfaced. If pi-ai's scope list were wrong for the Codex backend, we would expect an error event — instead we get a silent, successful-looking stream with no content.
- Possible root causes (for Phase 7.1 debug):
  1. `adaptAgentEvents` in `src/server/lib/stream-adapter.ts` may not be subscribing to the event type pi-ai emits for Codex responses (OpenAI's chat API streaming format differs from Anthropic's).
  2. The `openai-codex` provider slug in pi-ai may route requests but not emit the standard `text_delta` stream events that `adaptAgentEvents` expects (codex responses may come through a different event name).
  3. The ChatGPT backend may be returning 200 with an empty response body when the OAuth scopes don't grant model access — a silent denial rather than an error. `curl -v` against the raw pi-ai call would confirm.
- Recommended next step: `/gsd:debug` session targeting the stream-adapter event subscription for the `openai-codex` provider, with verbose logging on Agent events to see what pi-agent-core actually emits for Codex responses.

---

### Test 4 — SC#4: Auto-refresh via force-expire + chat

**Result:** SKIPPED (depends on Test 3b producing a working chat stream — cannot validate refresh cycle when baseline chat flow is broken).

Re-run Test 4 after Test 3b is green.

---

### Test 5 — SC#5: Port 1455 conflict returns 409 with Codex CLI message

**Step 5a.** Occupy port 1455 with a stand-in listener.

**Scaffold correction:** The original scaffold used `nc -l 1455 &`, which on this system bound to `*:1455` (wildcard) but did NOT block a new listener on `127.0.0.1:1455` specifically. The detection path uses an explicit 127.0.0.1 bind check, so the `nc` approach did not trigger the conflict.

Working approach — Python explicit bind on 127.0.0.1:1455:
```bash
python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',1455)); s.listen(1); input()" &
PY_PID=$!
sleep 1
```

**Step 5b.** Trigger /start while port is busy:
```bash
curl -sS -w "\nHTTP %{http_code}\n" -X POST http://localhost:3001/api/auth/oauth/start \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai"}'
```

**Expected:** HTTP 409, JSON body containing verbatim `"Port 1455 is already in use"` and `"Codex CLI"`.

**Actual:**
```
HTTP 409 with message: "Port 1455 is already in use by another process.
This port is required by the OpenAI Codex OAuth callback. If you have
Codex CLI running, please stop it and try again."
```

**Step 5c.** Cleanup: `kill $PY_PID 2>/dev/null`

**Result:** PASS

---

## Final Outcome

**Overall:** FAIL

**Summary:**
- SC#1 (auth URL returned): PASS
- SC#2 (status polling + credentials stored): PASS
- SC#3 (OAuth token works for Codex chat + D-01/D-02 remap): FAIL (stream emits only `event: done`, no content — plumbing gap)
- SC#4 (auto-refresh via force-expire + chat): SKIPPED (depends on SC#3)
- SC#5 (port 1455 conflict handled): PASS

**Follow-up actions:**
- **Gap closure (Phase 7.1):** Debug why `/api/chat` SSE stream emits no `text_delta` events for Codex models. Investigate `adaptAgentEvents` event subscription + pi-agent-core event names for `openai-codex` provider. Likely fix: stream-adapter needs to listen for OpenAI-style streaming events (delta.content, completion chunks) in addition to Anthropic-style events, OR the Codex provider emits a different event name than expected.
- **Retest SC#4** after SC#3 is green.
- **Scaffold fix** (non-blocking): update plan templates and UAT scaffold generator — `dev:server` → `dev:backend`; port-conflict stand-in guidance should recommend explicit 127.0.0.1 bind (Python snippet) instead of bare `nc -l`.

**Executed by:** henriquelima
**Executed at:** 2026-04-05

---
