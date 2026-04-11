# Implementation Plan: Permissions & Interactive Prompts — Review Fixes (Merge Gate)

**Source:** `whats-next.md` + review findings validated against code 2026-04-11.
**Scope:** Wave 1 only (merge gate). Waves 2–3 deferred.
**Branch:** `main` (feature currently in working tree, uncommitted).

## Overview

The Permissions & Interactive Prompts feature landed ~600 LOC across PI and ACP
runtimes. A five-axis review flagged 2 Critical + 6 Important issues. This plan
fixes the 5 items that gate merge: C1, C2, I1, I3, I4. All other findings (I2,
I5, I6, S1–S10) defer to a follow-up PR.

## Architecture Decisions

1. **Validation of C1 lives in `permission-bridge.resolvePrompt`**, not the
   `/respond` route. Reason: closes the hole for any future caller (test code,
   internal tool, new route) — not just the HTTP path. Route-level validation
   remains as first-line defense-in-depth and returns 400 early.

2. **C2 fix uses `AsyncLocalStorage`**, not `EventEmitter`. Reason: zero new
   event-bus machinery, no per-session subscription lifecycle, no leak risk.
   The PI runtime already scopes everything per `prompt()` call — ALS fits that
   shape. Store holds a single `push: (ev: RuntimeEvent) => void` reference.

3. **`chatSessionId` becomes required** in PI chat body validation, not
   synthesized server-side. Reason: silent synthesis hides client bugs; the
   client always has a session id in practice (`use-chat.ts` allocates one).
   Fail-loud with 400.

4. **Read tools auto-allow in `default` and `acceptEdits` modes**. Reason:
   parity with Claude Code default UX. Reads are idempotent and non-mutating;
   forcing a prompt for every `read_file` makes the LLM unusable. `plan` mode
   still allows reads (read-only means read-only, not nothing).

5. **`WRITE_CLASS_TOOLS` cleaned up**, not extended. Dead entries
   (`write_file`, `edit_file`) removed. Adding those tools to `pocTools` is a
   separate feature.

## Dependency Graph

```
session-mode.ts (READ_CLASS_TOOLS export)
    │
    └── pi-runtime.ts (short-circuit reads + AsyncLocalStorage store)
            │
            ├── ask-user-tool.ts (reads ALS store → passes onPendingCreated)
            │
            └── chat.ts (chatSessionId required)

permission-bridge.ts (outcome validation in resolvePrompt)
    │
    └── chat.ts (404/400 error paths on malformed body)

permission-bridge.test.ts (regression coverage for all 5 fixes)
```

## Task List

### Phase 1: Backend correctness (merge gate)

---

#### Task 1: C1 — validate outcome shape in `resolvePrompt`

**Description:** `permission-bridge.resolvePrompt` currently does blind cast of
`outcome` to the target type. A malformed POST body (e.g., `{}`) passes the
`chat.ts` type guard, reaches `resolvePrompt`, gets blind-cast, and
`pi-runtime.ts:179-184` reads undefined fields — allowing the tool call. This
is a privilege escalation reachable from any page on localhost:5173.

**Acceptance criteria:**
- [ ] `resolvePrompt` inspects `pending.kind` before resolving.
- [ ] For `kind === "permission"`: require `outcome.outcome === "cancelled"`
  OR (`outcome.outcome === "selected"` AND `typeof outcome.optionId === "string"`
  AND `optionId` matches one of `pending.options[].optionId`).
- [ ] For `kind === "elicitation"`: require valid discriminant on
  `outcome.action` — `action === "accept"` (with `content` object) OR
  `action === "cancel"` / `"decline"` per ACP SDK types.
- [ ] On invalid shape: **do not** call `pending.resolve` or `pending.reject`,
  return `false`. Caller (route) translates to 400.
- [ ] Malformed POST with valid `id` and empty `{}` response → route returns
  400 "invalid response shape", pending stays in PENDING map.

**Verification:**
- [ ] New unit test in `permission-bridge.test.ts`:
      `resolvePrompt returns false for malformed permission outcome`
