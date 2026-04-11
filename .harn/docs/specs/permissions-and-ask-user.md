# Spec: Permission Modes & Interactive Prompts (AskUserQuestion)

**Status:** Draft — awaiting human review before PLAN phase
**Author:** Claude (via spec-driven-development skill)
**Date:** 2026-04-11
**Related:** ADR-0006 (agent-recreation-on-switch), HANDOFF-STATEFUL.md, project-home-cwd.md

---

## 1. Objective

Add first-class **permission mode cycling** and **interactive user prompts** to the pi-ai-poc chat experience, so the web UI reaches parity with the "Shift+Tab modes + AskUserQuestion" experience of the Claude Code CLI — but across **three runtimes**:

1. **claude-acp** — external Claude Code agent via ACP subprocess
2. **codex-acp** — external Codex agent via ACP subprocess
3. **PI runtime** — our own agent loop driven by `@mariozechner/pi-agent-core`

### What the user gets

- A **mode chip** in the chat header showing the current permission mode (e.g. `default`, `acceptEdits`, `plan`, `bypassPermissions`). Clicking the chip cycles through the modes the active agent advertises. Mode state is mirrored into the underlying runtime via ACP `session/set_mode` (or the PI-runtime equivalent).
- **Inline permission prompts** in the message list whenever the agent requests per-tool approval. Options are rendered as `allow_once / allow_always / reject_once / reject_always` buttons (kinds defined by the ACP spec). The user's choice is returned to the agent and the tool call proceeds or fails accordingly.
- **Inline elicitation prompts** rendered from an ACP `ElicitationRequest` schema. Supports multi-choice (enum), free text, boolean, number, and string-array fields — enough to cover "which library should we use?"-style questions.
- **Uniform frontend** — all three runtimes emit events in the same ACP-native shapes (`SessionModeState`, `PermissionOption`, `ElicitationSchema`), so the chat UI has a single renderer per event type.

### Why

- Today `acp-session.ts:120-127` auto-approves every ACP `requestPermission`, silently collapsing the CLI's per-tool consent UX. This is a POC correctness gap: if the POC is meant to validate that pi-ai + pi-agent-core can sustain a Claude Code-class chat, then the consent surface must exist.
- The PI runtime currently runs tools without any mode awareness. "Plan mode" (read-only) is impossible, and the user cannot intervene on destructive operations.
- AskUserQuestion-style prompts are part of the Claude Code tool vocabulary. Without forwarding them, chat conversations on complex tasks silently stall or take wrong turns.

### Success criteria (testable)

1. **Mode cycle — claude-acp:** Opening a chat session with the claude-acp agent shows a mode chip in the header populated from the agent's advertised `availableModes`. Clicking the chip N times cycles through N modes and each click emits `session/set_mode` to the agent. Verified by inspecting the ndjson stream to the subprocess.
2. **Mode cycle — codex-acp:** Same as above with codex-acp. Whatever modes codex-acp advertises are what we render — we do not hard-code a mode list.
3. **Mode cycle — PI runtime:** Selecting the PI runtime shows a chip with four modes (`default`, `acceptEdits`, `plan`, `bypassPermissions`). Cycling updates per-session mode state that influences tool execution on the next turn.
4. **Per-tool permission — claude-acp:** Running a prompt that causes Claude Code to request bash permission renders an inline card in the message list with the ACP options. Clicking `Allow Once` proceeds; clicking `Reject Once` causes the agent to receive a rejected outcome and surface an error. Auto-approval path in `acp-session.ts:120-127` is removed.
5. **Per-tool permission — codex-acp:** Same as above, verified with a codex-acp session.
6. **Per-tool permission — PI runtime:** In `default` mode, the PI runtime's `beforeToolCall` hook pauses the tool call, emits a `permission_request` event with the same PermissionOption shape, and waits on the user's response (or `signal.abort`). Allow proceeds; reject becomes a `{ block: true, reason }` result that the loop serialises as a tool error.
7. **Elicitation — claude-acp/codex-acp:** When the agent sends an `ElicitationRequest` (form mode), an inline form renders per `requestedSchema`. Submitting the form sends back an `ElicitationResponse` with `action: "accept"` and the typed content. Dismissing sends `action: "cancel"`.
8. **Elicitation — PI runtime:** The PI runtime exposes an `askUserQuestion` tool (added to the default tool set in `src/server/agent/tools.ts`) that, when invoked by the LLM, emits the same `elicitation_request` event, waits on the user via the same bridge, and returns the typed answer to the LLM as the tool result.
9. **Mode respect in PI runtime:**
   - `plan` → `beforeToolCall` blocks every write-class tool before any prompt (read-only enforcement).
   - `acceptEdits` → writes auto-pass; bash still prompts in default.
   - `bypassPermissions` → no prompts at all; all tools run.
