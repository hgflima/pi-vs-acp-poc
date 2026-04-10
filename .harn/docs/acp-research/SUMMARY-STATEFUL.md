# Summary — ACP Stateful Sessions

**Plan:** `.harn/docs/acp-research/PLAN-STATEFUL.md`
**Executed:** 2026-04-10
**Branch:** `feat/acp-stateful`
**Status:** code complete, build passes, manual smoke tests deferred

## Objective

Replace the stateless per-request ACP model with a stateful session registry
so conversation context lives in a long-running subprocess instead of being
replayed from client history on every prompt. Also fix the parallel bug where
`PiRuntime` silently ignored `opts.history`.

## Phases executed (one commit per phase)

| Phase | Commit | Change |
|---|---|---|
| A1 | `361c8a22` | `AcpSession` class — init/prompt/close/isDead lifecycle, per-prompt stall timer, kill cascade only in close() |
| A2 | `75ac76c9` | `acp-session-registry` — chatId→session map, per-chat mutex (`runExclusive`), 15min idle reaper |
| A3 | `baab1c4f` | `chat.ts` routes ACP via registry, body requires `chatId`, DELETE `/api/chat/session/:chatId`, `AcpRuntime` deleted, SIGTERM/SIGINT shutdown hook in `index.ts` |
| A4 | `d719d61a` | Frontend `chat-layout` generates UUID chatId, rotates on New Chat / runtime switch / agent switch; useEffect cleanup fires `deleteAcpSession` on unmount / chatId change; `use-chat` threads chatId into body; `api.ts` gains `deleteAcpSession` |
| A5/A6 | — | Verification-only, no code (abort → `connection.cancel`, stall timer per-prompt confirmed via grep) |
| A7 | `25c96094` | Frontend watches error state, rotates chatId on "subprocess exited" / "session terminated" / "failed to start acp session" patterns |
| B1 | `94048bfe` | `pi-runtime` now calls `agent.replaceMessages(opts.history)` before prompt — previously ignored |
| B2 | `7e362a04` | `use-chat` captures prior messages via ref, builds `history` array using `toAgentHistoryMessage` helper (user as string; assistant with placeholder usage/stopReason) |

## Files touched

### Backend
- **New:** `src/server/agent/acp-session.ts` (350 lines)
- **New:** `src/server/agent/acp-session-registry.ts` (115 lines)
- **Modified:** `src/server/agent/acp-agents.ts` (import moved from `./acp-runtime` to `./acp-session`)
- **Modified:** `src/server/agent/pi-runtime.ts` (+4 lines — history via replaceMessages)
- **Modified:** `src/server/routes/chat.ts` (ACP branch rewritten, DELETE route added, chatId validation)
- **Modified:** `src/server/index.ts` (SIGTERM/SIGINT handlers)
- **Deleted:** `src/server/agent/acp-runtime.ts` (-368 lines)

### Frontend
- **Modified:** `src/client/components/chat/chat-layout.tsx` (chatId state + rotateChatId + useEffect cleanup + error-driven rotation)
- **Modified:** `src/client/hooks/use-chat.ts` (chatId in ACP config, history builder for PI)
- **Modified:** `src/client/lib/api.ts` (deleteAcpSession helper)

### Docs
- **Modified:** `.harn/docs/acp-research/00-SETUP.md` (package rename note)
- **Modified:** `.harn/docs/acp-research/03-SMOKE-TEST.md` (appended ST1–ST8 stateful matrix)
- **Modified:** `.harn/docs/acp-research/PLAN-STATEFUL.md` (status: done)

## Verification performed

- **Build:** `npm run build` passes after every phase.
- **Anti-pattern greps (all clean):**
  - `killCascade` only in `acp-session.ts`, only inside `close()` method
  - `new ClientSideConnection(() => ...)` factory form everywhere
  - `sendBeacon` not used in client
  - `AcpRuntime` / `acp-runtime` references: zero
  - `body.history` read only in PI branch of `chat.ts`
  - `body.chatId` read only in ACP branch of `chat.ts`
- **Smoke import test:** `tsx --eval 'import("./src/server/routes/chat.ts")'` succeeds — wiring loads without errors.

## Deviations from the plan

1. **Phase 0 doc discovery:** executed via inline reading of `acp-runtime.ts`,
   `runtime.ts`, `acp-agents.ts`, `pi-runtime.ts`, `chat.ts`, `index.ts`,
   `pi-agent-core/dist/agent.d.ts`, and `pi-ai/dist/types.d.ts`. The plan's
   Phase 0 was effectively done concurrently with A1.
2. **`AcpAgentSpec` relocation:** plan A1 left this import pointing at the
   legacy `./acp-runtime`. A1 already moved the interface into `acp-session.ts`
   and A3 updated `acp-agents.ts` to import from the new home. This avoided a
   broken import when `acp-runtime.ts` was deleted in A3.
3. **A5/A6 produced no commit** — the plan acknowledged both phases would be
   zero-code if A1 was executed correctly, which turned out to be the case.
4. **A7 error handling:** only the frontend rotation was added (A7 #2 from
   plan). The backend already covered #1 and #3 via the `isDead` check in
   `AcpSession.prompt` (A1) and the reaper in the registry (A2).
5. **Phase V smoke tests (ST1–ST8):** not executed live — they require an
   interactive UI session and the dev server running. Test matrix is fully
   documented in `03-SMOKE-TEST.md` for manual execution.
6. **Placeholder assistant fields in B2:** frontend `toAgentHistoryMessage`
   uses zero-filled usage and `stopReason: "stop"` for assistant messages
   because those fields aren't tracked in client state. `pi-agent-core` may
   or may not accept this — needs smoke test ST1 to confirm.

## Outstanding / to-do before ship

- **Manual smoke tests:** run ST1–ST8 from `03-SMOKE-TEST.md`. ST1 is the
  highest risk (verify PI history actually works with our placeholder
  assistant shape).
- **Pre-existing TypeScript errors** in `stream-adapter.ts`, `tools.ts`,
  `pi-runtime.ts`, `setup.ts`, `auth.ts`, `runtime-sse.ts` — 14 total, not
  introduced by this work. Vite build ignores these (tsx runtime is
  permissive). Fix separately if `npm run build` is ever gated on
  `tsc --noEmit`.
- **Branch merge:** `feat/acp-stateful` has 8 commits diverged from `main`,
  needs PR and merge.

## Gotchas captured during execution

- `Read` tool behavior in this session: prior observations meant most Read
  calls returned only line 1, forcing a switch to `cat -n` via Bash for
  full-file reads. Files remained registered for Edit tool use.
- Hook false-positives: after Edit succeeded, a reminder about needing to
  Read first kept firing. Ignored because the edit landed.
- `git rm` pre-stages the deletion — don't re-`git add` the deleted path
  in subsequent `git add` commands (error: "pathspec did not match").
- `tsconfig.node.json` does strict typechecking but `npm run build` only
  runs Vite (frontend), so server-side `tsc --noEmit` errors don't block
  ship.