- [ ] New unit test: `resolvePrompt returns false for malformed elicitation outcome`
- [ ] Existing tests still pass: `npx tsx --test src/server/agent/permission-bridge.test.ts`
- [ ] Manual check from browser devtools:
      `fetch("/api/chat/respond", {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({id:"<real_pending_id>", response:{}})})`
      returns 400, not 200, and the pending tool call stays blocked.

**Dependencies:** None

**Files likely touched:**
- `src/server/agent/permission-bridge.ts` (modify `resolvePrompt`)
- `src/server/agent/permission-bridge.test.ts` (add tests)
- `src/server/routes/chat.ts` (translate `false` → 400 instead of 404 when
  pending exists but shape invalid; leave 404 path for genuinely missing id)

**Estimated scope:** S (2 files modified, 1 file tests added)

---

#### Task 2: C2 — wire `askUserQuestion` to emit `elicitation_request`

**Description:** `ask-user-tool.ts:33` calls `requestElicitation` without
`onPendingCreated`. The bridge creates `elic_<uuid>` inside the Promise
constructor, so the only way to expose the id is that callback. Today every
PI `askUserQuestion` call hangs in PENDING for 5 minutes then returns
`"askUserQuestion failed: elicitation elic_xxx timed out"`. Spec Slice F unmet.

**Acceptance criteria:**
- [ ] New `AsyncLocalStorage<{ push: (ev: RuntimeEvent) => void }>` exported
  from `pi-runtime.ts` (or a new `pi-runtime-context.ts` if cleaner).
- [ ] `PiRuntime.prompt()` wraps the body of the generator in `store.run({ push }, ...)`
  so tools called during streaming see the store.
- [ ] `ask-user-tool.ts:execute` reads the store, constructs an
  `onPendingCreated` callback that calls
  `store.push({ type: "elicitation_request", id, message, requestedSchema })`,
  and passes it through to `requestElicitation`.
- [ ] If the store is missing (tool invoked outside a PiRuntime prompt),
  `askUserQuestion` returns a clear error instead of hanging — so the failure
  is visible, not a 5-minute timeout.

**Verification:**
- [ ] Runtime smoke test: start `npm run dev`, send a PI prompt that tells
  the LLM "ask me via askUserQuestion whether I prefer option A or B". An
  `ElicitationPrompt` renders in the UI within ~3 seconds (not 5 minutes).
- [ ] Fill the form, click Submit, the LLM continues with the chosen option
  in its next turn.
- [ ] `npm run typecheck` clean.
- [ ] `npx tsx --test src/server/agent/permission-bridge.test.ts` still passes
  (no changes to bridge semantics — only tool-side wiring).

**Dependencies:** None (independent of Task 1).

**Files likely touched:**
- `src/server/agent/pi-runtime.ts` (add ALS, wrap generator)
- `src/server/agent/ask-user-tool.ts` (read ALS, pass callback)

**Estimated scope:** S (2 files)

**Bug reproduction confirmed 2026-04-11.** Live test in PI default mode: LLM
called `askUserQuestion`, permission prompt appeared (orthogonal — see
"incidental finding" below), user allowed once, elicitation hung, 5 minutes
later tool returned literally
`"askUserQuestion failed: elicitation elic_8051199d-6ae6-4957-a055-d970bb6d1dab timed out"`.
Exact failure predicted by static analysis. No `elicitation_request` event
reached the client.

