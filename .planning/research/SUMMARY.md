# Research Summary: Pi AI Chat Web POC

**Project:** Pi AI Chat Web (pi-ai + pi-agent-core validation)
**Domain:** LLM Chat Web Interface — SPA + Backend Proxy with SSE Streaming
**Researched:** 2026-04-03
**Confidence:** MEDIUM-HIGH

---

## Executive Summary

The Pi AI Chat Web POC validates whether `@mariozechner/pi-ai` and `@mariozechner/pi-agent-core` can sustain a chat web experience comparable to Claude.ai/ChatGPT — with real-time streaming, rich tool call visualization, agent switching, model switching, and harness loading. The architecture is a two-process system: a React SPA frontend communicates with a Hono backend via SSE; the backend runs the agent loop, executes tools, and streams `AgentEvent` objects to the browser. This pattern is well-established, maps cleanly to pi-agent-core's subscription model, and has clear precedent in production LLM UIs.

The most important finding across all four research dimensions is that **Phase 3 (Chat + Streaming) is the critical path and highest-risk phase**. Six of fourteen identified pitfalls concentrate there, and they interact: the Hono `streamSSE` lifecycle must be correctly anchored to a Promise that resolves at `agent_end`; the SSE parser must buffer across chunk boundaries; per-token React re-renders must be batched via `requestAnimationFrame`; tool event ordering must use a segment-based message model rather than a flat message list. These mechanisms must be built together as a cohesive pipeline, not fixed individually after problems emerge. Getting Phase 3 right is the condition under which the rest of the project is feasible.

A secondary architectural decision with significant consequences: the `Message` type must model tool calls as segments within an `AssistantMessage` (not as separate top-level entries), or tool interleaving — text before a tool, the tool card, text after the tool — will be lost. This is a data model decision that must be made in Phase 3 and cannot easily be retrofitted in Phase 4.

---

## Key Findings

### Recommended Stack

The stack is anchored by two non-negotiable packages — `@mariozechner/pi-ai@^0.64.0` and `@mariozechner/pi-agent-core@^0.64.0` — which are the validation targets. Everything else was chosen to support them.

**Core technologies:**
- `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core` v0.64.0 — validation targets, pin to same version (lockstep releases from pi-mono monorepo)
- React 19.2 + TypeScript 5.7 — UI framework, required by shadcn/ui; React 19.2 is fully compatible with shadcn/ui CLI v4
- Vite 6.2 (not Vite 8) — Vite 8's Rolldown migration introduces CommonJS interop risks that may break pi-mono package imports; Vite 6 is stable and adequate for a local POC
- Tailwind CSS 4.2 — CSS-first config (no `tailwind.config.ts`); use `@import "tailwindcss"` and `@tailwindcss/vite` plugin
- shadcn/ui CLI v4 — copy-paste components, Tailwind 4 and React 19 native; install via `npx shadcn@latest init` (auto-installs tailwind-merge, clsx, CVA, Radix primitives)
- Hono 4.12 + `@hono/node-server` 1.19 — TypeScript-first backend with built-in `streamSSE` helper; no Express needed
- `react-markdown@10.1` + `remark-gfm@4.0` — markdown rendering; consider Vercel's Streamdown as a fallback for streaming-specific issues
- `react-shiki@0.9` — VS Code-quality syntax highlighting for code blocks; use "web" bundle for POC
- React Router 7.13 — SPA mode, two routes only (`/` and `/chat`); import from `react-router` (not `react-router-dom`)
- `fetch` + `ReadableStream` for SSE client — EventSource API only supports GET; chat needs POST

**Important:** `@mariozechner/pi-web-ui` exists as a complete chat UI with streaming, tool visualization, and artifacts — but it uses Lit web components. Use it as a reference implementation only. Study its `AgentInterface` event mapping, `ChatPanel` orchestration, and tool card patterns to inform the React implementation.

### Expected Features

**Table stakes (all 10 must ship):**
- Streaming token-by-token display (T1) — the foundation everything depends on
- Markdown rendering in responses (T2) — buffer tokens; defer full parse until closing fences arrive
- Code block syntax highlighting (T3) — copy-to-clipboard button on each block
- Message input with Enter-to-send, auto-resize textarea (T4)
- Thinking/loading indicator before first token (T5) — >500ms wait without feedback feels broken
- Stop generation button (T6) — abort signal to backend SSE connection
- Error handling with retry (T7) — actionable inline errors, not generic messages
- Conversation scroll management (T8) — auto-scroll + user-scroll detection
- User/assistant message differentiation (T9)
- API key input and provider auth (T10) — key stored backend-only, never in frontend state

