# Feature Landscape: LLM Chat Web Interface

**Domain:** LLM Chat Web Application (POC for pi-ai + pi-agent-core validation)
**Researched:** 2026-04-03
**Confidence:** HIGH (based on direct analysis of Claude.ai, ChatGPT, OpenWebUI, LobeChat, LibreChat, and community best practices)

---

## Table Stakes

Features users expect from any LLM chat interface in 2026. Missing = product feels broken.

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| T1 | **Streaming token-by-token display** | Every major LLM UI streams. A response that waits until completion feels broken by 2026 standards. | Med | SSE is the de facto standard. Buffer incomplete markdown before rendering. Must handle partial code blocks, partial bold/italic tags gracefully. |
| T2 | **Markdown rendering in responses** | All LLM outputs use markdown. Unformatted raw markdown is unreadable. | Med | Need streaming-aware markdown parser. Defer code block rendering until closing fence arrives or show progressive rendering with "streaming" indicator. Use `marked` or `react-markdown`. |
| T3 | **Code block syntax highlighting** | Developers (the target user) expect highlighted code. Monospace-only feels amateur. | Low | Use `shiki` or `prism`. Language detection from fence info string. Copy-to-clipboard button on each block. |
| T4 | **Message input with send/submit** | Fundamental interaction pattern. | Low | Enter to send, Shift+Enter for newline. Auto-resize textarea for longer prompts. |
| T5 | **Thinking/loading indicator** | Users need feedback that something is happening before first token arrives. Latency > 500ms without indicator feels like the app is frozen. | Low | Show "thinking..." or spinner between user message send and first `text_delta` event. |
| T6 | **Stop generation button** | Users must be able to abort a response. Saves API cost, respects user time. Every major chat UI has this. | Low | Prominent during streaming, hidden otherwise. Sends abort signal to backend SSE connection. |
| T7 | **Error handling with retry** | Network failures, API errors, rate limits are common. Silent failures are unacceptable. | Med | Inline error below last user message. "Retry" button that resends the same request. Actionable error messages, not generic "something went wrong." |
| T8 | **Conversation scroll management** | New tokens must not cause layout thrash. Auto-scroll to bottom during streaming, but stop auto-scroll if user scrolls up to read history. | Med | CSS that allows response container to grow without shifting. Detect user scroll intent to pause auto-scroll. Resume auto-scroll when user scrolls back to bottom. |
| T9 | **User/assistant message differentiation** | Users must instantly distinguish their messages from the assistant's. | Low | Alignment changes (user right, assistant left), different backgrounds, labels or icons. Do not rely on color alone (accessibility). |
| T10 | **API key input for provider auth** | POC requires connecting to LLM providers. OAuth is stretch; API key is the minimum viable auth. | Low | Secure input field (type=password), validation on submit, clear success/error feedback. Key stored in memory only (POC constraint). Never sent to frontend JS context -- proxy handles it. |

## Differentiators

Features that set this POC apart from a basic chat wrapper. Not expected in every LLM UI, but directly validate the pi-ai + pi-agent-core stack thesis.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **Tool call visualization with type-specific cards** | The core differentiator of this POC. Claude.ai shows minimal tool info; ChatGPT hides tool calls behind "browsing..." labels. Showing rich, type-specific tool cards (bash terminal, file viewer, search results, subagent cards) proves pi-agent-core's event system works in a web UI. | High | 7+ tool types need distinct renderers: `bash` (terminal block with command + output), `read`/`write` (file path + content with syntax highlighting, diffs for write), `glob`/`grep` (search result list), `subagent`/`skill` (expandable card with status lifecycle), `toolsearch` (tool list), generic fallback (name + params JSON + result). Each card shows real-time progress via `tool_execution_start` -> `update` -> `end` events. |
| D2 | **Agent switcher (Claude Code / Codex)** | Validates pi-agent-core's ability to instantiate different agents at runtime. Most chat UIs are single-agent. Multi-agent switching mid-session with context preservation is rare. | Med | Dropdown or toggle in header. On switch: create new Agent instance, replay conversation history as context, update available models. Must handle auth-per-provider (agent on provider A may not have auth for provider B). Visual indicator of active agent. |
| D3 | **Model switcher per provider** | Validates pi-ai's model registry (`getModels()`, `getProviders()`). Users of Claude.ai and ChatGPT can switch models; this proves pi-ai's registry works the same way. | Med | Dropdown populated from `getModels(provider)`. Grouped by provider. Show model name and any relevant metadata. Must refresh on agent switch (different agent = different provider = different model list). |
| D4 | **Harness loading (CLAUDE.md, AGENTS.md, skills, hooks)** | Unique to this POC. No mainstream chat UI loads external agent configuration files. This validates that pi-agent-core's harness system can be driven from a web UI. | Med | File picker or path input. Parse and apply harness content to system prompt. Visual indicator that harness is active. Show harness name/path so user knows what's loaded. Must handle: file not found, invalid format (partial load), oversized harness (context window warning). |
| D5 | **Tool call expand/collapse** | Keeps the chat clean while allowing drill-down into tool details. claude-devtools proved this pattern is valuable: expandable cards with syntax-highlighted content for Read calls, inline diffs for Edit calls. | Med | Default: collapsed with summary (tool name + status). Expanded: full params, output, timing. Must work during streaming (card starts collapsed with spinner, expands to show result when done). |
| D6 | **Extended thinking/reasoning display** | Claude and other reasoning models emit `thinking_delta` events. Displaying them in a collapsible "thinking" section is now standard in Claude.ai and LobeChat. | Med | Collapsible accordion labeled "Thinking..." or similar. Shows streaming thinking tokens. Auto-collapses when thinking phase ends and text generation begins. Uses `<details>` pattern or custom accordion. |
| D7 | **Real-time tool execution progress** | Shows tool lifecycle (started -> running -> done/error) as it happens via AgentEvent streaming. Most chat UIs show tools only after completion. Real-time progress is a meaningful UX improvement. | Med | Spinner/progress indicator on active tool cards. Status transitions: `tool_execution_start` (show card with spinner) -> `update` (update card content) -> `end` (finalize card, show result or error). |

