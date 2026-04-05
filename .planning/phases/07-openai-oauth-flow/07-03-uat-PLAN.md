---
phase: 07-openai-oauth-flow
plan: 03
type: execute
wave: 3
depends_on: ["07-02"]
files_modified:
  - .planning/phases/07-openai-oauth-flow/07-UAT.md
autonomous: false
requirements: [OAUTH-02, OAUTH-03]
must_haves:
  truths:
    - "07-UAT.md exists with scaffolded test sections for SC#1 (start OAuth flow), SC#2 (status polling + credential stored), SC#3 (OAuth token works for chat via Codex models), SC#4 (auto-refresh via force-expire + chat), SC#5 (port 1455 conflict returns 409 with Codex CLI message)"
    - "UAT records the result of POST /api/chat with provider=openai and modelId=gpt-5.1 (a Codex model) after OAuth completion — proves SC#3 AND the provider remap from Plan 01 (D-01/D-02)"
    - "UAT records the force-expire → chat flow proving SC#4 (auto-refresh): force-expire the OAuth credential, then send a chat request, verify the response shows evidence of a refresh (new expiry in /api/auth/status, chat succeeds without a 401)"
    - "UAT records the port 1455 conflict test result — HTTP 409 with message containing verbatim 'Port 1455 is already in use' and 'Codex CLI'"
    - "UAT outcome is explicitly marked: PASS (all SC verified), BLOCKED (token obtained but ChatGPT backend rejects — documents Pitfall 2 materialization), or FAIL (plumbing bug requires gap closure)"
    - "Frontmatter status: <value> transitions from 'pending' to PASS/BLOCKED/FAIL with executed timestamp filled"
  artifacts:
    - path: ".planning/phases/07-openai-oauth-flow/07-UAT.md"
      provides: "End-to-end UAT record for OAUTH-02 and OAUTH-03 covering ROADMAP Phase 7 success criteria SC#1-SC#5"
      contains: "status:"
  key_links:
    - from: ".planning/phases/07-openai-oauth-flow/07-UAT.md"
      to: "POST /api/auth/oauth/start + GET /api/auth/oauth/status + POST /api/auth/oauth/debug/force-expire + POST /api/chat + GET /api/auth/status + GET /api/models"
      via: "curl commands documented with actual captured outputs"
      pattern: "curl"
---

<objective>
Perform end-to-end UAT validation of the OpenAI Codex OAuth flow via curl (D-05, D-08) and the auto-refresh debug endpoint (D-06, D-07), and record the outcome in `07-UAT.md`. This is the empirical proof for Phase 7's five success criteria: SC#1 (auth URL exposed), SC#2 (status polling + credential stored), SC#3 (OAuth token works for real chat via Codex models — proves the D-01/D-02 provider remap), SC#4 (auto-refresh cycle fires and the next chat succeeds with a new access token), SC#5 (port 1455 conflict returns 409 with the Codex CLI message).

Purpose: OAUTH-02 and OAUTH-03's acceptance test. Per STATE.md concern: "OpenAI OAuth scope may be insufficient (pi-ai requests openid profile email offline_access but Codex API may require model.request). Must validate empirically with live test." This checkpoint is where that risk materializes or is falsified. The force-expire endpoint from Plan 02 lets us exercise the refresh path in ~1 minute instead of waiting ~6 hours for natural token expiry.

Output: `.planning/phases/07-openai-oauth-flow/07-UAT.md` with status (PASS / BLOCKED / FAIL), curl commands run, actual responses captured, and follow-up notes.
</objective>