**Differentiators to ship (core POC value):**
- Tool call visualization with type-specific cards (D1) — **the single most important differentiator**; 7+ tool types (bash, read/write, glob/grep, subagent/skill, toolsearch, generic fallback); D1 alone is ~30-40% of frontend dev time
- Agent switcher — Claude Code / Codex at runtime (D2)
- Model switcher via pi-ai registry (D3) — validates `getModels()` / `getProviders()`
- Tool expand/collapse (D5) — keeps chat clean; medium effort, high usability
- Real-time tool execution progress (D7) — running/done/error lifecycle as it happens
- Extended thinking/reasoning display (D6) — collapsible accordion for `thinking_delta` events

**Defer to v2+:**
- Harness loading (D4) — hardcode a default harness for initial testing; add file-picker UI in a later pass
- Conversation persistence, multi-conversation, OAuth, artifacts, RAG, voice, mobile — all explicitly out of scope per PROJECT.md

**Dependency order:** T10 (auth) → T1 (streaming) → T2/T3/T5/T6/T8/T9 (basic rendering) → D3/D2 (model/agent switching) → D1/D5/D7 (tool visualization) → D6/D4 (thinking + harness)

### Architecture Approach

The architecture is a clean two-process system: Vite dev server (`:5173`) proxies `/api/*` to Hono backend (`:3001`), eliminating CORS concerns in development. The backend creates a fresh `Agent` instance per POST `/api/chat` request (not per session), with conversation history sent from the frontend as context. This is simpler than session-based agent persistence and avoids state leaks between requests.

**Major components:**

Frontend:
1. `stream-parser.ts` — stateless async generator that converts raw SSE byte stream into typed `SSEEvent` objects; uses persistent `TextDecoder` with `stream: true` and double-newline buffering
2. `useChat` hook — `useReducer` + SSE stream consumer; owns all message state; must use `requestAnimationFrame` batching for token appends
3. Message rendering — `AssistantMessage` with `segments: (TextSegment | ToolSegment)[]` — not a flat message list; segment model preserves tool interleaving context
4. `ToolCard` router + variant components — dispatches to bash-card, file-card, search-card, etc. by tool type

Backend:
1. `lib/stream-adapter.ts` — **the architecturally critical component**; maps `AgentEvent` → Hono `writeSSE()` calls; must wrap in a Promise that resolves at `agent_end` to prevent premature connection closure
2. `agent/setup.ts` — Agent factory; creates fresh `Agent` instance per request with current model, tools, and system prompt
3. `chat.ts` route — POST `/api/chat` entry point; orchestrates setup → stream-adapter → response
4. `lib/credentials.ts` — in-memory Map; API keys never touch frontend

### Critical Pitfalls

All 14 pitfalls were identified; the 5 most dangerous:

1. **Per-token React re-renders (Pitfall 1, CRITICAL)** — At ~30 tokens/sec, dispatching state on every token causes full reconciliation including react-markdown re-parse. Fix: buffer tokens in `useRef`, flush via `requestAnimationFrame` (~60fps). Must be designed in from Phase 3, not retrofitted.

2. **Hono streamSSE premature closure (Pitfall 2, CRITICAL)** — `streamSSE` callback auto-closes when the function returns. The Agent fires events asynchronously after `agent.prompt()` returns, so a naive implementation closes the stream almost immediately. Fix: wrap the entire streaming body in a Promise that resolves only on `agent_end` or `stream.onAbort()`. Always provide the error callback (third arg) or unhandled exceptions crash the server.

3. **SSE parser chunk splitting (Pitfall 3, CRITICAL)** — Network chunks do not align with SSE message boundaries; multi-byte UTF-8 characters (Portuguese text, emoji) can be split across chunks. Fix: persistent `TextDecoder` with `{ stream: true }`, double-newline buffer. Strongly prefer `eventsource-parser` library over hand-rolled parsing.

4. **Tool event ordering and flat message model (Pitfall 4, HIGH)** — The architecture's current flat `role: 'assistant' | 'tool'` message union loses the interleaving context between text and tool calls. Fix: adopt segment-based model in `AssistantMessage` (`segments: (TextSegment | ToolSegment)[]`) before Phase 4 implementation.

