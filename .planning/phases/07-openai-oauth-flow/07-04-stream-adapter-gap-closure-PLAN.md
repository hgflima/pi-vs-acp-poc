---
phase: 07-openai-oauth-flow
plan: 04
type: execute
wave: 4
depends_on: ["07-03"]
files_modified:
  - src/server/lib/stream-adapter.ts
  - .planning/debug/stream-events-07-04.log
  - .planning/phases/07-openai-oauth-flow/07-UAT.md
autonomous: false
requirements: [OAUTH-02, OAUTH-03]
gap_closure: true
must_haves:
  truths:
    - "diagnose task captures a real Codex chat request's agent event stream (every event.type plus ame.type inside message_update) to .planning/debug/stream-events-07-04.log — file exists, has more than 3 non-blank lines, contains at least one entry matching regex `type=(agent_start|turn_start|message_start|message_update|message_end|turn_end|agent_end)`"
    - "log analysis confirms which of the three root-cause hypotheses applies: (A) switch missing event-type match — log shows ame.type values that are NOT text_delta (e.g. start, text_start, text_end, thinking_delta) but the switch only writes SSE on text_delta; (B) Agent loop emits no message_update events at all — log shows agent_start → agent_end with no message_update between; (C) upstream backend denial — log shows an error event, HTTP 4xx/5xx in between, or pi-ai emits AssistantMessageEvent type=error"
    - "fix is targeted to the confirmed root cause: if Cause A — stream-adapter.ts switch handles a broader set of AssistantMessageEvent subtypes (at minimum text_delta; optionally text_start for UI affordance, thinking_delta for reasoning visibility) so Codex text chunks reach SSE; if Cause B or C — separate investigation documented in SUMMARY with next steps"
    - "POST /api/chat with provider=openai and model=gpt-5.1 returns an SSE stream that emits at least one `event: text_delta` line with `data: {\"data\":\"...\"}` where the delta string is non-empty, BEFORE the closing `event: done` line"
    - "POST /api/auth/oauth/debug/force-expire?provider=openai followed by POST /api/chat with provider=openai produces (a) a successful chat stream with text_delta events, and (b) a new GET /api/auth/status?provider=openai oauthExpiry value STRICTLY GREATER THAN the `after` epoch returned by force-expire — proving refreshOpenAICodexToken fired mid-request"
    - "verbose diagnostic logging added in Task 1 is removed or gated behind a const flag set to false after Task 2 fix lands — production stream-adapter path has no console.log on the hot event loop"
    - "07-UAT.md is UPDATED IN PLACE (not re-scaffolded): frontmatter status transitions FROM `status: FAIL` TO `status: PASS` (or remains FAIL with a new re-verification section if fix is inconclusive); Test 3 and Test 4 Actual blocks contain the new captured outputs with a clearly labelled `## Re-verification (Phase 7.1 gap closure)` heading"
  artifacts:
    - path: "src/server/lib/stream-adapter.ts"
      provides: "adaptAgentEvents that subscribes to Agent events and emits SSE events (text_delta, tool_start, tool_update, tool_end, done) — post-fix MUST emit text_delta for openai-codex responses"
      contains: "adaptAgentEvents"
    - path: ".planning/debug/stream-events-07-04.log"
      provides: "Captured agent event stream from live Codex chat request — diagnostic evidence for root cause identification"
      contains: "type="
    - path: ".planning/phases/07-openai-oauth-flow/07-UAT.md"
      provides: "Updated UAT record with Phase 7.1 re-verification section showing SC#3 and SC#4 new outcomes"
      contains: "Re-verification (Phase 7.1 gap closure)"
  key_links:
    - from: "src/server/lib/stream-adapter.ts"
      to: "AssistantMessageEvent subtypes from @mariozechner/pi-ai types.d.ts"
      via: "switch case(s) on ame.type matching the subtype(s) that pi-ai emits for openai-codex streaming"
      pattern: "ame\\.type === \"text_delta\""
    - from: ".planning/phases/07-openai-oauth-flow/07-UAT.md"
      to: "POST /api/chat SSE stream for provider=openai model=gpt-5.1"
      via: "curl -N with captured text_delta events pasted into Re-verification block"
      pattern: "Re-verification"
    - from: ".planning/phases/07-openai-oauth-flow/07-UAT.md"
      to: "POST /api/auth/oauth/debug/force-expire + GET /api/auth/status"
      via: "before/after oauthExpiry values captured in Re-verification block proving refresh fired"
      pattern: "oauthExpiry"
---