**Incidental finding during repro:** `askUserQuestion` itself triggers the
permission bridge in default mode because it is neither in `READ_CLASS_TOOLS`
nor `WRITE_CLASS_TOOLS` — user gets "pedir permissão pra pedir permissão" UX.
Not in this merge gate, but add to wave 2: short-circuit `askUserQuestion` to
always-allow in the hook (it's an elicitation tool, not a side-effect tool).

---

#### Task 3: I1 — require `chatSessionId` in PI chat body

**Description:** `chat.ts:70-72` makes `chatSessionId` optional. When missing,
`pi-runtime.ts:136` returns `undefined` for the `beforeToolCall` hook — no
permission gating, all tools run. This is a fail-open path.

**Acceptance criteria:**
- [ ] `validateChatBody` returns 400 `"chatSessionId required when runtime=\"pi\""`
  if the field is missing or empty.
- [ ] `PiChatBody.chatSessionId` becomes `string` (non-optional).
- [ ] `pi-runtime.ts:114` signature/assertion can trust it exists; the
  `if (!chatSessionId) return undefined` bypass in `buildBeforeToolCall` is
  removed.
- [ ] `use-chat.ts` client already sends `chatSessionId` — verify, no change
  needed. If it doesn't, fix the client.

**Verification:**
- [ ] Manual: `curl -X POST /api/chat -H "content-type: application/json"
  -d '{"message":"hi","provider":"anthropic","model":"claude-..."}'` → 400.
- [ ] Normal chat from UI still works (client sends the id).
- [ ] `npm run typecheck` clean.

**Dependencies:** None

**Files likely touched:**
- `src/server/routes/chat.ts` (make required in validator)
- `src/server/agent/pi-runtime.ts` (remove undefined guard on chatSessionId)
- `src/client/hooks/use-chat.ts` (verify sends; likely no change)

**Estimated scope:** XS (1–2 files)

---

#### Task 4: I3 + I4 — mode semantics alignment

**Description:** Two bugs in `session-mode.ts` + `pi-runtime.ts` that compose:
(I3) `WRITE_CLASS_TOOLS` references `write_file`/`edit_file` which don't exist
in `pocTools`, so the effective set is `{bash}`. (I4) Default mode prompts for
`read_file` and `list_files` — more invasive than Claude Code default UX.

**Acceptance criteria:**
- [ ] `session-mode.ts` exports `READ_CLASS_TOOLS = new Set(["read_file", "list_files"])`.
- [ ] `WRITE_CLASS_TOOLS` reduced to `new Set(["bash"])` (dead entries removed).
- [ ] `pi-runtime.ts:140-153` short-circuits read-class tools: if
  `READ_CLASS_TOOLS.has(toolName)` and mode is `default` or `acceptEdits`,
  `return undefined` (allow) before any permission bridge call.
- [ ] `plan` mode still allows reads (already does — `isWriteClass` is false
  for reads, so they fall through to `requestPermission`. After this fix,
  plan mode allows reads silently without prompting).
- [ ] `session-mode.test.ts` updated: new test asserts
  `WRITE_CLASS_TOOLS.has("write_file") === false`, and a new test for
  `READ_CLASS_TOOLS.has("read_file") === true`.

**Verification:**
- [ ] Unit tests: `npx tsx --test src/server/agent/session-mode.test.ts` green.
- [ ] Manual smoke: in default mode, ask the LLM to `ls` (bash) → prompt
  appears. Ask to read a file via `read_file` → no prompt, tool runs.
- [ ] Manual smoke: in plan mode, bash is blocked with "plan mode: read-only",
  read_file runs silently.
- [ ] Manual smoke: in acceptEdits mode, bash still prompts, read_file runs
  silently. (Write tools don't exist yet so that branch stays unverified.)

**Dependencies:** None

**Files likely touched:**
- `src/server/agent/session-mode.ts` (add READ_CLASS, trim WRITE_CLASS)
- `src/server/agent/session-mode.test.ts` (assertions)
- `src/server/agent/pi-runtime.ts` (short-circuit reads)

**Estimated scope:** S (3 files)

---

### Checkpoint: Backend correctness

- [ ] `npm run typecheck` clean.
- [ ] `npm run build` clean.
- [ ] `npx tsx --test src/server/agent/permission-bridge.test.ts` green (C1 test added).
- [ ] `npx tsx --test src/server/agent/session-mode.test.ts` green (I3/I4 tests added).
- [ ] Manual end-to-end UAT in browser:
  - PI default mode, ask for `ls` → permission prompt appears → allow once → runs.
  - PI default mode, ask for `read_file` → runs silently, no prompt.
  - PI plan mode, ask for `bash` → blocked.
  - PI plan mode, ask for `read_file` → runs silently.
  - PI default mode, prompt LLM to use `askUserQuestion` → elicitation form
    renders within 3s → fill + submit → LLM continues.
  - Malformed `/respond` POST (empty `{}` body with valid id) → 400, not 200.
- [ ] No regressions in ACP flows (mode popover, allow_always still works).
- [ ] Human review of the full diff before commit.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| C2 doesn't reproduce at runtime (memory S36 says "worked") | Med | Smoke test in Task 2 *before* coding. If it renders today, investigate the path I missed instead of patching. |
| ALS propagation breaks if `agent.prompt()` crosses async boundaries the store doesn't follow | Med | Node ALS follows `await`, `setTimeout`, `Promise.then`. Only breaks with manual thread hops — doesn't apply here. Verify with the Task 2 smoke test. |
| `chatSessionId` required breaks an older client path | Low | Client already sends it per `use-chat.ts`. Grep to confirm before making non-optional. |
| Removing `write_file`/`edit_file` from WRITE_CLASS breaks a future branch that adds those tools | Low | Documented in commit message. Reintroduced when the tools land. |
| C1 validation too strict, rejects a valid ACP SDK payload shape | Med | Cross-check `ElicitationResponse` type from `@agentclientprotocol/sdk` before writing the validator. Existing elicitation-prompt.tsx shape is the ground truth. |

---

## Open Questions

1. ~~**Does C2 reproduce?**~~ **RESOLVED 2026-04-11.** Confirmed in live PI test:
   `askUserQuestion failed: elicitation elic_8051199d-6ae6-4957-a055-d970bb6d1dab timed out`
   after 5-minute timeout. Static analysis was correct.
2. **Is the ElicitationResponse nested shape (`{action: {action: "accept", content}}`) correct per SDK types?** — verify via `@agentclientprotocol/sdk` imports before writing the C1 validator.
3. **Does the client (`use-chat.ts`) actually always send `chatSessionId` today?** — grep-check before making it required (I1).

## How to Resume (fresh context)

This file **is** the handoff. A fresh agent starting from `/clear` will have:
- **CLAUDE.md** — project overview + Permissions & Interactive Prompts section.
- **MEMORY.md** — feedback rules (save location, no circles, UAT mode).
- **whats-next.md** — full review with all 18 findings (C1, C2, I1–I6, S1–S10).
  This plan covers only the 5 merge-gate items; the other 13 live there.
- **This plan** — tasks 1–4, validated, ready to execute.

**Read order for new context:** `whats-next.md` (source of truth for findings)
→ this file (merge-gate tasks) → the 6 files in "Files likely touched" per task.

**Known hook quirk:** The memory `PreToolUse:Read` hook returns only line 1
for files with prior observations. Workaround: `nl -ba <path>` via Bash. Edit
still works because the hook registers the file as read after the nl call
(or after the initial blocked Read).

**Task ordering recommendation:** Task 2 (C2) → Task 4 (I3+I4) → Task 3 (I1)
→ Task 1 (C1). Or batch: Task 1 and Task 2 parallel (disjoint files), then
Task 3 and Task 4 sequential on `pi-runtime.ts`.

---

## Out of Scope (deferred to follow-up PR)

- **I2** — `allow_always` cache key uses unstable `toolCall.title`. Fix: swap
  to `kind ?? title`.
- **I5** — ACP subprocess inherits full parent env. Fix: allow-list.
- **I6** — `AcpSession` instance state corruption on overlapping `prompt()` calls.
- **S1** — `pi-runtime.ts:181` dead `reject_always` branch.
- **S2** — Dead fields in `PendingPermission`/`PendingElicitation`.
- **S3** — `ALLOW_ALWAYS_CACHE` unbounded, PI never populates it.
- **S4** — Test uses `globalThis.setTimeout` monkey-patch.
- **S5** — `chatRoutes.post("/")` missing try/catch around `c.req.json()`.
- **S6** — `acp-session.ts` `initialModeEmitted` flag loses state on reconnect.
- **S7** — `STALL_TIMEOUT_MS = 60_000` too short for long tool calls.
- **S8** — Elicitation required-field check lets falsy booleans pass.
- **S9** — `PermissionPrompt` no disabled state on rapid clicks.
- **S10** — `chat.ts` `history` field not shape-validated.

Batch these into a second PR after Wave 1 ships.
