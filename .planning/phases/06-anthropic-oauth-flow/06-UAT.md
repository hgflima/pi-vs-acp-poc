---
phase: 06-anthropic-oauth-flow
type: uat
status: PASS
executed: 2026-04-05
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
HTTP 200
{
  "status": "started",
  "provider": "anthropic",
  "authUrl": "https://claude.ai/oauth/authorize?..."
}
```
(authUrl starts with `https://claude.ai/oauth/authorize` with PKCE params attached)

**Result:** PASS

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
{
  "status": "pending",
  "provider": "anthropic",
  "authUrl": "https://claude.ai/oauth/authorize?..."
}
```
**Actual (2c):**
```
{
  "status": "ok",
  "provider": "anthropic"
}
```
**Actual (2d):**
```
{
  "hasApiKey": false,
  "hasOAuth": true,
  "activeMethod": "oauth",
  "oauthExpiry": <unix-ms>
}
```
Status transitioned pending → ok after browser consent; Phase 5 `/api/auth/status` confirms `hasOAuth:true`, `activeMethod:"oauth"`.

**Result:** PASS

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

> **NOTE — Plan curl authored incorrectly (documentation bug, NOT a code bug):**
> The curl above sends `messages` / `modelId`, but the `/api/chat` endpoint contract expects
> `message` / `model` (see `src/server/routes/chat.ts:10` and `src/client/hooks/use-chat.ts:200` —
> the real frontend caller). Running the plan's curl as written returned `"No model configured"`
> because both `message` and `model` destructured to `undefined`. The `/api/chat` endpoint itself
> is correct and aligned with the real frontend caller; only this UAT curl was mis-authored.
>
> **Corrected curl (this is what actually passed):**
> ```bash
> curl -sS -N -X POST http://localhost:3001/api/chat \
>   -H "Content-Type: application/json" \
>   -d '{"provider":"anthropic","model":"claude-haiku-4-5-20251001","message":"Say OK and nothing else"}'
> ```

**Actual:**
```
SSE stream emitted assistant content events; stream completed with "OK" in the assistant response.
OAuth token from Test 2 was used by pi-agent-core to call Anthropic's API successfully.
```
No Feb 2026 `sk-ant-oat*` rejection observed — OAuth token worked end-to-end for a real chat request.

**Result:** PASS (token works end-to-end)

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
HTTP 409
{
  "status": "error",
  "message": "Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again."
}
```
Port pre-check triggered on the `nc` listener; /start returned the expected 409 + Claude Code CLI conflict message.

**Result:** PASS

---

## Final Outcome

**Overall:** PASS

**Summary:**
- SC#1 (auth URL returned): PASS
- SC#2 (status polling + credentials stored): PASS
- SC#3 (OAuth token works for chat): PASS
- SC#4 (port conflict handled): PASS

**Follow-up actions:**
- Phase 8 UI should send `message` / `model` fields per the existing /api/chat contract (already true in `src/client/hooks/use-chat.ts:200`).
- Update future UAT plan template to verify curl payloads match actual endpoint schemas before publishing. The Test 3 curl in plan 06-02 was authored with wrong field names (`messages` / `modelId` vs. endpoint contract `message` / `model`); manual correction was needed during execution.

**Executed by:** Henrique (human tester via Claude Code orchestration)
**Executed at:** 2026-04-05T13:34:42Z

---