<execution_context>
@/Users/henriquelima/Documents/dev/personal/pi-ai-poc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/henriquelima/Documents/dev/personal/pi-ai-poc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-openai-oauth-flow/07-CONTEXT.md
@.planning/phases/07-openai-oauth-flow/07-RESEARCH.md
@.planning/phases/07-openai-oauth-flow/07-01-SUMMARY.md
@.planning/phases/07-openai-oauth-flow/07-02-SUMMARY.md
@.planning/ROADMAP.md
@.planning/phases/06-anthropic-oauth-flow/06-UAT.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Scaffold 07-UAT.md template with SC#1-SC#5 sections and curl commands</name>
  <files>.planning/phases/07-openai-oauth-flow/07-UAT.md</files>
  <read_first>
    - .planning/ROADMAP.md (Phase 7 section — must copy the five Success Criteria verbatim into the UAT doc)
    - .planning/phases/07-openai-oauth-flow/07-CONTEXT.md (D-04 port 1455 message verbatim; D-06 force-expire semantics; D-08 UAT scope and Codex model examples gpt-5.1)
    - .planning/phases/07-openai-oauth-flow/07-RESEARCH.md (Pitfall 2 — scope/ChatGPT backend rejection risk that determines PASS vs BLOCKED)
    - .planning/phases/07-openai-oauth-flow/07-01-SUMMARY.md (confirm resolvePiProvider/forceExpireOAuth exports — Plan 01 output)
    - .planning/phases/07-openai-oauth-flow/07-02-SUMMARY.md (confirm exact endpoint paths + response shapes — Plan 02 output)
    - .planning/phases/06-anthropic-oauth-flow/06-UAT.md (reference the structure + Final Outcome template used in Phase 6)
    - src/server/routes/chat.ts (confirm /api/chat request body shape — {message, model, provider}, NOT {messages, modelId})
  </read_first>
  <action>
    Create a NEW file at `.planning/phases/07-openai-oauth-flow/07-UAT.md` with the following exact frontmatter and structure. The human checkpoint in Task 2 will fill in actual results — this task is the scaffold only.

    **Frontmatter (must be literal YAML):**

    ```yaml
    ---
    phase: 07-openai-oauth-flow
    type: uat
    status: pending
    executed: null
    scope: "End-to-end validation of OpenAI Codex OAuth PKCE flow + auto-refresh per D-06/D-08"
    requirements: [OAUTH-02, OAUTH-03]
    ---
    ```

    **Body sections in this exact order (use the Markdown headings and fence blocks verbatim):**

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

    Do NOT fill in the [paste ... here], [ PASS | FAIL ], [ PASS | BLOCKED | FAIL ], or [name/timestamp] placeholders in this task — Task 2's human checkpoint fills them.
  </action>
  <verify>
    <automated>test -f .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q 'status: pending' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q 'Test 1 — SC#1' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q 'Test 5 — SC#5' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q 'Port 1455 is already in use' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q 'Codex CLI' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q 'force-expire' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q 'gpt-5.1' .planning/phases/07-openai-oauth-flow/07-UAT.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f .planning/phases/07-openai-oauth-flow/07-UAT.md` returns 0
    - Frontmatter status pending: `grep -qE '^status: pending$' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Frontmatter type: `grep -qE '^type: uat$' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Frontmatter requirements: `grep -q 'requirements: \[OAUTH-02, OAUTH-03\]' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - All five test sections present: `grep -c "### Test [1-5] — SC#[1-5]" .planning/phases/07-openai-oauth-flow/07-UAT.md` returns 5
    - D-04 message verbatim in Test 5: `grep -q "Port 1455 is already in use by another process. This port is required by the OpenAI Codex OAuth callback. If you have Codex CLI running, please stop it and try again." .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - curl commands for /start: `grep -q 'POST http://localhost:3001/api/auth/oauth/start' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - curl commands for /status: `grep -q '/api/auth/oauth/status?provider=openai' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - curl commands for /debug/force-expire: `grep -q '/api/auth/oauth/debug/force-expire?provider=openai' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - curl commands for /api/chat: `grep -q 'POST http://localhost:3001/api/chat' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Chat body uses correct field names (message, model, provider): `grep -q '"model":"gpt-5.1"' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q '"provider":"openai"' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q '"message":"Say OK' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Codex model list check present in Test 3a: `grep -q '/api/models?provider=openai' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q 'gpt-5.1-codex' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - BLOCKED outcome documented for SC#3: `grep -q 'BLOCKED' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Pitfall 2 referenced: `grep -q 'Pitfall 2' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Final Outcome section: `grep -q '## Final Outcome' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - SC#4 refresh cycle explicit: `grep -q 'refreshOpenAICodexToken' .planning/phases/07-openai-oauth-flow/07-UAT.md`
  </acceptance_criteria>
  <done>
    Per D-06/D-08: UAT template scaffolded with all five SC tests; curl commands ready to run; BLOCKED outcome documented for SC#3/SC#4 (Pitfall 2 — insufficient scope); correct chat route contract (`{message, model, provider}`) used; D-01/D-02 remap validation embedded in Test 3a (model list check). Status: pending — awaiting human execution in Task 2.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Human UAT execution — run the five tests and fill in 07-UAT.md</name>
  <files>.planning/phases/07-openai-oauth-flow/07-UAT.md</files>
  <read_first>
    - .planning/phases/07-openai-oauth-flow/07-UAT.md (the scaffold from Task 1 — human fills it in)
  </read_first>
  <action>
    HUMAN VERIFICATION CHECKPOINT — this task pauses execution for the user to run the UAT manually. Executor must:
    1. Print the verification steps below to the user.
    2. Wait for the user to type "approved" / "PASS" / "BLOCKED" / "FAIL" or describe failures.
    3. Do NOT automate the OAuth consent flow — the user must complete it in a real browser against the live OpenAI OAuth service (auth.openai.com).
    4. Do NOT pre-fill the UAT doc — the user pastes real outputs as they run.

    **What is built (for user reference):** Plan 01 added resolvePiProvider/forceExpireOAuth to credentials.ts + wired the remap into setup.ts (getModel) and models.ts (getModels). Plan 02 extended /api/auth/oauth/start to dispatch loginOpenAICodex and added /api/auth/oauth/debug/force-expire. Ready for end-to-end human validation per D-06/D-08.

    **Verification steps to present to the user:**

    1. **Ensure backend is running** in a separate terminal:
       ```
       npm run dev:server
       ```
       Confirm it prints `Backend running on http://localhost:3001`.

    2. **Verify port 1455 is free** before Test 1:
       ```
       lsof -nP -iTCP:1455 -sTCP:LISTEN
       ```
       Should output nothing (exit code 1). If a process holds it (most likely Codex CLI), stop it first.

    3. **Execute Test 1** (SC#1 — start OAuth, receive authUrl). Run the curl command from the UAT doc. Paste the JSON response into the "Actual" block. Mark PASS if authUrl is a non-empty URL starting with `https://auth.openai.com/`; mark FAIL otherwise.

    4. **Execute Test 2** (SC#2 — status polling + credentials stored).
       - Run Step 2a curl while flow is pending; paste response. Should show `"status":"pending"`.
       - Open the authUrl from Test 1 in a browser; sign in with ChatGPT credentials; approve consent. pi-ai's built-in success page should appear at http://127.0.0.1:1455/callback.
       - Run Step 2c curl after consent completes; paste response. Should show `"status":"ok"`.
       - Run Step 2d curl; paste response. Should show `"hasOAuth":true,"activeMethod":"oauth","oauthExpiry":<epoch-ms>`.
       - Mark PASS if all three steps match expected; mark FAIL otherwise.

    5. **Execute Test 3** (SC#3 — send chat via OAuth token + D-01/D-02 remap verification).
       - Run Step 3a curl to get model list; paste response. The list MUST contain Codex model IDs (`gpt-5.1`, `gpt-5.1-codex`, etc.) — NOT standard OpenAI models (`gpt-4o`, `gpt-4o-mini`). If standard models appear, the resolvePiProvider remap in Plan 01 is broken → mark FAIL and route back to Plan 01 gap closure.
       - Run Step 3b curl to /api/chat with `model: "gpt-5.1"`. Paste the first 20-30 lines of the streamed response.
       - If stream emits assistant content events with "OK" in the content → PASS.
       - If stream emits an error with "insufficient scope" / "model.request" / "unauthorized_client" / similar scope rejection → BLOCKED (Pitfall 2 materialized; the code is correct, pi-ai's scope choice is upstream). Document the exact error.
       - If plumbing fails (500 error, connection refused, code-level bug) → FAIL.

    6. **Execute Test 4** (SC#4 — auto-refresh via force-expire + chat).
       - Run Step 4a to capture initial oauthExpiry value; paste.
       - Run Step 4b (force-expire POST); paste. Verify `before` = initial value, `after` ≈ now - 1s.
       - Run Step 4c; paste. Verify oauthExpiry is now in the past.
       - Run Step 4d (chat request); paste first 20-30 lines. MUST NOT contain a 401 error (that would mean refresh failed and expired token was sent).
       - Run Step 4e; paste. MUST show a NEW expiry value greater than the `after` from 4b (proving refreshOpenAICodexToken was called and storeOAuthTokens wrote fresh credentials).
       - Mark PASS if 4e expiry > 4b after value AND chat succeeded. Mark BLOCKED if chat succeeded but expiry didn't advance (unlikely — indicates Phase 5 60s buffer logic bug). Mark FAIL if chat 401'd or force-expire returned 404 (no credential stored — Test 2 failed).

    7. **Execute Test 5** (SC#5 — port 1455 conflict). Start nc listener on 1455, run /start curl, confirm 409 + Codex CLI message, kill nc. Paste response and HTTP code.

    8. **Fill in Final Outcome** section at bottom of 07-UAT.md:
       - Set per-SC results
       - Set Overall: PASS if all five PASS, BLOCKED if SC#3 or SC#4 is BLOCKED and others PASS, FAIL if any plumbing failure
       - Record executed-by name and ISO timestamp
       - List any follow-up actions (or "None")

    9. **Update frontmatter** at top of 07-UAT.md:
       - Change `status: pending` to `status: PASS` or `status: BLOCKED` or `status: FAIL`
       - Change `executed: null` to `executed: <ISO timestamp>`

    **Acceptable outcomes for phase completion:**
    - PASS: all five SC verified. Phase 7 done. OAUTH-02 and OAUTH-03 empirically confirmed.
    - BLOCKED: SC#1, SC#2, SC#5 PASS; SC#3 or SC#4 BLOCKED by OpenAI scope policy (Pitfall 2, expected risk per STATE.md). Phase 7 done with note — pi-ai scope decision is the upstream blocker.
    - FAIL: Any plumbing-level bug or the Plan 01 remap didn't work. Do NOT mark phase complete — route back to planner for gap closure.
  </action>
  <verify>
    <automated>grep -qE '^status: (PASS|BLOCKED|FAIL)$' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -qE '\*\*Overall:\*\* (PASS|BLOCKED|FAIL)' .planning/phases/07-openai-oauth-flow/07-UAT.md && ! grep -q '\[paste' .planning/phases/07-openai-oauth-flow/07-UAT.md</automated>
  </verify>
  <acceptance_criteria>
    - Frontmatter status updated from 'pending': `grep -qE '^status: (PASS|BLOCKED|FAIL)$' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Frontmatter executed timestamp set: `grep -qE '^executed: 20[0-9]{2}-' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Overall outcome set: `grep -qE '\*\*Overall:\*\* (PASS|BLOCKED|FAIL)$' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - No '[paste ... here]' placeholders left in Actual blocks: `! grep -q '\[paste' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - No '[ PASS | FAIL ]' unfilled result markers: `! grep -q '\[ PASS | FAIL \]' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - No '[ PASS | BLOCKED | FAIL ]' unfilled result markers: `! grep -q '\[ PASS | BLOCKED | FAIL \]' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - No '[name]' unfilled placeholder: `! grep -q '\[name\]' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Per-SC result lines filled: `grep -c '(PASS|BLOCKED|FAIL)' .planning/phases/07-openai-oauth-flow/07-UAT.md` returns at least 6 (5 SC results + Overall)
    - If BLOCKED: exact error message captured in Test 3 or Test 4 Actual block (human judgment — checker reviews content)
    - Resume signal received from user: one of "approved" / "PASS" / "BLOCKED" / "FAIL"
  </acceptance_criteria>
  <done>
    User executed all five UAT tests live, pasted real curl outputs into 07-UAT.md, marked each SC with PASS/BLOCKED/FAIL, updated frontmatter status + executed timestamp, and signalled completion. Phase 7 is declared complete if Overall is PASS or BLOCKED.
  </done>
  <resume-signal>Type "approved" (or "PASS" / "BLOCKED" / "FAIL" matching the filled-in Final Outcome), or describe any issues encountered during testing</resume-signal>
</task>

</tasks>

<verification>
**Structural verification (automated, post-Task-2):**
- `grep -qE '^status: (PASS|BLOCKED|FAIL)$' .planning/phases/07-openai-oauth-flow/07-UAT.md` — status updated from "pending"
- `grep -c '\*\*Actual' .planning/phases/07-openai-oauth-flow/07-UAT.md` returns at least 5 — actual response blocks exist
- `grep -qE '\*\*Overall:\*\* (PASS|BLOCKED|FAIL)' .planning/phases/07-openai-oauth-flow/07-UAT.md` — Final Outcome filled in
- `! grep -q '\[paste' .planning/phases/07-openai-oauth-flow/07-UAT.md` — no placeholders left

**Phase 7 declared complete when:**
- UAT status is PASS or BLOCKED (not FAIL, not pending)
- If BLOCKED: 07-SUMMARY.md notes the upstream scope limitation (Pitfall 2)
</verification>

<success_criteria>
- 07-UAT.md exists with scaffolded tests for SC#1-SC#5
- Human executed all five tests and filled in actual responses
- Final Outcome is PASS or BLOCKED (FAIL means gap closure needed)
- Frontmatter status reflects the filled-in outcome
- OAUTH-02 and OAUTH-03 are demonstrated end-to-end (or proven blocked by upstream scope policy)
</success_criteria>

<output>
After completion, create `.planning/phases/07-openai-oauth-flow/07-03-SUMMARY.md` documenting:
- UAT outcome (PASS / BLOCKED / FAIL)
- Per-SC results
- If BLOCKED: exact error message from OpenAI/ChatGPT backend, date observed, reference to Pitfall 2 in 07-RESEARCH.md, note for Phase 8 UI (surface BLOCKED state in connection UI)
- Follow-up items for Phase 8 UI (e.g., "surface token TTL from oauthExpiry", "show refresh state indicator")
</output>
</content>
</invoke>