10. **No regressions:** Existing text streaming, tool-call visualisation, agent/model switching, and harness picker continue to work on all three runtimes.

---

## 2. Tech Stack

No new runtime dependencies. We will use what is already in `package.json`:

- `@agentclientprotocol/sdk` — already provides `SessionMode*`, `PermissionOption*`, `ElicitationRequest`, `SetSessionModeRequest/Response`, `ElicitationCapabilities`. Confirmed in `node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts`.
- `@mariozechner/pi-agent-core` — `beforeToolCall?: (ctx, signal?) => Promise<BeforeToolCallResult | undefined>` hook is the primary PI-runtime interception point. Confirmed in `node_modules/@mariozechner/pi-agent-core/dist/types.d.ts:174`.
- `@mariozechner/pi-ai` — we will add one new tool definition (`askUserQuestion`) using the existing `Tool` type.
- React 19 / shadcn/ui — existing `Dialog` primitive (`src/client/components/ui/dialog.tsx`) is unused today but available if we decide a modal is better than inline.

### What we will NOT add

- No new form library. Elicitation forms render with plain HTML inputs + existing shadcn/ui primitives. (Elicitation schemas are shallow; a JSON-schema-driven generator is out of scope for the POC.)
- No persistence of `allow_always` rules across server restarts. Scope is "until the AcpSession ends" — see Boundaries.
- No new IPC layer. The "permission bridge" is an in-process `Map<requestId, deferred>` plus SSE out + POST in, same as the existing chat route.

---

## 3. Commands

```bash
npm run dev              # Frontend (Vite :5173) + Backend (:3001) via concurrently
npm run dev:frontend     # Vite only
npm run dev:backend      # tsx watch only
npm run build            # Production build (Vite)
npm run typecheck        # tsc --noEmit (NOTE: verify script name — see Open Questions)
```

No new scripts are needed.

---

## 4. Project Structure

### New files

```
src/server/agent/
├── permission-bridge.ts       # Pending request registry (Map<id, deferred>) for PI runtime
├── session-mode.ts            # Mode state + default mode set for PI runtime
└── ask-user-tool.ts           # askUserQuestion tool definition for PI runtime

src/client/components/chat/
├── permission-prompt.tsx      # Inline card rendering PermissionOption[] with buttons
├── elicitation-prompt.tsx     # Inline card rendering a schema-driven form
└── mode-chip.tsx              # Header chip showing current mode, cycles on click

src/client/hooks/
└── use-interactive-prompts.ts # Pending prompt state + response dispatch

.harn/docs/specs/
└── permissions-and-ask-user-plan.md  # Written in PLAN phase (not yet)
```

### Files modified

```
src/server/agent/runtime.ts          # Extend RuntimeEvent discriminated union
src/server/agent/acp-session.ts      # Remove auto-approve; forward request_permission + session_mode + elicitation
src/server/agent/acp-session-registry.ts  # Wire the new event types through
src/server/agent/pi-runtime.ts       # beforeToolCall integration + mode-aware tool filtering
src/server/agent/tools.ts            # Register askUserQuestion tool
src/server/routes/chat.ts            # New POST endpoint for prompt responses (or reuse /api/chat/:sessionId/respond)
src/server/lib/stream-adapter.ts     # Emit new event types on the SSE wire
src/server/lib/runtime-sse.ts        # Serialise new event types
src/client/lib/types.ts              # New SSEEvent variants + response types
src/client/hooks/use-chat.ts         # Pipe new event types into ChatState
src/client/components/chat/chat-header.tsx     # Mount <ModeChip />
src/client/components/chat/chat-layout.tsx     # Mount <PermissionPrompt /> / <ElicitationPrompt />
src/client/components/chat/message-list.tsx    # Accept per-message prompt attachment if inline-in-thread
```

### Where tests go

`.harn/docs/specs/permissions-and-ask-user-plan.md` (written in PLAN phase) will define the test matrix. No dedicated tests directory exists today — we'll add minimal unit tests alongside the new modules: `src/server/agent/permission-bridge.test.ts`, `src/server/agent/session-mode.test.ts`. UI verification is manual UAT.

---

## 5. Code Style

Follow existing conventions. Example of the target shape for the new `permission-bridge.ts`:

