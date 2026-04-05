---
phase: 06-anthropic-oauth-flow
type: uat
status: pending
executed: null
scope: "End-to-end validation of Anthropic OAuth PKCE flow per D-05"
requirements: [OAUTH-01]
---

# Phase 6 UAT — Anthropic OAuth Flow

## Scope (from D-05)

End-to-phase validation uses manual UAT via curl. Flow: start OAuth via curl POST /api/auth/oauth/start, complete consent in browser, then curl POST /api/chat with provider: "anthropic" and verify stream response. Re-uses the existing /api/chat route (no new test endpoints). Phase 8 delivers the real UI.

## Success Criteria (from ROADMAP.md Phase 6)

- SC#1: Backend endpoint initiates Anthropic OAuth PKCE flow via pi-ai loginAnthropic and returns the auth URL to the frontend
- SC#2: After user completes OAuth consent, backend stores the OAuth credentials and a status polling endpoint reports success
- SC#3: User can send chat messages using the Anthropic OAuth token (verified with real API call)
- SC#4: If port 53692 is occupied, the user gets a clear error message explaining the conflict

## Prerequisites

- Backend running: `npm run dev:server` (port 3001)
- Anthropic account with active Pro/Max subscription (required for OAuth — Claude.ai login)
- Port 53692 free (check with `lsof -nP -iTCP:53692 -sTCP:LISTEN`)
- Browser available to complete OAuth consent

## Test Plan

### Test 1 — SC#1: Start OAuth flow, receive auth URL

```bash
curl -sS -X POST http://localhost:3001/api/auth/oauth/start \
  -H "Content-Type: application/json" \
  -d '{"provider":"anthropic"}' | jq .
```

**Expected:** HTTP 200, JSON body `{"status":"started","provider":"anthropic","authUrl":"https://claude.ai/oauth/authorize?..."}` with a non-empty authUrl.

**Actual:**
```
[paste response here]
```

**Result:** [ PASS | FAIL ]

---

### Test 2 — SC#2: Poll status while pending, complete browser flow, verify stored

**Step 2a.** While the browser tab is still being opened, poll status:
```bash
curl -sS "http://localhost:3001/api/auth/oauth/status?provider=anthropic" | jq .
```
**Expected (while pending):** `{"status":"pending","provider":"anthropic","authUrl":"https://claude.ai/..."}`

**Step 2b.** Open the authUrl from Test 1 in a browser. Complete Anthropic consent screen (sign in with Claude.ai credentials, approve the requested scopes). Browser should redirect to `http://127.0.0.1:53692/callback?...` and show pi-ai's built-in success page.

**Step 2c.** Poll status again after consent completes:
```bash
curl -sS "http://localhost:3001/api/auth/oauth/status?provider=anthropic" | jq .
```
**Expected (after completion):** `{"status":"ok","provider":"anthropic"}` (entry is cleared from the Map after this first read).

**Step 2d.** Verify credentials persisted via Phase 5's authoritative status endpoint:
```bash
curl -sS "http://localhost:3001/api/auth/status?provider=anthropic" | jq .
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

### Test 3 — SC#3: Send chat message using OAuth token

With OAuth credentials stored from Test 2, send a chat request:
```bash
curl -sS -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"anthropic",
    "modelId":"claude-haiku-4-5-20251001",
    "messages":[{"role":"user","content":"Say OK and nothing else","timestamp":0}]
  }'
```

**Expected (PASS):** SSE stream with assistant content events; stream completes with a `done` event carrying non-empty content including "OK".

**Expected (BLOCKED, per Pitfall 1):** Error response or SSE error event containing text like "OAuth authentication is currently not supported" or "invalid authentication method". This is the documented Feb 2026 Anthropic policy rejecting `sk-ant-oat*` tokens for non-Claude-Code apps.

**Actual:**
```
[paste first 20-30 lines of stream response here]
```

**Result:** [ PASS (token works end-to-end) | BLOCKED (upstream policy rejects — expected risk per STATE.md) | FAIL (plumbing bug) ]

**If BLOCKED:** Record the exact error message. This is still a successful phase completion — the code is correct, the API policy is enforced. Note the outcome in 06-SUMMARY.md under "Known Upstream Limitations".

---

### Test 4 — SC#4: Port 53692 conflict returns 409 with Claude Code CLI message

**Step 4a.** Occupy port 53692 with a stand-in listener:
```bash
nc -l 53692 &
NC_PID=$!
sleep 1
```

**Step 4b.** Trigger /start while port is busy:
```bash
curl -sS -w "\nHTTP %{http_code}\n" -X POST http://localhost:3001/api/auth/oauth/start \
  -H "Content-Type: application/json" \
  -d '{"provider":"anthropic"}'
```

**Expected:** HTTP 409, JSON body `{"status":"error","message":"Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again."}`

**Step 4c.** Clean up:
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
- SC#3 (OAuth token works for chat): [ PASS | BLOCKED | FAIL ]
- SC#4 (port conflict handled): [ PASS | FAIL ]

**Follow-up actions:**
- [list any items, or "None"]

**Executed by:** [name]
**Executed at:** [ISO timestamp]

---