5. **Orphaned fetch connections and agent loops (Pitfall 9, HIGH)** — Without `AbortController` cleanup on component unmount and new-request start, previous fetch connections and their agent loops continue running, consuming LLM API tokens. Fix: `AbortController` per request, abort on new send, abort on unmount; `stream.onAbort()` on backend to stop the agent loop.

Additional high-severity pitfalls requiring Phase 3 attention: react-markdown on incomplete streaming markdown (Pitfall 8), no automatic reconnection with fetch-based SSE (Pitfall 5 — add timeout + error UI at minimum), implicit Agent state loss on recreation (Pitfall 7 — inspect Agent source code before implementing switching).

---

## Cross-Cutting Themes

Three themes appear independently in multiple research dimensions and reinforce each other:

**Theme 1: Phase 3 is the entire bet.** The ARCHITECTURE doc identifies Phase 3 as "THE CRITICAL PHASE." PITFALLS confirms 6 of 14 pitfalls live there. FEATURES shows that every differentiator (D1-D7) depends on streaming working correctly. The recommendation is unanimous: build Phase 3 as a complete vertical spike — backend pi-agent-core integration through SSE adapter through frontend parser through state — before adding any UI polish.

**Theme 2: The segment-based message model is non-negotiable.** ARCHITECTURE recommends it as a design pattern, PITFALLS shows its absence causes Pitfall 4 (tool ordering corruption), FEATURES explains that D1 (tool visualization) requires tracking tool lifecycle within an assistant turn. The `AssistantMessage.segments[]` data model is not a Phase 4 concern — it must be the message schema from Phase 3.

**Theme 3: Validate pi-agent-core API surface before designing.** PITFALLS identifies this as Pitfall 13 (the most important early action). ARCHITECTURE acknowledges the API was studied through source and reference implementations, not official docs. STACK notes the packages are relatively new with limited documentation. The unanimous recommendation: build a minimal spike script (20 lines, create Agent, subscribe, send, log all events) before Phase 1 scaffolding to validate actual event shapes and API contract.

---

## Roadmap Implications

### Recommended Phase Structure

**Phase 0: API Validation Spike** (pre-Foundation)
**Rationale:** Pitfall 13 identifies unknown pi-agent-core API surface as the highest-risk unknown. A minimal Node.js script that creates an Agent, subscribes to events, sends a message, and logs everything to console validates the actual API contract before the UI is designed. 20-30 minutes of work that de-risks Phase 3 fundamentally.
**Delivers:** Confirmed event shapes, confirmed constructor API, confirmed streamFn interface
**Avoids:** Building stream-adapter.ts on wrong assumptions about event structure

**Phase 1: Foundation**
**Rationale:** Every other component depends on project structure, shared types, and the ability to make HTTP calls. This phase is low-risk and well-understood.
**Delivers:** Vite + React + Tailwind + shadcn/ui wired up; Hono skeleton with stub routes; shared TypeScript types (`SSEEvent`, `Message` with segment model, `AppState`); api.ts HTTP client; Vite proxy config
**Must decide here:** The `AssistantMessage.segments[]` data model — this is the correct phase to lock in the type definitions that Phase 3 and Phase 4 build on
**Avoids:** Pitfall 4 (flat message model) by defining segment-based types from the start
**Research flag:** Standard patterns, skip research-phase

**Phase 2: Auth + Connection**
**Rationale:** Nothing else works without authenticated credentials. This is the smallest vertical slice that proves frontend-backend communication works end-to-end.
**Delivers:** `credentials.ts` in-memory store; POST `/api/auth/apikey` with provider test call; `useAuth` hook; `ConnectionPage` UI; navigation to `/chat`
**Implements:** T10 (API key auth)
**Avoids:** OAuth complexity (deferred per ADR-005)
**Research flag:** Standard patterns, skip research-phase

