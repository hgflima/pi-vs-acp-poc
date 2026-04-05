---
phase: 07-openai-oauth-flow
type: uat
status: pending
executed: null
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

- Backend running: `npm run dev:server` (port 3001)
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
[paste response here]
```

**Result:** [ PASS | FAIL ]

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
[paste response here]
```
**Actual (2c):**
```
[paste response here]
```
**Actual (2d):**
```
[paste response here]
```

**Result:** [ PASS | FAIL ]

---

### Test 3 — SC#3: Send chat message using OAuth token (Codex model)

This test validates BOTH that the OAuth token works AND that the Plan 01 provider remap (D-01) correctly routes to Codex models.

**Step 3a.** Verify the model list for provider=openai now returns Codex models (D-02):
```bash
curl -sS "http://localhost:3001/api/models?provider=openai" | jq '.models[].id'
```
**Expected:** List contains Codex model IDs like `gpt-5.1`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.2`, `gpt-5.2-codex` — NOT `gpt-4o`, `gpt-4o-mini`, `gpt-5`, etc. (If standard OpenAI models appear, the resolvePiProvider remap is not wired correctly — FAIL this test and route back to Plan 01 gap closure.)

**Step 3b.** With OAuth credentials stored from Test 2, send a chat request to a Codex model. Note the request body uses `message`, `model`, `provider` (NOT `messages`, `modelId` — the chat route contract is `{message, model, provider}`):
```bash
curl -sS -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"openai",
    "model":"gpt-5.1",
    "message":"Say OK and nothing else"
  }'
```

**Expected (PASS):** SSE stream with assistant content events; stream completes with assistant content containing "OK" (or similar short acknowledgment).

**Expected (BLOCKED, per RESEARCH.md Pitfall 2):** Error response or SSE error event containing text like "insufficient scope", "model.request", or "unauthorized_client". This means the `openid profile email offline_access` scopes are insufficient for the Codex backend despite pi-ai routing through `chatgpt.com/backend-api`. Document the exact error.

**Actual (3a — model list):**
```
[paste response here]
```
**Actual (3b — first 20-30 lines of stream):**
```
[paste response here]
```

**Result:** [ PASS (token works end-to-end + Codex models returned) | BLOCKED (upstream policy rejects — Pitfall 2 materialized) | FAIL (plumbing bug or remap broken) ]

**If BLOCKED:** Record the exact error message. Note in 07-SUMMARY.md under "Known Upstream Limitations". Phase 7 is still technically complete (the code is correct, pi-ai's scope choice is the blocker).

---

### Test 4 — SC#4: Auto-refresh via force-expire + chat

This test proves the end-to-end refresh cycle (mutex → refreshOpenAICodexToken → storeOAuthTokens → new access token in chat stream) without waiting 6h.

**Step 4a.** Capture the current `oauthExpiry` from /api/auth/status:
```bash
curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq .oauthExpiry
```
**Expected:** A large epoch-ms number (current time + ~6h).

**Step 4b.** Force-expire the credential:
```bash
curl -sS -X POST "http://localhost:3001/api/auth/oauth/debug/force-expire?provider=openai" | jq .
```
**Expected:** `{"status":"ok","provider":"openai","before":<original-expiry>,"after":<around-now>,"message":"Forced expiry on openai OAuth credential. Next chat request will trigger refresh."}`

**Step 4c.** Verify expiry is now in the past:
```bash
curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq '.oauthExpiry, ((.oauthExpiry / 1000) | todate)'
```
**Expected:** oauthExpiry is less than current time (i.e., already expired). The ISO date should be ~1 second in the past.

**Step 4d.** Send a chat request — this should trigger the refresh path in `resolveCredential` (setup.ts). The refresh happens transparently before pi-ai receives the access token.
```bash
curl -sS -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"openai",
    "model":"gpt-5.1",
    "message":"Say OK and nothing else"
  }'
```
**Expected:** Same as Test 3 — SSE stream with assistant content. No 401 errors in the stream (which would indicate refresh failed and an expired token was sent).

**Step 4e.** Verify `oauthExpiry` moved forward (the refresh happened):
```bash
curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq .oauthExpiry
```
**Expected:** A NEW large epoch-ms number (current time + ~6h) — MUST be greater than the `after` value captured in Step 4b. Proves `refreshOpenAICodexToken` was called and `storeOAuthTokens` wrote fresh credentials.

**Actual (4a — initial expiry):**
```
[paste value here]
```
**Actual (4b — force-expire response):**
```
[paste response here]
```
**Actual (4c — expiry after force):**
```
[paste response here]
```
**Actual (4d — chat response first 20-30 lines):**
```
[paste response here]
```
**Actual (4e — expiry after chat):**
```
[paste value here]
```

**Result:** [ PASS (4e expiry > 4b after value, chat succeeded) | BLOCKED (chat succeeded but refresh didn't happen — expiry unchanged; possible if Phase 5 60s buffer logic has a bug, but unlikely) | FAIL (chat 401'd or refresh threw) ]

---

### Test 5 — SC#5: Port 1455 conflict returns 409 with Codex CLI message

**Step 5a.** Occupy port 1455 with a stand-in listener:
```bash
nc -l 1455 &
NC_PID=$!
sleep 1
```

**Step 5b.** Trigger /start while port is busy:
```bash
curl -sS -w "\nHTTP %{http_code}\n" -X POST http://localhost:3001/api/auth/oauth/start \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai"}'
```

**Expected:** HTTP 409, JSON body `{"status":"error","message":"Port 1455 is already in use by another process. This port is required by the OpenAI Codex OAuth callback. If you have Codex CLI running, please stop it and try again."}`

**Step 5c.** Clean up:
```bash
kill $NC_PID 2>/dev/null
```

**Actual:**
```
[paste response + HTTP code here]
```

**Result:** [ PASS | FAIL ]

---

## Final Outcome

**Overall:** [ PASS | BLOCKED | FAIL ]

**Summary:**
- SC#1 (auth URL returned): [ PASS | FAIL ]
- SC#2 (status polling + credentials stored): [ PASS | FAIL ]
- SC#3 (OAuth token works for Codex chat + D-01/D-02 remap): [ PASS | BLOCKED | FAIL ]
- SC#4 (auto-refresh via force-expire + chat): [ PASS | BLOCKED | FAIL ]
- SC#5 (port 1455 conflict handled): [ PASS | FAIL ]

**Follow-up actions:**
- [list any items, or "None"]

**Executed by:** [name]
**Executed at:** [ISO timestamp]

---