<objective>
Close Phase 7 UAT gaps (SC#3 FAIL, SC#4 SKIPPED) by diagnosing why the SSE stream for POST /api/chat with provider=openai + Codex models emits zero `text_delta` events, applying a targeted fix to `src/server/lib/stream-adapter.ts`, and re-running SC#3 + SC#4 end-to-end with the fix in place.

Purpose: Per 07-VERIFICATION.md, Phase 7 delivered 4/5 success criteria cleanly. The blocking gap is the plumbing between pi-agent-core's event bus and Hono's SSE stream for openai-codex-provider responses. Three root-cause hypotheses exist (A: switch mismatch on AssistantMessageEvent subtypes; B: Agent loop emits nothing; C: silent backend denial) — the verification report explicitly requires a diagnostic step before the fix because the hypothesis is unconfirmed. This plan captures real event output first, THEN applies a targeted fix, THEN removes diagnostic logging, THEN re-verifies SC#3 + SC#4 empirically.

OAUTH-02 and OAUTH-03 remain incomplete until this plan closes — Phase 7 cannot be marked complete while the chat stream produces no content.

Output: (1) diagnostic log file at `.planning/debug/stream-events-07-04.log` with captured events; (2) stream-adapter.ts fix with diagnostic logging removed/gated; (3) 07-UAT.md updated in place with a `Re-verification (Phase 7.1 gap closure)` section showing SC#3 and SC#4 PASS outcomes.
</objective>

<execution_context>
@/Users/henriquelima/Documents/dev/personal/pi-ai-poc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/henriquelima/Documents/dev/personal/pi-ai-poc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/07-openai-oauth-flow/07-VERIFICATION.md
@.planning/phases/07-openai-oauth-flow/07-UAT.md
@.planning/phases/07-openai-oauth-flow/07-CONTEXT.md
@.planning/phases/07-openai-oauth-flow/07-03-SUMMARY.md

@src/server/lib/stream-adapter.ts
@src/server/routes/chat.ts
@src/server/agent/setup.ts
@src/server/routes/oauth.ts

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase and node_modules. -->
<!-- Executor should use these directly — no codebase exploration needed. -->

From @mariozechner/pi-agent-core/dist/types.d.ts (AgentEvent — what agent.subscribe receives):
```typescript
export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
```

From @mariozechner/pi-ai/dist/types.d.ts (AssistantMessageEvent — what sits inside message_update.assistantMessageEvent):
```typescript
export type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: "done"; reason: ...; message: AssistantMessage }
  | { type: "error"; reason: ...; error: AssistantMessage };
```

From @mariozechner/pi-ai/dist/providers/openai-codex-responses.js (CONFIRMED: this provider DOES emit text_delta):
- Top-level pushes: start → (intermediate pushes from processStream / processWebSocketStream) → done/error
- processStream (shared with openai-responses-shared.js) emits `text_delta` on `response.output_text.delta`
- Also emits `thinking_delta` on `response.reasoning_summary_text.delta`
- Also emits `toolcall_delta` on `response.function_call_arguments.delta`

From @mariozechner/pi-agent-core/dist/agent-loop.js (CONFIRMED: Agent wraps text_delta into message_update):
- Subscribes to stream, for each AssistantMessageEvent with type in {text_start, text_delta, text_end, thinking_start, thinking_delta, thinking_end, toolcall_start, toolcall_delta, toolcall_end} emits `{ type: "message_update", assistantMessageEvent: event, message: {...} }`
- The `if (partialMessage)` guard on line 181 means message_update ONLY fires AFTER the `start` event set partialMessage (line 166-170)

From src/server/lib/stream-adapter.ts (CURRENT — the file being diagnosed/fixed):
```typescript
export function adaptAgentEvents({ agent, stream, onDone }: AdaptOptions): () => void {
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    try {
      switch (event.type) {
        case "message_update": {
          const ame = event.assistantMessageEvent
          if (ame.type === "text_delta") {
            void stream.writeSSE({
              event: "text_delta",
              data: JSON.stringify({ data: ame.delta }),
            })
          }
          break   // ← SILENT FALL-THROUGH for any other ame.type (text_start, text_end, thinking_delta, etc.)
        }
        case "tool_execution_start": ...
        case "tool_execution_update": ...
        case "tool_execution_end": ...
        case "agent_end":
          void stream.writeSSE({ event: "done", data: "{}" }).then(() => { unsubscribe(); onDone() })
          break
      }
      // ← SILENT FALL-THROUGH for any event.type NOT in the switch
    } catch { /* stream closed */ }
  })
  return unsubscribe
}
```

From src/server/routes/chat.ts (unchanged — the caller — subscribe BEFORE agent.prompt):
```typescript
return streamSSE(c, async (stream) => {
  const agent = createAgent({ provider, modelId: model })
  const done = new Promise<void>((resolve) => {
    const unsubscribe = adaptAgentEvents({ agent, stream, onDone: resolve })
    stream.onAbort(() => { agent.abort(); unsubscribe(); resolve() })
  })
  agent.prompt(message).catch(async (err) => { ... })
  await done
})
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add verbose diagnostic logging to adaptAgentEvents and capture a live Codex chat request event stream to .planning/debug/stream-events-07-04.log</name>
  <files>src/server/lib/stream-adapter.ts, .planning/debug/stream-events-07-04.log</files>
  <read_first>
    - src/server/lib/stream-adapter.ts (full current file — must see the exact switch structure and the `case "message_update"` block at lines 36-45 where ame.type === "text_delta" is checked)
    - .planning/phases/07-openai-oauth-flow/07-VERIFICATION.md (the three root-cause hypotheses A/B/C — diagnostic MUST produce evidence that distinguishes between them)
    - .planning/phases/07-openai-oauth-flow/07-UAT.md (Test 3 outcome — Actual (3b): "HTTP 200 with SSE stream containing only a single event: done marker. Zero text_delta events." — this is the baseline to compare against the logging output)
    - src/server/routes/chat.ts (full file — to understand subscribe timing: subscribe happens BEFORE agent.prompt, so event ordering is not the bug)
  </read_first>
  <action>
    Modify `src/server/lib/stream-adapter.ts` to add verbose diagnostic logging that prints every AgentEvent received by agent.subscribe, including the inner `assistantMessageEvent.type` whenever event.type is `"message_update"`. Then capture a live Codex chat request's console output to `.planning/debug/stream-events-07-04.log`.

    **Step 1 — Add a diagnostic log block at the top of the subscribe callback.** Open `src/server/lib/stream-adapter.ts`. Add a module-level const flag `DEBUG_EVENTS` AND a `logEvent` helper, then instrument the callback.

    Insert this block at the TOP of the file, AFTER the existing imports (after line 2) and BEFORE `const MAX_RESULT_LENGTH`:

    ```typescript
    // DIAGNOSTIC LOGGING — Phase 7.1 gap closure (07-04-stream-adapter-gap-closure-PLAN.md).
    // Remove or set to false in Task 2 after root cause is confirmed and fix lands.
    const DEBUG_EVENTS = true

    function logEvent(event: unknown): void {
      if (!DEBUG_EVENTS) return
      const e = event as { type?: string; assistantMessageEvent?: { type?: string } }
      const inner = e.assistantMessageEvent ? ` ame.type=${e.assistantMessageEvent.type}` : ""
      // eslint-disable-next-line no-console
      console.log(`[stream-adapter] type=${e.type}${inner}`)
    }
    ```

    **Step 2 — Instrument the subscribe callback.** Locate the current `const unsubscribe = agent.subscribe((event: AgentEvent) => {` (current line 33). Insert `logEvent(event)` as the FIRST statement inside the callback, BEFORE the `try {` block:

    Current (lines 33-35):
    ```typescript
      const unsubscribe = agent.subscribe((event: AgentEvent) => {
        try {
          switch (event.type) {
    ```

    Replace verbatim with:
    ```typescript
      const unsubscribe = agent.subscribe((event: AgentEvent) => {
        logEvent(event)
        try {
          switch (event.type) {
    ```

    Do NOT modify any of the existing switch cases, the `extractTextFromResult` helper, the `AdaptOptions` interface, or the returned `unsubscribe` function. The ONLY changes are: adding the DEBUG_EVENTS const + logEvent helper at the top, and inserting one `logEvent(event)` call at the start of the callback.

    **Step 3 — Capture live event output.** After the code edit:

    1. Ensure backend dev server is running in a separate terminal: `npm run dev:backend` (port 3001). Stop and restart it after the edit so the new code is loaded.
    2. Confirm OAuth credential is stored for openai: `curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq .` MUST show `"hasOAuth":true,"activeMethod":"oauth"`. If not stored, run the OAuth flow first via `curl -X POST http://localhost:3001/api/auth/oauth/start -H "Content-Type: application/json" -d '{"provider":"openai"}'` and complete browser consent.
    3. Create the debug directory if missing: `mkdir -p .planning/debug`
    4. Fire a chat request and capture BOTH the SSE stream AND the server console output. Run the chat request in the foreground; the backend's stdout will print the `[stream-adapter]` log lines. Capture via the backend terminal's stdout redirection OR by running backend with output piped to a tee:

       Option A (if backend is already running in a separate terminal, have the user capture stdout with terminal scrollback and paste into the log file):
       ```bash
       curl -sS -N -X POST http://localhost:3001/api/chat \
         -H "Content-Type: application/json" \
         -d '{"provider":"openai","model":"gpt-5.1","message":"Say OK and nothing else"}' \
         > .planning/debug/stream-events-07-04.sse-output.txt 2>&1
       ```
       Then copy the `[stream-adapter]` lines from the backend terminal scrollback into `.planning/debug/stream-events-07-04.log`.

       Option B (restart backend with logging redirected):
       ```bash
       # In backend terminal: stop current dev:backend, then:
       npm run dev:backend 2>&1 | tee -a .planning/debug/backend-stdout.log &
       # wait for "Backend running on http://localhost:3001"
       # in another terminal, fire the curl:
       curl -sS -N -X POST http://localhost:3001/api/chat \
         -H "Content-Type: application/json" \
         -d '{"provider":"openai","model":"gpt-5.1","message":"Say OK and nothing else"}'
       # then extract:
       grep '\[stream-adapter\]' .planning/debug/backend-stdout.log > .planning/debug/stream-events-07-04.log
       ```

    5. After capture, the log file `.planning/debug/stream-events-07-04.log` MUST have at least one line. Each line should match the pattern `[stream-adapter] type=<agent-event-type>` with optional ` ame.type=<assistant-message-event-type>` suffix.

    6. Preserve the SSE stream output alongside the log (in `.planning/debug/stream-events-07-04.sse-output.txt`) for Task 2 cross-reference — it shows what the CLIENT saw, vs what the server actually received.

    **Step 4 — Analyze the captured log.** Append a short analysis section at the bottom of `.planning/debug/stream-events-07-04.log` (use a blank line separator then a heading). Classify which hypothesis is confirmed:

    ```
    --- ANALYSIS ---
    Unique event.type values observed: <list them, e.g., agent_start, turn_start, message_start, message_update, message_end, turn_end, agent_end>
    Unique ame.type values observed (inside message_update): <list them, e.g., start, text_start, text_delta, text_end, done>

    Confirmed root cause: <A | B | C>
    - If A (switch misses ame.type): specify the ame.type values that appear but fall through — the switch only handles text_delta. If log shows other subtypes (text_start, thinking_delta, etc.) OR shows text_delta but it still somehow fails, explain.
    - If B (Agent emits nothing): specify — no message_update entries in log.
    - If C (backend denial): specify — error event observed, or log shows normal flow but SSE output empty.

    Fix direction for Task 2: <one-line description>
    ```

    **Step 5 — Verify log file shape.**
    Acceptance requires: file exists, non-empty, contains `type=` marker, contains analysis section.
  </action>
  <verify>
    <automated>grep -q 'const DEBUG_EVENTS = true' src/server/lib/stream-adapter.ts && grep -q 'function logEvent(event: unknown)' src/server/lib/stream-adapter.ts && grep -q 'logEvent(event)' src/server/lib/stream-adapter.ts && test -f .planning/debug/stream-events-07-04.log && test -s .planning/debug/stream-events-07-04.log && grep -q 'type=' .planning/debug/stream-events-07-04.log && grep -q '\-\-\- ANALYSIS \-\-\-' .planning/debug/stream-events-07-04.log && grep -qE 'Confirmed root cause: [ABC]' .planning/debug/stream-events-07-04.log && npx tsc --noEmit -p tsconfig.json 2>&1 | (! grep -E "src/server/lib/stream-adapter\.ts")</automated>
  </verify>
  <acceptance_criteria>
    - DEBUG_EVENTS const defined: `grep -c 'const DEBUG_EVENTS = true' src/server/lib/stream-adapter.ts` returns 1
    - logEvent helper defined: `grep -c 'function logEvent(event: unknown): void' src/server/lib/stream-adapter.ts` returns 1
    - logEvent logs event.type: `grep -q 'type=\${e.type}' src/server/lib/stream-adapter.ts`
    - logEvent logs ame.type on message_update: `grep -q 'ame.type=\${e.assistantMessageEvent.type}' src/server/lib/stream-adapter.ts`
    - logEvent called inside subscribe callback: `grep -c 'logEvent(event)' src/server/lib/stream-adapter.ts` returns at least 1
    - Existing switch cases untouched — text_delta case still present: `grep -q 'if (ame.type === "text_delta")' src/server/lib/stream-adapter.ts`
    - Existing tool_execution_start case still present: `grep -q 'case "tool_execution_start":' src/server/lib/stream-adapter.ts`
    - Existing agent_end case still present: `grep -q 'case "agent_end":' src/server/lib/stream-adapter.ts`
    - TypeScript compiles clean: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/server/lib/stream-adapter\.ts"` returns nothing (exit 1)
    - Debug log file exists: `test -f .planning/debug/stream-events-07-04.log`
    - Debug log file non-empty: `test -s .planning/debug/stream-events-07-04.log`
    - Log contains agent event type markers: `grep -c 'type=' .planning/debug/stream-events-07-04.log` returns at least 3
    - Log contains at least one known AgentEvent type (agent_start, turn_start, message_start, message_update, message_end, turn_end, or agent_end): `grep -qE 'type=(agent_start|turn_start|message_start|message_update|message_end|turn_end|agent_end)' .planning/debug/stream-events-07-04.log`
    - Analysis section present: `grep -q '\-\-\- ANALYSIS \-\-\-' .planning/debug/stream-events-07-04.log`
    - Root cause classified (A, B, or C): `grep -qE 'Confirmed root cause: [ABC]' .planning/debug/stream-events-07-04.log`
    - Fix direction recorded: `grep -q 'Fix direction for Task 2:' .planning/debug/stream-events-07-04.log`
    - OAuth credential is stored (pre-check): `curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq -r '.hasOAuth' | grep -q true` (fires at execution time; pre-requisite for the log capture step)
  </acceptance_criteria>
  <done>
    adaptAgentEvents in stream-adapter.ts now prints every AgentEvent's type (and ame.type when event.type is message_update) to server stdout via a console.log guarded by DEBUG_EVENTS=true. A live POST /api/chat request with provider=openai model=gpt-5.1 was fired against the running backend; the captured server stdout (stream-adapter lines only) lives in `.planning/debug/stream-events-07-04.log`. The log has an ANALYSIS section identifying which root cause (A, B, or C from 07-VERIFICATION.md) applies and what the fix direction should be. TypeScript compiles clean.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Apply targeted fix to stream-adapter.ts based on confirmed root cause, then remove/gate diagnostic logging</name>
  <files>src/server/lib/stream-adapter.ts</files>
  <read_first>
    - .planning/debug/stream-events-07-04.log (the captured evidence from Task 1 — MUST be read first to determine which fix path applies; do NOT apply a speculative fix without evidence)
    - src/server/lib/stream-adapter.ts (post-Task-1 version with DEBUG_EVENTS flag and logEvent helper present)
    - .planning/phases/07-openai-oauth-flow/07-VERIFICATION.md (three root-cause hypotheses — must match the fix to the confirmed cause)
    - node_modules/@mariozechner/pi-ai/dist/types.d.ts (AssistantMessageEvent type union — all 12 subtypes listed; reference for any new case branches)
  </read_first>
  <action>
    The fix depends on which root cause Task 1 confirmed in `.planning/debug/stream-events-07-04.log`. Read that file's ANALYSIS section first. Do NOT proceed with a speculative fix. If the analysis section classified the cause as something other than A/B/C (e.g., novel finding), STOP and surface the finding in the SUMMARY instead of editing code.

    **IF Cause A is confirmed (switch misses AssistantMessageEvent subtype that pi-ai emits for Codex):**

    Look at the `Unique ame.type values observed` line in the ANALYSIS. The switch currently only writes SSE on `ame.type === "text_delta"`. Apply the following fix:

    Locate the `case "message_update":` block (currently lines 36-45 pre-Task-1, shifted by the Task 1 insertions — use grep to find it). It currently reads:

    ```typescript
        case "message_update": {
          const ame = event.assistantMessageEvent
          if (ame.type === "text_delta") {
            void stream.writeSSE({
              event: "text_delta",
              data: JSON.stringify({ data: ame.delta }),
            })
          }
          break
        }
    ```

    Replace this entire block verbatim with:

    ```typescript
        case "message_update": {
          const ame = event.assistantMessageEvent
          // Phase 7.1: handle text_delta (primary content), thinking_delta (reasoning visibility),
          // and surface an SSE `stream_warning` event for any AssistantMessageEvent subtype not
          // currently represented in the client protocol so silent fall-through cannot recur.
          // AssistantMessageEvent subtypes (pi-ai types.d.ts): start, text_start, text_delta, text_end,
          // thinking_start, thinking_delta, thinking_end, toolcall_start, toolcall_delta, toolcall_end,
          // done, error. text_delta is the only one that carries user-visible assistant content in the
          // current client contract — the others are lifecycle markers (no-op) or reasoning traces.
          switch (ame.type) {
            case "text_delta":
              void stream.writeSSE({
                event: "text_delta",
                data: JSON.stringify({ data: ame.delta }),
              })
              break
            case "thinking_delta":
              // Reasoning traces from Codex responses. Client currently does not render these but
              // emitting them as a distinct SSE event keeps the protocol visible for future UI work.
              void stream.writeSSE({
                event: "thinking_delta",
                data: JSON.stringify({ data: ame.delta }),
              })
              break
            case "error":
              // Surface upstream stream-level errors as SSE error events so the client can display
              // them instead of receiving a silent `done` with no content (root cause of this gap).
              void stream.writeSSE({
                event: "error",
                data: JSON.stringify({ message: ame.error?.errorMessage ?? "Stream error" }),
              })
              break
            case "start":
            case "text_start":
            case "text_end":
            case "thinking_start":
            case "thinking_end":
            case "toolcall_start":
            case "toolcall_delta":
            case "toolcall_end":
            case "done":
              // Lifecycle markers — no SSE emission. toolcall_* are superseded by tool_execution_*
              // events at the AgentEvent layer, so the client receives tool info via those.
              break
          }
          break
        }
    ```

    RATIONALE: The existing code had a silent fall-through for every ame.type other than text_delta. An exhaustive inner switch makes it impossible to re-introduce the same silent-fall-through bug. The `error` subtype is now surfaced as an SSE event so upstream rejections (Cause C materializations) become client-visible in future.

    NOTE on fallback: If the Task 1 analysis shows Codex emits text on a DIFFERENT ame.type that is NOT in the pi-ai type list above (e.g. a brand-new subtype pi-ai just added), extend the inner switch to cover it AND document it in the SUMMARY. Do NOT remove the exhaustive structure.

    **IF Cause B is confirmed (Agent emits no message_update events for Codex — log shows agent_start → agent_end with nothing in between):**

    Do NOT edit stream-adapter.ts switch bodies. Instead:
    1. Document the finding in `.planning/debug/stream-events-07-04.log` ANALYSIS section (append a "Cause B follow-up" block).
    2. Check whether the Agent's `streamFn` is being passed correctly in setup.ts — grep `src/server/agent/setup.ts` for `streamFn` and verify pi-agent-core's default `streamSimple` is used. If not, investigate.
    3. Check if the pi-ai Codex provider is registered (inspect `node_modules/@mariozechner/pi-ai/dist/providers/register-builtins.js` for `openai-codex-responses` registration).
    4. The stream-adapter.ts fix still applies (add the exhaustive inner switch from Cause A) as a defensive measure, but the root cause is upstream. Surface a CHECKPOINT in the summary for user to investigate pi-ai/pi-agent-core integration.

    **IF Cause C is confirmed (error event or HTTP rejection observed):**

    Apply the Cause A fix (the `error` case branch above will now surface the upstream error to the SSE stream). The root cause is upstream (OpenAI scope rejection or similar) and requires a separate investigation — document the exact error message in the SUMMARY and note that Pitfall 2 (model.request scope) from 07-RESEARCH.md may have materialized.

    **FINAL STEP — Remove/gate diagnostic logging (applies to ALL causes).**

    After the fix lands, set `DEBUG_EVENTS` to `false` so the console.log does not run in normal operation:

    Current (inserted in Task 1):
    ```typescript
    const DEBUG_EVENTS = true
    ```

    Replace verbatim with:
    ```typescript
    const DEBUG_EVENTS = false
    ```

    Keep the `logEvent` helper and the `logEvent(event)` call inside the subscribe callback — they are no-ops when DEBUG_EVENTS is false (first line `if (!DEBUG_EVENTS) return`). This way re-diagnosis is a one-line flip instead of re-adding the instrumentation.

    Do NOT delete the DEBUG_EVENTS constant, the logEvent function, or the logEvent(event) call. Do NOT remove the comment block explaining Phase 7.1 gap closure provenance.
  </action>
  <verify>
    <automated>grep -q 'const DEBUG_EVENTS = false' src/server/lib/stream-adapter.ts && grep -q 'function logEvent' src/server/lib/stream-adapter.ts && grep -q 'logEvent(event)' src/server/lib/stream-adapter.ts && grep -q 'switch (ame.type)' src/server/lib/stream-adapter.ts && grep -q 'case "text_delta":' src/server/lib/stream-adapter.ts && grep -q 'case "thinking_delta":' src/server/lib/stream-adapter.ts && grep -q 'case "error":' src/server/lib/stream-adapter.ts && grep -q 'case "start":' src/server/lib/stream-adapter.ts && grep -q 'case "text_start":' src/server/lib/stream-adapter.ts && grep -q 'case "text_end":' src/server/lib/stream-adapter.ts && ! grep -q 'const DEBUG_EVENTS = true' src/server/lib/stream-adapter.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | (! grep -E "src/server/lib/stream-adapter\.ts")</automated>
  </verify>
  <acceptance_criteria>
    - DEBUG_EVENTS gated off: `grep -c 'const DEBUG_EVENTS = false' src/server/lib/stream-adapter.ts` returns 1
    - DEBUG_EVENTS NOT left true: `grep -c 'const DEBUG_EVENTS = true' src/server/lib/stream-adapter.ts` returns 0
    - logEvent helper preserved (for future diagnosis): `grep -c 'function logEvent' src/server/lib/stream-adapter.ts` returns 1
    - logEvent call site preserved: `grep -c 'logEvent(event)' src/server/lib/stream-adapter.ts` returns at least 1
    - Inner switch on ame.type introduced: `grep -c 'switch (ame.type)' src/server/lib/stream-adapter.ts` returns 1
    - text_delta case present with writeSSE: `grep -q 'case "text_delta":' src/server/lib/stream-adapter.ts && grep -q 'event: "text_delta"' src/server/lib/stream-adapter.ts`
    - text_delta payload shape preserved: `grep -q 'data: JSON.stringify({ data: ame.delta })' src/server/lib/stream-adapter.ts`
    - thinking_delta case present: `grep -q 'case "thinking_delta":' src/server/lib/stream-adapter.ts`
    - thinking_delta emits SSE event: `grep -q 'event: "thinking_delta"' src/server/lib/stream-adapter.ts`
    - error case surfaces SSE error event: `grep -q 'case "error":' src/server/lib/stream-adapter.ts && grep -q 'event: "error"' src/server/lib/stream-adapter.ts && grep -q 'ame.error?.errorMessage' src/server/lib/stream-adapter.ts`
    - Lifecycle markers handled (exhaustive switch — no silent fall-through): `grep -q 'case "start":' src/server/lib/stream-adapter.ts && grep -q 'case "text_start":' src/server/lib/stream-adapter.ts && grep -q 'case "text_end":' src/server/lib/stream-adapter.ts && grep -q 'case "thinking_start":' src/server/lib/stream-adapter.ts && grep -q 'case "thinking_end":' src/server/lib/stream-adapter.ts && grep -q 'case "toolcall_start":' src/server/lib/stream-adapter.ts && grep -q 'case "toolcall_delta":' src/server/lib/stream-adapter.ts && grep -q 'case "toolcall_end":' src/server/lib/stream-adapter.ts && grep -q 'case "done":' src/server/lib/stream-adapter.ts`
    - agent_end SSE done preserved (outer switch): `grep -q 'case "agent_end":' src/server/lib/stream-adapter.ts && grep -q 'event: "done"' src/server/lib/stream-adapter.ts`
    - tool_execution_* cases preserved (no regression from Task 1): `grep -c 'case "tool_execution_' src/server/lib/stream-adapter.ts` returns 3
    - Phase 7.1 provenance comment preserved: `grep -q 'Phase 7.1' src/server/lib/stream-adapter.ts`
    - TypeScript compiles clean: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/server/lib/stream-adapter\.ts"` returns nothing (exit 1)
    - Project-wide TypeScript compiles clean: `npx tsc --noEmit -p tsconfig.json` exits 0
    - Dev server starts clean without runtime errors after edit (restart and confirm "Backend running on http://localhost:3001" appears)
  </acceptance_criteria>
  <done>
    stream-adapter.ts's `case "message_update":` block now contains an EXHAUSTIVE inner `switch (ame.type)` covering all 12 AssistantMessageEvent subtypes from pi-ai's types.d.ts. text_delta writes SSE `event: "text_delta"` with `data: { data: ame.delta }` (unchanged client contract). thinking_delta writes a new SSE `event: "thinking_delta"` for reasoning visibility. The `error` subtype is now surfaced as SSE `event: "error"` so upstream stream-level errors cannot vanish silently. Lifecycle markers (start, *_start, *_end, toolcall_*, done) are explicit no-ops — silent fall-through is structurally impossible. DEBUG_EVENTS flag is set to false; logEvent helper preserved for future diagnosis (one-line flip). TypeScript compiles clean and dev server boots clean.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human re-runs SC#3 and SC#4 against the patched stream-adapter, updates 07-UAT.md in place with Re-verification section</name>
  <files>.planning/phases/07-openai-oauth-flow/07-UAT.md</files>
  <read_first>
    - .planning/phases/07-openai-oauth-flow/07-UAT.md (current UAT record — status: FAIL; Test 3 and Test 4 existing Actual blocks remain as historical record)
    - src/server/lib/stream-adapter.ts (post-Task-2 version — confirms fix landed)
    - .planning/debug/stream-events-07-04.log (Task 1's capture — reference for whether fix matches confirmed root cause)
  </read_first>
  <action>
    HUMAN VERIFICATION CHECKPOINT — user re-runs SC#3 and SC#4 live and updates 07-UAT.md IN PLACE. The existing Test 3 and Test 4 historical Actual blocks stay as the original FAIL record; a new `## Re-verification (Phase 7.1 gap closure)` section is appended documenting the new outcomes.

    **Pre-requisites the executor must announce to the user BEFORE pausing:**

    1. Backend dev server must be RESTARTED after Task 2's edit so the fix is loaded:
       ```
       # Stop current backend (Ctrl+C in its terminal), then:
       npm run dev:backend
       ```
       Confirm it prints `Backend running on http://localhost:3001`.

    2. Port 1455 must be free (check: `lsof -nP -iTCP:1455 -sTCP:LISTEN` returns nothing).

    3. Verify OAuth credential is still stored (from the initial UAT run — should persist as long as backend process has not been killed/restarted without re-login):
       ```bash
       curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq .
       ```
       Expected: `{"hasApiKey":...,"hasOAuth":true,"activeMethod":"oauth","oauthExpiry":<epoch-ms>}`.

       If `hasOAuth` is false (credential was lost during backend restart — store is in-memory per Phase 5), re-run OAuth flow first:
       ```bash
       curl -X POST http://localhost:3001/api/auth/oauth/start -H "Content-Type: application/json" -d '{"provider":"openai"}'
       # open authUrl in browser, complete consent, then verify:
       curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq .hasOAuth
       ```

    **Verification steps to present to the user:**

    **Step 1 — Re-run SC#3 (Test 3b from 07-UAT.md):**

    Fire the same chat request that previously produced an empty stream:
    ```bash
    curl -sS -N -X POST http://localhost:3001/api/chat \
      -H "Content-Type: application/json" \
      -d '{
        "provider":"openai",
        "model":"gpt-5.1",
        "message":"Say OK and nothing else"
      }'
    ```

    Capture the full SSE output. Expected POST-fix outcome: the stream contains AT LEAST ONE line matching `event: text_delta` followed by `data: {"data":"..."}` where the delta string is NON-EMPTY, BEFORE the final `event: done` line. Specifically:
    - There MUST be at least one `event: text_delta` line.
    - The concatenation of all `data.data` fields MUST contain visible assistant content (e.g., "OK" or similar).
    - The stream MUST still close with `event: done`.

    If the stream still emits only `event: done` with no text_delta → the fix did NOT work, mark Re-verification as FAIL and describe what Task 1's log showed vs what the fix assumed.

    **Step 2 — Re-run SC#4 (Test 4 from 07-UAT.md — auto-refresh):**

    Capture current oauthExpiry:
    ```bash
    BEFORE_EXPIRY=$(curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq -r .oauthExpiry)
    echo "BEFORE: $BEFORE_EXPIRY"
    ```

    Force-expire the credential:
    ```bash
    curl -sS -X POST "http://localhost:3001/api/auth/oauth/debug/force-expire?provider=openai" | jq .
    ```
    Expected response: `{"status":"ok","provider":"openai","before":<BEFORE_EXPIRY>,"after":<epoch-ms near now>,"message":"Forced expiry on openai OAuth credential. Next chat request will trigger refresh."}`. Record the `after` value.

    Fire a chat request (should trigger refreshOpenAICodexToken mid-request because expires is now in the past, and Phase 5's 60s buffer logic in resolveCredential detects it):
    ```bash
    curl -sS -N -X POST http://localhost:3001/api/chat \
      -H "Content-Type: application/json" \
      -d '{
        "provider":"openai",
        "model":"gpt-5.1",
        "message":"Say PASS and nothing else"
      }'
    ```
    Expected: Stream emits `event: text_delta` events with assistant content AND closes with `event: done`. No `event: error` with a 401 in the data payload (that would mean refresh failed and an expired token was sent to ChatGPT backend).

    Verify expiry advanced:
    ```bash
    AFTER_CHAT_EXPIRY=$(curl -sS "http://localhost:3001/api/auth/status?provider=openai" | jq -r .oauthExpiry)
    echo "BEFORE: $BEFORE_EXPIRY"
    echo "AFTER CHAT: $AFTER_CHAT_EXPIRY"
    # AFTER_CHAT_EXPIRY MUST be strictly GREATER THAN the force-expire `after` value captured above.
    # AFTER_CHAT_EXPIRY should also be GREATER THAN BEFORE_EXPIRY (proving a fresh token was issued
    # and the refresh wasn't a no-op).
    ```

    **Step 3 — Update 07-UAT.md IN PLACE.** Do NOT delete the existing Test 3 / Test 4 Actual blocks or the existing Final Outcome. Append a new section at the BOTTOM of the file (after the existing `---` separator after "Executed at: 2026-04-05"), using this exact skeleton:

    ```markdown
    ## Re-verification (Phase 7.1 gap closure)

    **Phase 7.1 plan:** 07-04-stream-adapter-gap-closure-PLAN.md
    **Re-verified:** <ISO timestamp, e.g., 2026-04-0X>
    **Root cause (from .planning/debug/stream-events-07-04.log):** <Cause A | Cause B | Cause C — one-line description of what the diagnostic showed>
    **Fix applied:** <one-line description of stream-adapter.ts change — e.g., "Exhaustive inner switch on ame.type with text_delta, thinking_delta, error branches">

    ### SC#3 Re-run — Chat stream with OAuth token (Codex model)

    **curl:**
    ```bash
    curl -sS -N -X POST http://localhost:3001/api/chat \
      -H "Content-Type: application/json" \
      -d '{"provider":"openai","model":"gpt-5.1","message":"Say OK and nothing else"}'
    ```

    **Actual (first 20-30 lines of SSE output):**
    ```
    <paste real output here>
    ```

    **text_delta event count:** <N>
    **Concatenated assistant content:** <e.g., "OK">
    **Closing event:** <event: done | event: error>

    **Result:** <PASS | FAIL>

    ---

    ### SC#4 Re-run — Auto-refresh via force-expire + chat

    **BEFORE_EXPIRY (initial):** <epoch-ms value>
    **force-expire response:** <paste JSON>
    **force-expire `after` value:** <epoch-ms value>
    **Chat response (first 20-30 lines of SSE output):**
    ```
    <paste real output here>
    ```
    **AFTER_CHAT_EXPIRY:** <epoch-ms value>
    **AFTER_CHAT_EXPIRY > force-expire `after` value?** <YES | NO>
    **AFTER_CHAT_EXPIRY > BEFORE_EXPIRY?** <YES | NO>

    **Result:** <PASS | FAIL>

    ---

    ### Updated Final Outcome

    **Overall (post-Phase-7.1):** <PASS | FAIL>

    - SC#1 (auth URL returned): PASS (unchanged from initial UAT)
    - SC#2 (status polling + credentials stored): PASS (unchanged from initial UAT)
    - SC#3 (OAuth token works for Codex chat + D-01/D-02 remap): <PASS | FAIL> (WAS FAIL — Phase 7.1 closed the gap)
    - SC#4 (auto-refresh via force-expire + chat): <PASS | FAIL> (WAS SKIPPED — Phase 7.1 empirically validated)
    - SC#5 (port 1455 conflict handled): PASS (unchanged from initial UAT)

    **Phase 7 status:** <COMPLETE | STILL BLOCKED>
    **OAUTH-02:** <VERIFIED | STILL INCOMPLETE>
    **OAUTH-03:** <VERIFIED | STILL INCOMPLETE>

    **Re-verified by:** <name>
    **Re-verified at:** <ISO timestamp>
    ```

    **Step 4 — Update frontmatter.** Change the top-of-file YAML:
    - If the Overall post-Phase-7.1 is PASS: change `status: FAIL` to `status: PASS`.
    - If the Overall post-Phase-7.1 is still FAIL: keep `status: FAIL` (and surface the failure in the re-verification section).
    - Do NOT change the original `executed: 2026-04-05` field (that timestamps the initial UAT). The new re-verification timestamp lives inside the Re-verification section only.

    **Step 5 — Respond with one of these signals** so the executor can proceed:
    - "PASS" — SC#3 and SC#4 both PASS, gap closed, Phase 7 complete
    - "FAIL" — SC#3 or SC#4 still fails, describe what happened (new log data, unexpected behavior)
    - "BLOCKED" — fix works partially but some condition blocks full validation (e.g., OAuth credential lost, backend won't start)
  </action>
  <verify>
    <automated>grep -q 'Re-verification (Phase 7.1 gap closure)' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q '07-04-stream-adapter-gap-closure-PLAN.md' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -qE 'SC#3 Re-run' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -qE 'SC#4 Re-run' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -q 'Updated Final Outcome' .planning/phases/07-openai-oauth-flow/07-UAT.md && grep -qE 'Overall \(post-Phase-7\.1\):\*\* (PASS|FAIL)' .planning/phases/07-openai-oauth-flow/07-UAT.md && ! grep -q '<paste real output here>' .planning/phases/07-openai-oauth-flow/07-UAT.md && ! grep -q '<epoch-ms value>' .planning/phases/07-openai-oauth-flow/07-UAT.md && ! grep -q '<name>' .planning/phases/07-openai-oauth-flow/07-UAT.md</automated>
  </verify>
  <acceptance_criteria>
    - Re-verification section added: `grep -c 'Re-verification (Phase 7.1 gap closure)' .planning/phases/07-openai-oauth-flow/07-UAT.md` returns 1
    - Phase 7.1 plan reference: `grep -q '07-04-stream-adapter-gap-closure-PLAN.md' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Root cause documented: `grep -qE 'Root cause.*Cause [ABC]' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Fix applied documented: `grep -q 'Fix applied:' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - SC#3 Re-run subsection present: `grep -q 'SC#3 Re-run' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - SC#3 captures text_delta event count: `grep -q 'text_delta event count:' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - SC#3 captures concatenated content: `grep -q 'Concatenated assistant content:' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - SC#3 result set: `grep -qE 'SC#3 Re-run.*\n.*\*\*Result:\*\* (PASS|FAIL)' .planning/phases/07-openai-oauth-flow/07-UAT.md` OR `grep -c '**Result:** PASS\|**Result:** FAIL' .planning/phases/07-openai-oauth-flow/07-UAT.md` returns at least 2
    - SC#4 Re-run subsection present: `grep -q 'SC#4 Re-run' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - SC#4 captures BEFORE_EXPIRY: `grep -q 'BEFORE_EXPIRY' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - SC#4 captures AFTER_CHAT_EXPIRY: `grep -q 'AFTER_CHAT_EXPIRY' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - SC#4 captures expiry comparison (refresh proof): `grep -q 'AFTER_CHAT_EXPIRY > force-expire' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Updated Final Outcome present: `grep -q 'Updated Final Outcome' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Overall post-Phase-7.1 verdict set: `grep -qE 'Overall \(post-Phase-7\.1\):\*\* (PASS|FAIL)' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - OAUTH-02 verdict: `grep -qE 'OAUTH-02:\*\* (VERIFIED|STILL INCOMPLETE)' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - OAUTH-03 verdict: `grep -qE 'OAUTH-03:\*\* (VERIFIED|STILL INCOMPLETE)' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Re-verified by filled: `grep -qE 'Re-verified by:\*\* [^<]' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Re-verified at filled (ISO date): `grep -qE 'Re-verified at:\*\* 20[0-9]{2}-' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - No placeholders left unfilled: `! grep -q '<paste real output here>' .planning/phases/07-openai-oauth-flow/07-UAT.md && ! grep -q '<epoch-ms value>' .planning/phases/07-openai-oauth-flow/07-UAT.md && ! grep -q '<name>' .planning/phases/07-openai-oauth-flow/07-UAT.md && ! grep -q '<PASS | FAIL>' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Original FAIL record preserved (historical — not deleted): `grep -c 'FAIL (plumbing-level gap — SSE stream emits no assistant content)' .planning/phases/07-openai-oauth-flow/07-UAT.md` returns 1
    - Frontmatter status updated if PASS (automated check — either status stayed FAIL OR transitioned to PASS): `grep -qE '^status: (PASS|FAIL)$' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Original executed timestamp preserved: `grep -q 'executed: 2026-04-05' .planning/phases/07-openai-oauth-flow/07-UAT.md`
    - Resume signal received from user: one of "PASS" / "FAIL" / "BLOCKED"
  </acceptance_criteria>
  <done>
    User restarted backend with the fix loaded, confirmed OAuth credential present, fired the two curl commands (SC#3 chat + SC#4 force-expire+chat), pasted real outputs into a new `Re-verification (Phase 7.1 gap closure)` section in 07-UAT.md, set the Overall verdict (PASS or FAIL), updated OAUTH-02 and OAUTH-03 status markers, and recorded the re-verification timestamp and name. Original Test 3/Test 4 FAIL Actual blocks kept intact as historical record. Frontmatter status transitioned from FAIL to PASS if gap closed. User signalled with PASS/FAIL/BLOCKED.
  </done>
  <resume-signal>Type "PASS" (SC#3 and SC#4 both green, gap closed), "FAIL" (still broken — describe what happened), or "BLOCKED" (cannot validate — explain)</resume-signal>
</task>

</tasks>

<verification>
**Structural verification (automated, post all tasks):**
- Diagnostic log captured: `test -s .planning/debug/stream-events-07-04.log && grep -q 'Confirmed root cause' .planning/debug/stream-events-07-04.log`
- Fix landed with exhaustive switch: `grep -q 'switch (ame.type)' src/server/lib/stream-adapter.ts && grep -q 'case "text_delta":' src/server/lib/stream-adapter.ts && grep -q 'case "thinking_delta":' src/server/lib/stream-adapter.ts && grep -q 'case "error":' src/server/lib/stream-adapter.ts`
- Diagnostic logging gated off: `grep -q 'const DEBUG_EVENTS = false' src/server/lib/stream-adapter.ts`
- UAT re-verification section added: `grep -q 'Re-verification (Phase 7.1 gap closure)' .planning/phases/07-openai-oauth-flow/07-UAT.md`
- Project-wide TypeScript compiles clean: `npx tsc --noEmit -p tsconfig.json` exits 0

**Functional verification (post-Task-3, manual):**
- SC#3 re-run: `curl -sS -N -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d '{"provider":"openai","model":"gpt-5.1","message":"Say OK"}'` MUST emit at least one `event: text_delta` line before `event: done`
- SC#4 re-run: force-expire + chat + status comparison MUST show oauthExpiry advanced past the force-expire `after` value

**No regressions:**
- SC#1 unchanged: POST /api/auth/oauth/start still returns authUrl
- SC#2 unchanged: status polling still works
- SC#5 unchanged: port 1455 conflict still returns 409 with Codex CLI message
- Anthropic chat path unchanged: text_delta still routed via the same case (the inner switch is provider-agnostic)
- Existing tool_execution_* SSE events unchanged (agent-level switch, not ame-level)
</verification>

<success_criteria>
- `.planning/debug/stream-events-07-04.log` captures real Codex chat event stream with analysis confirming root cause
- `src/server/lib/stream-adapter.ts` message_update case contains an exhaustive inner switch on ame.type covering all 12 AssistantMessageEvent subtypes — silent fall-through structurally impossible
- DEBUG_EVENTS const gated to false after fix lands
- POST /api/chat with provider=openai + gpt-5.1 emits at least one text_delta SSE event with non-empty content before closing with done
- POST /api/auth/oauth/debug/force-expire → POST /api/chat → GET /api/auth/status cycle shows oauthExpiry advanced past the force-expire `after` value (refreshOpenAICodexToken fired)
- 07-UAT.md updated IN PLACE with Re-verification section; frontmatter status transitions from FAIL to PASS if gap closed
- OAUTH-02 and OAUTH-03 verified end-to-end OR gap surfaced with concrete next-steps
</success_criteria>

<output>
After completion, create `.planning/phases/07-openai-oauth-flow/07-04-SUMMARY.md` documenting:
- Files modified: src/server/lib/stream-adapter.ts, .planning/debug/stream-events-07-04.log (new), .planning/phases/07-openai-oauth-flow/07-UAT.md (updated)
- Root cause confirmed (A/B/C — quote the analysis line from the log)
- Exact fix applied (diff-level description of the message_update case change)
- SC#3 and SC#4 re-verification outcomes (PASS/FAIL)
- OAUTH-02 and OAUTH-03 final status (VERIFIED if PASS, document follow-up if FAIL)
- Known limitations: if the fix relied on an assumption that could still break (e.g., pi-ai adds a new AssistantMessageEvent subtype in a future minor version), note it
- Follow-up for Phase 8: the new SSE events `thinking_delta` and `error` are now emitted — Phase 8 UI wiring must decide whether to render them (thinking_delta for reasoning visibility, error for upstream failure surfacing)
</output>
</content>
</invoke>