**Phase 3: Chat + Streaming Core** (CRITICAL PATH)
**Rationale:** This is the highest-risk phase and the core validation. Build bottom-up: backend pi-agent-core integration first, then SSE adapter, then frontend parser, then state management, then rendering. All pitfall mitigations (rAF buffering, Promise-based stream lifecycle, SSE parser, error handling, AbortController) must be built together as a cohesive pipeline.
**Delivers:** `agent/tools.ts` (at least one tool); `agent/setup.ts` (Agent factory); `stream-adapter.ts` (AgentEvent → SSE bridge); `chat.ts` route; `stream-parser.ts` (SSE → typed events); `useChat` hook with rAF buffering; `ChatPage` with message list + streaming cursor + T2/T3/T5/T6/T8/T9
**Implements:** T1-T9 (all table stakes except T10 which is Phase 2)
**Must avoid:** Pitfalls 1, 2, 3, 5, 6, 8, 9 — all Phase 3 pitfalls must be designed in, not retrofitted
**Research flag:** HIGH RISK — consider `/gsd:research-phase` before implementation to map exact pi-agent-core AgentEvent types from source; the spike from Phase 0 should make this lower risk

**Phase 4: Tool Visualization**
**Rationale:** Tool cards are a rendering concern that consumes the same SSE events Phase 3 already delivers. The segment-based message model from Phase 1 types makes this clean to implement. Start with a generic fallback card, then add type-specific renderers incrementally.
**Delivers:** `tool-card.tsx` dispatcher; bash-card (terminal block with command + output); file-card (read/write with syntax highlighting); search-card (glob/grep results); subagent/skill-card (expandable with status lifecycle); toolsearch-card; generic fallback; expand/collapse for all cards; real-time progress indicators
**Implements:** D1 (tool visualization), D5 (expand/collapse), D7 (real-time progress)
**Avoids:** Pitfall 4 (event ordering — already solved by segment model from Phase 1); Pitfall 12 (multi-line SSE data — test bash output early)
**Research flag:** MEDIUM — pi-web-ui provides reference patterns for tool card states; standard React rendering

**Phase 5: Agent + Model Switching**
**Rationale:** Switching works by creating a new Agent on the next request with different configuration. Phase 3 already creates agents per request; this phase adds the UI to select which agent/model gets created.
**Delivers:** `models.ts` route (GET `/api/models` wrapping pi-ai registry); `useAgent` hook; `AgentSelector` + `ModelSelector` header components; model list grouped by provider
**Implements:** D2 (agent switcher), D3 (model switcher)
**Avoids:** Pitfall 7 (Agent state loss on recreation — inspect pi-agent-core Agent source before implementing); Pitfall 14 (context window overflow for long tool-heavy conversations)
**Research flag:** LOW — standard API calls; well-documented in pi-agent-core

**Phase 6: Harness + Extended Thinking**
**Rationale:** Harness modifies the system prompt passed to Agent creation. Agent creation from Phase 3 must already work. Extended thinking display is an additive rendering concern once thinking_delta events are flowing.
**Delivers:** `agent/harness.ts` (file loading + system prompt construction); POST `/api/harness/load` and `/api/harness/apply` routes; `useHarness` hook; `HarnessModal` UI; collapsible thinking accordion for `thinking_delta` events
**Implements:** D4 (harness loading), D6 (extended thinking display)
**Avoids:** Context window overflow for oversized harness files (add size warning)
**Research flag:** LOW — file loading + system prompt injection are standard patterns

### Phase Ordering Rationale

- Foundation before everything (obvious dependency order)
- Auth before streaming (streaming requires valid credentials)
- Streaming before tool cards (tool cards consume streaming events — can't render what doesn't arrive)
- Tool cards before agent switching (tool cards are a rendering concern; agent switching changes what runs the agent — independent, but tool cards reveal event structure issues that agent switching must not break)
- Harness last (most additive, lowest architectural risk, system prompt injection is well-understood)
- Phase 0 spike before all of it (validate pi-agent-core API contract; the entire POC depends on the stream-adapter mapping being correct)

### Research Flags

Needs `/gsd:research-phase` during planning:
- **Phase 3 (Streaming Core):** Map exact `AgentEvent` type shapes from pi-agent-core source code. Confirm `agent.prompt()` vs `agent.send()` method names. Verify Hono `streamSSE` third-arg error callback behavior in current version. Phase 0 spike partially substitutes for this.