## Anti-Features

Features to deliberately NOT build in this POC. Including them would increase scope without validating the core hypothesis.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|--------------|-----------|-------------------|
| A1 | **Conversation persistence / history** | POC is in-memory only. Adding a database adds infrastructure complexity without validating the pi-ai + pi-agent-core stack. | In-memory conversation state. User refreshes = clean slate. This is acceptable for single-user technical validation. |
| A2 | **Multi-conversation management** | Managing multiple conversations requires database, routing, and UI complexity (sidebar with conversation list, search, delete). None of this validates the core stack. | One active conversation at a time. "New conversation" button clears state. |
| A3 | **User authentication (app login)** | Single-user POC. No other users will access it. Adding auth adds nothing to stack validation. | No app-level auth. Only provider auth (API key) matters. |
| A4 | **OAuth flow for providers** | OAuth requires redirect handling, token refresh, popup management. API Key validates the same streaming/tool/agent capabilities with 10% of the effort. | API Key first. OAuth is explicitly a stretch goal per ADR-005. |
| A5 | **Artifacts / side panel code execution** | Claude.ai's Artifacts and ChatGPT's Canvas are major features (side-by-side code preview, interactive charts). But they validate a different hypothesis (code execution UX), not the pi-ai streaming/agent/tool hypothesis. | Tool call cards show code output inline. No separate execution environment. |
| A6 | **RAG / document upload / knowledge base** | OpenWebUI and LobeChat have extensive RAG features. But RAG validates retrieval pipelines, not the core pi-ai streaming and agent switching thesis. | Out of scope entirely. No file upload for context injection. |
| A7 | **Voice / audio / TTS / STT** | Multimodal input is table stakes for consumer products but irrelevant for a developer-focused POC validating text-based agent interactions. | Text-only input and output. |
| A8 | **Conversation branching / forking** | Advanced feature in some UIs (LobeChat, Canvas Chat). Adds significant state management complexity. | Linear conversation only. No branching, no regeneration with different params. |
| A9 | **Plugin / extension system** | LobeChat has 100+ plugins, OpenWebUI has Pipelines. Building extensibility infrastructure is a product-stage concern, not a POC concern. | Tools are defined by pi-agent-core's AgentTool system. No user-installable plugins. |
| A10 | **Mobile responsiveness** | Desktop browser only. Responsive design takes significant CSS effort for zero validation value. | Desktop-first, fixed-width layout. If it looks okay on a laptop screen, that's sufficient. |
| A11 | **Feedback collection (thumbs up/down)** | Standard in production chat UIs. Useless in single-user POC where the "user" is also the developer. | No feedback mechanism. Developer evaluates quality by inspection. |
| A12 | **Inline file editing / terminal** | Claude.ai and some tools offer inline code editing. This validates a code editor UX, not the streaming/agent/tool hypothesis. | Read-only display of tool outputs. No editing of files from the chat UI. |

## Feature Dependencies