```ts
import type { PermissionOption, RequestPermissionOutcome } from "@agentclientprotocol/sdk"

interface PendingPermission {
  id: string
  sessionId: string
  toolCallId: string
  options: PermissionOption[]
  resolve: (outcome: RequestPermissionOutcome) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

const PENDING = new Map<string, PendingPermission>()
const DEFAULT_TIMEOUT_MS = 5 * 60_000

export const requestPermission = (
  sessionId: string,
  toolCallId: string,
  options: PermissionOption[],
  signal?: AbortSignal,
): Promise<RequestPermissionOutcome> => {
  return new Promise((resolve, reject) => {
    const id = `perm_${crypto.randomUUID()}`
    const timer = setTimeout(() => {
      PENDING.delete(id)
      reject(new Error(`permission ${id} timed out`))
    }, DEFAULT_TIMEOUT_MS)

    const pending: PendingPermission = {
      id, sessionId, toolCallId, options,
      resolve: (o) => { clearTimeout(timer); PENDING.delete(id); resolve(o) },
      reject: (e) => { clearTimeout(timer); PENDING.delete(id); reject(e) },
      timer,
    }
    PENDING.set(id, pending)
    signal?.addEventListener("abort", () => pending.reject(new Error("aborted")))
  })
}

export const resolvePermission = (id: string, outcome: RequestPermissionOutcome): boolean => {
  const pending = PENDING.get(id)
  if (!pending) return false
  pending.resolve(outcome)
  return true
}
```

Key conventions (from observing existing code):

- `const` arrow functions for top-level helpers; `function` declarations fine where hoisting matters.
- Named exports only — no default exports in server code.
- No comments unless the WHY is non-obvious (see `CLAUDE.md` global instructions).
- TypeScript strict — no `any` except at third-party boundaries.
- Paths use `@/` alias on client, relative on server.
- shadcn/ui primitives are imported from `@/components/ui/*`.

---

## 6. Testing Strategy

- **Unit tests (minimal):** `permission-bridge.test.ts` asserts timeout, resolve, reject, abort-signal behaviour. `session-mode.test.ts` asserts mode transitions and tool-classification for plan mode.
- **Integration (manual UAT, documented):** A checklist in `permissions-and-ask-user-plan.md` covering every success-criteria row above, executed against each runtime once the slice lands.
- **Type-level verification:** `npm run typecheck` must pass on every commit (Tasks in the PLAN phase will include this as an acceptance gate).
- **Smoke via dev server:** `npm run dev` + manual click-through; regression check against text streaming and agent switching.
- **No network mocking:** the existing smoke tests (`03-SMOKE-TEST.md`) already exercise real ACP subprocesses. Follow the same approach. Per the user's `feedback_testing` memory, integration-style manual validation is preferred over mocked stubs.

### Out of scope

- End-to-end browser tests (no Playwright in the repo today; adding one is its own project).
- Performance benchmarks.
- Accessibility audit (the POC will preserve keyboard access on buttons, but full a11y is future work).

---

## 7. Boundaries

### Always do

- Time out pending prompts with a default of 5 minutes; surface a clear error event if a prompt is unanswered.
- Wire `AbortSignal` from `beforeToolCall` and `AcpSession` cancellation into pending prompts — if the session dies, every pending promise rejects.
- On session end, flush the `PENDING` map and reject everything (no leaks).
- Respect the ACP `elicitation` capability handshake: declare `ElicitationCapabilities` during `initialize` and only handle elicitation when the agent uses it.
- Keep all new events inside the existing SSE channel; do not open a second WebSocket.

### Ask first