Standard patterns, skip research-phase:
- **Phase 1 (Foundation):** Vite + React + Tailwind + Hono scaffold is well-documented
- **Phase 2 (Auth):** Standard API key validation pattern
- **Phase 5 (Switching):** Standard API call + state management
- **Phase 6 (Harness):** Standard file reading + system prompt injection

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified via npm, versions confirmed, compatibility checked across React 19 / Tailwind 4 / shadcn/ui CLI v4 |
| Features | HIGH | Feature landscape analyzed directly against Claude.ai, ChatGPT, OpenWebUI, LobeChat, LibreChat; table stakes / differentiators clearly separated |
| Architecture | HIGH | SPA + Backend Proxy + SSE is well-established; two critical components (stream-adapter, stream-parser) have concrete implementation patterns in the research |
| Pitfalls | HIGH | 14 pitfalls identified, most with HIGH-confidence sources (Hono GitHub issues, react-markdown issues, SSE spec documentation); pi-agent-core-specific behavior is MEDIUM |
| pi-ai/pi-agent-core API surface | MEDIUM | Documented through source reading and pi-web-ui reference, not official docs. Phase 0 spike is the only true validation. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Exact pi-agent-core AgentEvent shapes** — architecture and pitfall research are based on source reading; Phase 0 spike will confirm or refute the assumed event types (`message_update`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `agent_end`)
- **Agent constructor API** — confirm `new Agent({ initialState: { model, tools, systemPrompt }, streamFn })` is current; pi-mono is pre-1.0 and method signatures may have changed in 0.64.0
- **`streamProxy` vs `streamSimple`** — the architecture references `streamSimple` as the `streamFn` for backend use; confirm this is the correct variant for a Node.js server (not browser proxy mode)
- **Hono streamSSE third-arg error callback** — referenced in Pitfall 6 as required; verify behavior in Hono 4.12 specifically (issue was reported on 3.x)
- **Tailwind CSS 4 + shadcn/ui CLI v4 + Vite 6 combination** — likely compatible but untested in this exact stack; shadcn/ui docs target Vite 6 explicitly, which is favorable
- **react-shiki bundle size** — 695KB (web bundle) gzipped impact on initial load; may warrant lazy loading or core bundle with explicit language list

---

## Sources

### Primary (HIGH confidence)
- [pi-mono GitHub repo](https://github.com/badlogic/pi-mono) — pi-ai and pi-agent-core source, event types, Agent class
- [pi-web-ui DeepWiki](https://deepwiki.com/badlogic/pi-mono/6-@mariozechnerpi-web-ui) — reference implementation patterns
- [Hono Streaming Helper docs](https://hono.dev/docs/helpers/streaming) — streamSSE API, error callback behavior
- [Hono GitHub issue #2050, #2993](https://github.com/honojs/hono/issues/2050) — streamSSE premature closure, Promise workaround
- [Hono GitHub issue #2164](https://github.com/honojs/hono/issues/2164) — unhandled exceptions crashing server
- [React 19.2 release](https://react.dev/blog/2025/10/01/react-19-2) — compatibility with shadcn/ui CLI v4
- [Vite 6 docs](https://vite.dev/releases) / [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) — version choice rationale
- [Tailwind CSS 4.0 release](https://tailwindcss.com/blog/tailwindcss-v4) — CSS-first config, `@tailwindcss/vite` plugin
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — CLI v4 compatibility
- [React Router 7 SPA mode](https://reactrouter.com/how-to/spa) — two-route SPA pattern
- [Chrome Dev: LLM Response Rendering](https://developer.chrome.com/docs/ai/render-llm-responses) — streaming rendering best practices
- [react-markdown issue #459, #899](https://github.com/remarkjs/react-markdown/issues/459) — streaming re-render performance
- [eventsource-parser](https://github.com/rexxars/eventsource-parser) — battle-tested SSE parser

### Secondary (MEDIUM confidence)
- [Vercel Streamdown](https://github.com/vercel/streamdown) — streaming-optimized Markdown renderer fallback
- [Building Custom Agents with PI (Gist)](https://gist.github.com/dabit3/e97dbfe71298b1df4d36542aceb5f158) — verified API patterns
- [SSE Still Wins for LLM Streaming in 2026](https://procedure.tech/blogs/the-streaming-backbone-of-llms-why-server-sent-events-(sse)-still-wins-in-2025) — protocol choice validation
- [Streaming Backends & React (SitePoint)](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/) — rAF buffering pattern
- [AI Chat UI Best Practices](https://thefrontkit.com/blogs/ai-chat-ui-best-practices) — scroll management, input patterns

---

*Research completed: 2026-04-03*
*Ready for roadmap: yes*