```
T10 (API Key auth) ──> T1 (Streaming) ──> T2 (Markdown rendering) ──> T3 (Code highlighting)
                                      │
                                      └──> T5 (Thinking indicator)
                                      │
                                      └──> T6 (Stop generation)
                                      │
                                      └──> T8 (Scroll management)

T10 (API Key auth) ──> D3 (Model switcher) ──> D2 (Agent switcher)
                                                     │
                                                     └──> D4 (Harness loading)

T1 (Streaming) ──> D1 (Tool call cards) ──> D5 (Expand/collapse)
                                         │
                                         └──> D7 (Real-time tool progress)

T1 (Streaming) ──> D6 (Extended thinking display)

T7 (Error handling) is cross-cutting — needed by all features that make API calls.
T9 (Message differentiation) is needed once T1 works.
```

### Dependency Summary

1. **Auth first** (T10): Nothing works without a valid provider connection.
2. **Streaming second** (T1): The backbone. All display features depend on receiving events.
3. **Basic rendering third** (T2, T3, T5, T6, T8, T9): Make the chat usable.
4. **Model/agent switching fourth** (D3, D2): Validate pi-ai registry and pi-agent-core agent instantiation.
5. **Tool visualization fifth** (D1, D5, D7): The most complex and most valuable differentiator.
6. **Harness and thinking sixth** (D4, D6): Additional validation points, lower risk.

## MVP Recommendation

### Must ship (validates the hypothesis):

1. **T1-T10 (all table stakes)** -- Without these, the POC is not a chat interface. They are the foundation.
2. **D1 (Tool call cards)** -- The single most important differentiator. If pi-agent-core's events can drive rich tool visualization in a browser, the stack thesis is validated.
3. **D2 (Agent switcher)** -- Validates multi-agent capability. Core to the POC hypothesis.
4. **D3 (Model switcher)** -- Validates pi-ai's model registry. Relatively low effort given the agent switcher infrastructure.

### Should ship (strengthens validation):

5. **D5 (Tool expand/collapse)** -- Makes D1 usable when there are many tool calls. Medium effort, high usability impact.
6. **D7 (Real-time tool progress)** -- Differentiates from showing tools only after completion. Validates AgentEvent streaming granularity.
7. **D6 (Extended thinking display)** -- If the model supports thinking, displaying it proves event handling works for all event types.

### Can defer (nice to have):

8. **D4 (Harness loading)** -- Important validation point but can be deferred to a second pass. Hardcode a default harness for initial testing.

## Complexity Budget

| Complexity | Count | Features |
|------------|-------|----------|
| Low | 6 | T3, T4, T5, T6, T9, T10 |
| Medium | 8 | T1, T2, T7, T8, D2, D3, D4, D5, D6, D7 |
| High | 1 | D1 (tool call visualization with 7+ type-specific renderers) |

**Total estimated effort:** D1 alone may take 30-40% of the frontend development time. Plan accordingly -- start with a generic tool card, then add type-specific renderers incrementally.

## Sources

- [Open WebUI Features](https://docs.openwebui.com/features/) -- Comprehensive feature list for the leading open-source LLM UI
- [AI Chat UI Best Practices](https://thefrontkit.com/blogs/ai-chat-ui-best-practices) -- Concrete design recommendations for streaming, accessibility, layout
- [LobeChat vs Open WebUI vs LibreChat Comparison](https://blog.elest.io/the-best-open-source-chatgpt-interfaces-lobechat-vs-open-webui-vs-librechat/) -- Feature landscape of leading open-source alternatives
- [SSE Streaming Best Practices for LLM Apps](https://tpiros.dev/blog/streaming-llm-responses-a-deep-dive/) -- Token-by-token rendering patterns
- [Chrome Render LLM Responses](https://developer.chrome.com/docs/ai/render-llm-responses) -- Official Chrome guidance on rendering streamed LLM output
- [Claude DevTools](https://github.com/matt1398/claude-devtools) -- Reference implementation for tool call inspection UI (expandable cards, syntax-highlighted reads, inline diffs)
- [assistant-ui Chain of Thought](https://www.assistant-ui.com/docs/guides/chain-of-thought) -- UI component patterns for thinking/reasoning display
- [SSE Still Wins for LLM Streaming in 2026](https://procedure.tech/blogs/the-streaming-backbone-of-llms-why-server-sent-events-(sse)-still-wins-in-2025) -- Protocol choice validation
- [LibreChat vs LobeChat Comparison 2026](https://openalternative.co/compare/librechat/vs/lobechat) -- Market positioning data
- [Open WebUI Alternatives 2026](https://dev.to/jaipalsingh/11-best-open-webui-alternatives-for-enterprise-llm-chat-2026-2mjc) -- Broader ecosystem context