- Changing the ACP SDK version (we rely on experimental `ElicitationRequest` — behaviour may shift).
- Adding new runtime dependencies (no form libraries, no validation libs beyond what's already shipped).
- Changing the chat wire protocol in a way that breaks `use-chat.ts` consumers outside the prompt feature.
- Storing any state to disk (we are local-only and state-free today).

### Never do

- Silently auto-approve any permission request after this lands. The only "auto" behaviour allowed is mode-driven (`bypassPermissions` → auto-allow; `plan` → auto-block writes without prompting).
- Persist `allow_always` rules past the AcpSession lifetime (prevents POC scope creep into an ACL system).
- Couple the frontend to a specific agent — the chip, permission card, and elicitation form read ACP-shaped events, not agent-specific ones.
- Introduce a separate event shape for the PI runtime. PI runtime events use the ACP-native shapes per the decision in this spec.
- Block the LLM stream on a prompt response for longer than the timeout.

---

## 8. Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                       React chat UI                         │
│  ┌──────────┐   ┌──────────────┐   ┌───────────────────┐    │
│  │ ModeChip │   │ PermissionP. │   │ ElicitationPrompt │    │
│  └────┬─────┘   └──────┬───────┘   └────────┬──────────┘    │
│       │                │                    │               │
│       ▼                ▼                    ▼               │
│             use-chat.ts (ChatState extended)                │
│                          │                                  │
│                  fetch POST /api/chat/:sid/respond          │
│                          ▲                                  │
│                          │                                  │
│                  SSE (new event variants)                   │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  Backend (Hono)          │                                  │
│                          │                                  │
│  routes/chat.ts ◄────────┘                                  │
│   │                                                         │
│   ├─► RuntimeEvent stream (new variants: session_mode_state,│
│   │     permission_request, elicitation_request)            │
│   │                                                         │
│   ├─► AcpSession (claude-acp | codex-acp)                   │
│   │     - handle session/set_mode                           │
│   │     - forward request_permission → bridge → SSE         │
│   │     - forward elicitation → bridge → SSE                │
│   │                                                         │
│   └─► PiRuntime                                             │
│         - session-mode.ts (mode state per session)          │
│         - beforeToolCall → check mode → if "default":       │
│             bridge.requestPermission(...) → SSE → await     │
│         - askUserQuestion tool → bridge.requestElicitation  │
│                                                             │
│  permission-bridge.ts (shared in-memory registry)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Open Questions (to resolve during PLAN / early IMPLEMENT)

1. **Does claude-acp advertise `availableModes` out of the box?** If not, we need a synthetic fallback for the chip. Verify in Slice 1.
2. **Does codex-acp advertise `availableModes`?** Same as above.
3. **Does claude-acp actually emit `ElicitationRequest` today, or is the tool still `AskUserQuestion` with a different wire shape?** If the latter, we may need to translate. Verify in Slice 3.
4. **Where does the user's response POST land?** Reuse the existing session route or add `/api/chat/:sessionId/respond`? Recommendation: add a new route, keep chat streaming untouched.
5. **PI runtime mode persistence scope:** session-only. Confirmed by "Never persist" boundary. Still flag this decision clearly in the mode-chip UI.
6. **`allow_always` semantics for PI runtime:** `allow_always` for what exact scope? Proposal: `(toolName, sessionId)` pair. A different instance of the same tool with different args still uses the cached allow for that session. Confirm in PLAN phase.
7. **Rejection → tool error UX:** when the user rejects, the tool result becomes an error. Does that error bubble into the message list as a failed tool card, or as its own event type? Proposal: failed tool card, no new variant. Confirm in PLAN phase.
8. **Typecheck command name:** `CLAUDE.md` lists build/dev but not typecheck. Verify in PLAN phase whether `npm run typecheck` exists or needs to be added.

---

## 10. Assumptions made while writing this spec

1. "Codex" means the ACP agent `codex-acp` already listed in `.harn/config/acp-agents.json`, confirmed by the user that the binary is available. Not the deprecated OpenAI Codex model.
2. "Claude Code" means the `claude-acp` ACP agent, not a Claude API call from our server.
3. "PI" and "PI runtime" mean our server-side agent loop using `@mariozechner/pi-agent-core`, separate from the ACP subprocess path.
4. The ACP `ElicitationRequest` feature is the correct target for AskUserQuestion parity, even though it's marked experimental. If the external agents do not use it yet, we will still build the frontend machinery for it.
5. The mode chip is the only mode-cycling UX. No Shift+Tab keybind. Chosen by the user in the spec conversation.
6. Full scope: mode cycle + per-tool prompts + elicitation, across all three runtimes. Chosen by the user in the spec conversation.
7. `allow_always` persistence is session-scoped only.
8. A single shared `permission-bridge.ts` backs both PI and ACP paths for pending-prompt state. The alternative (two parallel bridges) was rejected for code duplication.

**→ Correct any of these now, or I'll move to PLAN phase with them.**

---

## 11. Next phases

- **PLAN:** `.harn/docs/specs/permissions-and-ask-user-plan.md` — slice the work into 5-7 thin vertical cuts, each ending in a green commit. Draft slices (pending human approval):
  - Slice A: RuntimeEvent + SSEEvent schema extension + permission-bridge skeleton (no behaviour change).
  - Slice B: ACP mode cycling end-to-end (chip + set_mode + session_mode_state event).
  - Slice C: ACP per-tool permission end-to-end (remove auto-approve, route via bridge, render inline card).
  - Slice D: ACP elicitation end-to-end (ElicitationCapabilities handshake + inline form).
  - Slice E: PI runtime mode state + beforeToolCall integration.
  - Slice F: PI runtime askUserQuestion tool + bridge reuse.
  - Slice G: UAT pass on all three runtimes + doc sweep.
- **TASKS:** extracted from the plan slices, one focused commit per task.
- **IMPLEMENT:** slice by slice per `incremental-implementation` skill.
