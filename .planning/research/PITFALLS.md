# Domain Pitfalls

**Domain:** LLM Chat Web Interface (SPA + Backend Proxy with SSE Streaming)
**Project:** Pi AI Chat Web (pi-ai + pi-agent-core POC)
**Researched:** 2026-04-03

---

## Critical Pitfalls

Mistakes that cause rewrites, broken core flows, or fundamentally wrong architecture.

---

### Pitfall 1: Per-Token React Re-renders Destroying UI Performance

**What goes wrong:** Each SSE `text_delta` event triggers a `dispatch()` call that updates the `messages` array in `useReducer`. At ~30 tokens/second, this means 30 full React reconciliation cycles per second. Every render re-processes the entire message list, re-parses Markdown via react-markdown, and re-renders the DOM. The UI becomes visibly laggy within seconds, input becomes unresponsive, and the streaming "feel" is lost entirely.

**Why it happens:** The natural instinct is to `dispatch({ type: 'APPEND_TOKEN', data })` on every SSE event. This works in demos with 5 messages but collapses in real conversations. react-markdown re-parses the entire Markdown string on every render because it has no concept of incremental parsing -- each new token means a full re-parse of the assistant message.

**Warning signs:**
- Input field becomes sluggish during streaming
- Scrolling stutters while tokens arrive
- CPU usage spikes in React DevTools Profiler during streaming
- `message-list` component shows >16ms render times

**Prevention:**
1. **Buffer tokens in a ref, flush via requestAnimationFrame.** The SSE parser writes to `bufferRef.current` (a plain JS array). A rAF loop reads the buffer, calls `dispatch()` once with all accumulated tokens, and clears the buffer. This caps renders at ~60/sec regardless of token rate.
2. **Memoize completed messages.** Only the actively-streaming message needs re-rendering. Wrap completed `UserMessage` and `AssistantMessage` components in `React.memo` with stable keys.
3. **Consider Streamdown over react-markdown.** Vercel's Streamdown library is a drop-in replacement built specifically for streaming AI content. It parses Markdown into blocks, memoizes each block independently, and handles unterminated syntax gracefully. If react-markdown shows performance issues, this is the escape hatch.
4. **Virtualize long message lists.** For conversations exceeding ~50 messages, use `@tanstack/react-virtual` to only mount visible DOM nodes.

**Phase relevance:** Phase 3 (Chat + Streaming). This must be designed correctly from the start -- retrofitting buffering into a dispatch-per-token architecture requires rewriting the entire streaming consumer.

**Confidence:** HIGH (multiple independent sources confirm this is the #1 performance issue in LLM chat UIs)

---

### Pitfall 2: Hono streamSSE Premature Connection Closure

**What goes wrong:** The `streamSSE()` callback in Hono auto-closes the stream when the callback function resolves. If the agent loop emits events asynchronously (via EventEmitter or subscription callbacks), the `streamSSE` callback completes before all events arrive, and the SSE connection closes mid-stream. The frontend sees an abrupt end or connection drop partway through a response.

**Why it happens:** Hono's `streamSSE` has a `finally` clause that closes the stream when the callback returns. The pi-agent-core `Agent` emits events via `subscribe()` callbacks, which are async and may fire after the initial setup code completes. A naive implementation like:

```typescript
streamSSE(c, async (stream) => {
  agent.subscribe((event) => {
    stream.writeSSE({ data: JSON.stringify(event) });
  });
  agent.send(message); // returns before events finish
})
```

...will close the stream almost immediately because `agent.send()` likely returns before the agent loop completes.

**Warning signs:**
- SSE stream ends after only a few tokens
- Frontend shows incomplete responses with no `done` event
- Works for very short responses but fails for longer ones
- Adding `await stream.sleep(1000)` "fixes" it (a red flag for this exact issue)

**Prevention:**
Use a Promise that resolves only when the agent loop completes:

```typescript
streamSSE(c, async (stream) => {
  return new Promise((resolve, reject) => {
    agent.subscribe((event) => {
      if (event.type === 'agent_end' || event.type === 'done') {
        stream.writeSSE({ data: JSON.stringify(event) });
        resolve();
      } else if (event.type === 'error') {
        stream.writeSSE({ data: JSON.stringify(event) });
        reject(event.error);
      } else {
        stream.writeSSE({ data: JSON.stringify(event) });
      }
    });
    stream.onAbort(() => resolve());
    agent.send(message);
  });
}, (err, stream) => {
  // Error callback (third arg) prevents server crash
  stream.writeSSE({ data: JSON.stringify({ type: 'error', message: err.message }) });
});
```

This keeps the callback unresolved until the agent loop signals completion. The `stream.onAbort()` handles client disconnects gracefully. The error callback (third argument) prevents Pitfall 6.

**Phase relevance:** Phase 3 (Chat + Streaming). This is the core of the backend-to-frontend pipeline and must work before anything else streams.

**Confidence:** HIGH (confirmed via Hono GitHub issues #2050 and #2993; both document this exact behavior)

---

### Pitfall 3: SSE Parser Splitting Events Across Chunk Boundaries

**What goes wrong:** The `fetch` + `ReadableStream` approach reads arbitrary byte chunks from the network. A single SSE event (`data: {...}\n\n`) can be split across two or more chunks. Naive parsers that process each chunk independently will either: (a) fail to parse the split JSON, (b) silently drop events, or (c) produce garbled output with replacement characters if a multi-byte UTF-8 character is split.

**Why it happens:** Network chunks do not align with SSE message boundaries. A chunk might end with `data: {"type":"text_del` and the next chunk starts with `ta","data":"hello"}\n\n`. Additionally, `new TextDecoder().decode(value)` without a persistent decoder instance will corrupt multi-byte characters (e.g., emoji, accented Portuguese characters) that span chunk boundaries.

**Warning signs:**
- JSON parse errors in the console during streaming
- Missing tokens or garbled text in assistant responses
- U+FFFD replacement characters appearing in output
- Works fine in English but breaks with non-ASCII content (relevant for a Portuguese-speaking user)

**Prevention:**
1. **Use `TextDecoderStream`** (or a persistent `TextDecoder` instance with `stream: true`) to handle multi-byte character boundaries correctly.
2. **Buffer incomplete lines.** Split on `\n\n` to find complete SSE messages. Keep the trailing incomplete fragment in a buffer for the next chunk.
3. **Use a battle-tested SSE parser library** like `eventsource-parser` (by Rexxars/Sanity) or `parse-sse` (by Sindre Sorhus). These handle all edge cases including multi-line `data:` fields, comments, retry fields, and chunk splitting.
4. **Never roll your own SSE parser** for production -- the spec has subtle edge cases (multi-line data concatenation, BOM handling, comment lines) that hand-rolled parsers miss.

**Phase relevance:** Phase 3 (Chat + Streaming). The `stream-parser.ts` module in the architecture must be built correctly from day one.

**Confidence:** HIGH (SSE spec is well-documented; chunk splitting is a fundamental property of TCP/HTTP streaming)

---

### Pitfall 4: Tool Call Event Ordering and State Corruption

**What goes wrong:** The agent loop can emit interleaved events: `text_delta` tokens mixed with `tool_start`, `tool_update`, and `tool_end` events. If the frontend state reducer does not maintain strict ordering, you get: tool cards appearing before their parent assistant message, tool updates arriving for a tool_id that hasn't had its `tool_start` processed yet, or text appearing after a tool card when it should appear before.

**Why it happens:** In the pi-agent-core agent loop, the LLM may emit text tokens, then decide to call a tool, then emit more text after the tool result. The SSE stream faithfully forwards these in order, but if the frontend processes them asynchronously (especially with the rAF buffering from Pitfall 1), events can be flushed in batches where ordering within the batch matters.

**Warning signs:**
- Tool cards render in wrong positions relative to text
- "Unknown tool ID" errors when processing `tool_update` events
- Tool cards stuck in "running" state (missed `tool_end`)
- Duplicate tool cards appearing

**Prevention:**
1. **Process events sequentially within each batch.** The rAF flush should iterate the buffer in order, applying each event to state one at a time. Never parallelize event processing.
2. **Use a Map for active tool calls.** Track in-progress tools by `id` in a `Map<string, ToolState>`. `tool_start` creates an entry, `tool_update` appends to it, `tool_end` finalizes it. Reject `tool_update`/`tool_end` for unknown IDs (log a warning, don't crash).
3. **Model messages as an ordered array of segments**, not as separate flat message types:

```typescript
type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'tool'; id: string; tool: ToolCardVariant; status: ToolStatus; content: string };

interface AssistantMessage {
  role: 'assistant';
  segments: MessageSegment[];
  streaming: boolean;
}
```

This preserves interleaving naturally -- text before a tool, tool, text after a tool -- without complex index tracking. The current architecture's flat `Message` union type (`role: 'assistant' | 'tool'`) forces tool cards into separate top-level entries, which loses ordering context.

4. **Emit a sequence number from the backend** as part of each SSE event to detect and correct out-of-order delivery (defense in depth).

**Phase relevance:** Phase 3 (Chat + Streaming) for the data model, Phase 4 (Tool Cards) for the rendering. The `Message` type in the architecture currently separates `assistant` and `tool` messages at the top level -- this should be reconsidered before implementation.

**Confidence:** HIGH (documented in LangChain issues and AI SDK patterns; the current architecture's flat message model makes this especially likely)

---

### Pitfall 5: No Automatic Reconnection with fetch-based SSE

**What goes wrong:** The project uses `POST /api/chat` with SSE response (ADR-004). Since `POST` cannot use the native `EventSource` API (GET only), the implementation must use `fetch` + `ReadableStream`. But `fetch` has zero built-in reconnection. If the connection drops mid-stream (network hiccup, laptop sleep/wake, proxy timeout), the response is simply lost. The user sees a frozen incomplete response with no error indication.

**Why it happens:** `EventSource` has built-in reconnection with `Last-Event-ID` and configurable retry intervals. `fetch` does not. Developers assume "SSE has reconnection" without realizing this only applies to the `EventSource` API, not the wire protocol consumed via fetch.

**Warning signs:**
- Incomplete responses after laptop sleep/wake
- No error shown to user when connection drops
- Frontend appears stuck (streaming indicator stays on indefinitely)
- Works perfectly on fast connections, fails silently on flaky ones

**Prevention:**
1. **Implement connection health monitoring.** Set a timeout (e.g., 15 seconds without any SSE event). If exceeded, assume the connection is dead and show an error with a retry option.
2. **Use `@microsoft/fetch-event-source`** or a similar library that wraps `fetch` with reconnection logic, retry strategies, and proper error callbacks. It supports POST, custom headers, and reconnection with Last-Event-ID.
3. **Add a heartbeat event.** Have the backend send a `{ type: "heartbeat" }` SSE event every 5-10 seconds during long tool executions (when no text_delta events flow). This lets the frontend distinguish "server is thinking/executing tools" from "connection is dead."
4. **Design the UI for connection failure.** Show a clear error state with a "Retry" button. Never leave the user staring at a spinner indefinitely.

**Phase relevance:** Phase 3 (Chat + Streaming). ADR-004 notes this limitation ("POST + SSE requer fetch API") but does not prescribe a mitigation. For the POC (local-only, single-user), full reconnection may be overkill, but the timeout + error UI is essential.

**Confidence:** HIGH (fundamental limitation of the fetch API; ADR-004 acknowledges it)

---

## Moderate Pitfalls

Issues that cause significant debugging time or degraded UX but are recoverable.

---

### Pitfall 6: Unhandled Exceptions in streamSSE Crashing the Server

**What goes wrong:** If the agent loop throws an unhandled exception inside the `streamSSE` callback (e.g., LLM API returns 500, tool execution fails unexpectedly, API key is invalid mid-stream), the error can propagate in a way that crashes the Hono server process. Subsequent requests fail to connect until the server is restarted.

**Why it happens:** Hono's `streamSSE` error handling requires the third argument (error callback). Without it, unhandled rejections inside the streaming callback can take down the Node.js process. The pi-agent-core Agent's event emissions during tool execution are a likely source of unexpected errors.

**Warning signs:**
- Server process exits during streaming
- "Connection refused" errors after a failed stream
- Error logs showing unhandled promise rejections
- Works for normal requests but crashes on tool execution errors

**Prevention:**
1. **Always provide the error callback** as the third argument to `streamSSE()`.
2. **Wrap the entire streaming callback in try/catch** and send an `{ type: "error" }` SSE event before closing the stream on failure.
3. **Handle pi-agent-core errors explicitly.** Subscribe to error events from the Agent and forward them as SSE error events rather than letting them propagate.
4. **Use Node.js `process.on('unhandledRejection')` as a safety net** to log and recover rather than crash.

**Phase relevance:** Phase 3 (Chat + Streaming). Add error handling from the very first streaming implementation.

**Confidence:** HIGH (documented in Hono GitHub issue #2164)

---

### Pitfall 7: Agent Recreation Losing Implicit State Beyond Message History

**What goes wrong:** ADR-006 mandates recreating the `Agent` instance on agent/model switch, with history maintained in the frontend and resent as context. But the Agent class may accumulate implicit state beyond the message history: tool execution context, system prompt modifications from harness application, internal caches, or provider-specific session state. Simply replaying message history may not fully restore the agent's operating context.

**Why it happens:** The `Agent` class in pi-agent-core is described as "stateful" (ADR-006). Stateful classes by definition have state beyond their constructor arguments. Without full documentation of what state the Agent accumulates during a session, recreation is a best-guess operation.

**Warning signs:**
- Agent behaves differently after switch-back (e.g., "forgets" harness instructions)
- Tool calls that worked before the switch fail after
- Agent produces subtly different responses with the same history
- System prompt / harness configuration not applied to new Agent instance

**Prevention:**
1. **Explicitly reconstruct all Agent configuration on recreation:** model, tools, system prompt (including harness content), and any other constructor options.
2. **Test the recreation path early** in Phase 3 or Phase 5 by switching agents mid-conversation and verifying behavior continuity.
3. **Inspect pi-agent-core source code** to enumerate all mutable state the Agent class holds. Do this before implementing the switch logic, not after.
4. **Consider limiting what "context" means.** For the POC, the message history may be sufficient. But document what is NOT preserved so the limitation is conscious, not accidental.

**Phase relevance:** Phase 5 (Agent/Model Switching). But the data model for history must support this from Phase 3.

**Confidence:** MEDIUM (ADR-006 acknowledges the trade-off; actual behavior depends on pi-agent-core internals that are not fully documented)

---

### Pitfall 8: react-markdown Choking on Incomplete Markdown During Streaming

**What goes wrong:** During streaming, the assistant message is valid Markdown only when complete. Mid-stream, the content may have: unclosed code fences without closing backticks, partial links like `[text](htt`, incomplete bold/italic markers, or half-rendered tables. react-markdown attempts to parse this as complete Markdown, producing: flash of broken rendering (the entire message suddenly becomes a code block when an opening fence arrives), layout thrashing as the parser alternates between interpretations, or the entire message re-flowing when a closing marker finally arrives.

**Why it happens:** react-markdown uses remark/rehype under the hood, which assume complete input. They are not designed for streaming partial content.

**Warning signs:**
- Text briefly renders as a code block then reverts
- Message layout jumps/shifts during streaming
- Bold text appearing/disappearing as tokens arrive
- Visible flicker when code fences open/close

**Prevention:**
1. **During streaming, render plain text or minimal Markdown.** Only apply full Markdown rendering after the stream completes (the `done` event). This avoids all partial-parse issues at the cost of no inline formatting during streaming.
2. **Use Streamdown** (Vercel's streaming-optimized Markdown renderer). It handles unterminated blocks, incomplete syntax, and incremental rendering natively. It memoizes per-block and lazy-loads code highlighting. This is the recommended solution if inline formatting during streaming is desired.
3. **If using react-markdown, sanitize incomplete syntax before rendering.** Close any open code fences, strip partial links, and balance inline markers. This is fragile and not recommended over Streamdown, but it works for simple cases.

**Phase relevance:** Phase 3 (Chat + Streaming) for the initial implementation, Phase 4 (Tool Cards) for code blocks in tool results.

**Confidence:** HIGH (well-documented issue; remarkjs/react-markdown issues #459 and #899 discuss it extensively)

---

### Pitfall 9: Memory Leak from Uncleaned SSE Connections and Orphaned Agent Loops

**What goes wrong:** The `useChat` hook opens a `fetch` stream for each message sent. If the user navigates away from the chat page, sends a new message before the previous stream completes, or the component re-renders due to agent/model switch, the previous `fetch` connection is not aborted. Orphaned connections accumulate, consuming memory on both client and server. On the server side, orphaned agent loops continue executing tools and consuming LLM tokens even though nobody is listening.

**Why it happens:** `fetch` connections require explicit cleanup via `AbortController`. Without it, the connection persists until the server closes it. React's `useEffect` cleanup function is the standard mechanism, but developers often forget to abort the fetch when the effect re-runs or the component unmounts.

**Warning signs:**
- Network tab shows multiple open connections to `/api/chat`
- Server logs show tool executions for conversations the user has left
- Memory usage grows steadily during a session
- LLM API billing shows unexpected token consumption

**Prevention:**
1. **Create an `AbortController` for every chat request** and pass its signal to `fetch()`.
2. **Abort the previous controller before starting a new request** (in the `sendMessage` function).
3. **Abort on component unmount** via `useEffect` cleanup return function.
4. **Server-side: detect client disconnect** via `stream.onAbort()` in Hono and stop the agent loop. This prevents wasted LLM API calls.
5. **Check if pi-agent-core's Agent has an `abort()` or `cancel()` method** and call it when the client disconnects. If not, this is a limitation to document.

**Phase relevance:** Phase 3 (Chat + Streaming). Must be in the initial `useChat` hook implementation. Especially important because orphaned agent loops waste real money on LLM API calls.

**Confidence:** HIGH (standard React pattern; amplified here because orphaned agent loops cost money)

---

### Pitfall 10: Mutable State vs Event Log Architecture

**What goes wrong:** The developer models the chat as mutable state (directly mutating message objects, toggling tool status flags, appending text to content strings) rather than as an append-only event log projected into UI state. This leads to: state drift between what the server sent and what the UI shows, difficulty debugging "how did we get to this state," inability to replay or recover from errors, and race conditions when multiple event types modify the same state simultaneously.

**Why it happens:** useReducer encourages a "dispatch action, mutate state" pattern that feels like direct mutation. The chat domain, however, is naturally an event stream (SSE events are literally an ordered log). Projecting that log into state is safer than directly mutating state from each event.

**Warning signs:**
- Inconsistent state after rapid event sequences
- Difficulty reproducing bugs ("it only happens sometimes during fast streaming")
- State shows tool as "running" even though "tool_end" was received
- Debugging requires reproducing the exact sequence of events

**Prevention:**
1. **Store the raw event log as the source of truth.** The reducer accumulates events; a selector/memo derives the display state (messages with their segments, tool statuses, streaming flag).
2. **Make the reducer purely additive.** Events are appended, never mutated. Derived state is recalculated from the log.
3. **For the POC, this can be simplified:** keep the current useReducer approach but ensure reducer cases are pure (return new objects, never mutate existing ones) and events are processed in strict order.

**Phase relevance:** Phase 3 (Chat + Streaming). The state management architecture should be decided before implementation, not discovered through debugging.

**Confidence:** MEDIUM (best practice from multiple agent framework authors; the POC's simplicity makes this less critical than in production, but the pattern prevents hard-to-debug issues)

---

## Minor Pitfalls

Issues that cause annoyance or minor bugs but are easily fixable.

---

### Pitfall 11: CSS Scroll-to-Bottom Fighting with User Scrollback

**What goes wrong:** During streaming, the chat auto-scrolls to the bottom on every new token. But if the user scrolls up to re-read earlier messages, the auto-scroll yanks them back to the bottom on the next token (every ~33ms with rAF batching). The chat becomes unusable for reviewing history during streaming.

**Prevention:**
1. **Track user scroll intent.** If `scrollTop + clientHeight < scrollHeight - threshold` (e.g., 100px), the user has scrolled up intentionally. Disable auto-scroll.
2. **Show a "scroll to bottom" button** when auto-scroll is disabled, allowing the user to re-engage.
3. **Re-enable auto-scroll** when the user scrolls back to near the bottom. Use `IntersectionObserver` on a sentinel element at the bottom of the message list.

**Phase relevance:** Phase 3 (Chat + Streaming). Small detail, large UX impact.

---

### Pitfall 12: Encoding SSE Data with Newlines

**What goes wrong:** SSE `data:` fields cannot contain bare newlines -- the `\n\n` sequence terminates an SSE message. If the agent sends JSON containing newlines in string values (e.g., multi-line code in tool results, multi-line bash output), the SSE message is split prematurely and the frontend parser breaks.

**Prevention:**
1. **Verify Hono's writeSSE handles multi-line data.** The SSE spec allows `data: line1\ndata: line2\n\n`, which the client concatenates with newlines. Hono's `writeSSE` may handle this automatically -- test early with multi-line content.
2. **If not, JSON.stringify already escapes newlines** as `\n` within strings, so `data: {"content":"line1\\nline2"}\n\n` is valid. The issue only arises if raw newlines appear in the data field outside JSON strings.
3. **Test with multi-line tool outputs** early (bash commands with multi-line output, file reads with code).

**Phase relevance:** Phase 4 (Tool Cards). Tool results are the most likely source of multi-line content.

**Confidence:** MEDIUM (depends on how Hono's writeSSE handles newlines internally; JSON.stringify provides natural protection)

---

### Pitfall 13: Undocumented pi-ai/pi-agent-core API Surface

**What goes wrong:** The pi-ai and pi-agent-core libraries are relatively new and less documented than mainstream alternatives (Vercel AI SDK, LangChain). API behavior must be discovered through source code reading rather than documentation. Assumptions about method signatures, event types, or configuration options may be wrong, causing bugs that are hard to diagnose.

**Warning signs:**
- TypeScript types don't match runtime behavior
- Events have different shapes than expected from architecture docs
- Methods exist in source but not in published types (or vice versa)
- Breaking changes between minor versions

**Prevention:**
1. **Read the pi-agent-core source code** before implementing. Focus on: `Agent` class constructor options, `subscribe()` event types and shapes, `streamProxy` function signature, tool definition interface (`AgentTool<TParams, TDetails>`).
2. **Build a minimal spike first.** A 20-line script that creates an Agent, subscribes to events, sends a message, and logs all events. This validates the actual API contract against assumptions in the architecture doc.
3. **Pin exact versions** in package.json (not `^` ranges) to avoid surprise breaking changes.
4. **Check if `@mariozechner/pi-web-ui` provides usable components** for the chat interface. The pi-mono monorepo includes a web UI package that may already solve parts of the rendering problem.

**Phase relevance:** Phase 1 (Foundation). Validate the API surface before building on assumptions. This is the single most important early action.

**Confidence:** HIGH (the PROJECT.md explicitly states this is a validation of the stack; unknown API surface is the primary risk of the entire POC)

---

### Pitfall 14: Context Window Overflow on Agent Recreation

**What goes wrong:** ADR-006 specifies that message history is resent as context when recreating an Agent after a switch. Long conversations with extensive tool call results (especially bash output, file contents) can exceed the model's context window. The LLM API returns an error, and the newly created Agent cannot process the conversation.

**Prevention:**
1. **Implement history truncation** when approaching context limits. Keep the system prompt + recent N messages, summarize or drop older ones.
2. **Limit tool result sizes** in the message history. Store only a truncated preview of large tool outputs (e.g., first/last 50 lines of bash output).
3. **Track token count** of the conversation history. The pi-ai library may have token counting utilities; use them to stay within 80% of the model's context window.
4. **For the POC:** conversations are unlikely to be extremely long (single session, local use). But add a warning in the UI when tool results are large.

**Phase relevance:** Phase 5 (Agent/Model Switching). But the data model should support truncation from Phase 3.

**Confidence:** MEDIUM (depends on conversation length; POC single-session use makes this less likely but not impossible with tool-heavy workflows)

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Severity | Mitigation |
|-------|---------------|----------|------------|
| Phase 1: Foundation | **#13** Undocumented pi-ai/pi-agent-core API | High | Build minimal spike script; read source code; verify event shapes before designing |
| Phase 2: Auth + Connection | Minimal streaming pitfalls | Low | Standard API key validation; test with invalid key to verify error path |
| Phase 3: Chat + Streaming | **#1** Per-token re-renders, **#2** Hono streamSSE closure, **#3** SSE parsing, **#5** No reconnection, **#6** Exception crash, **#9** Memory leaks | Critical | This phase has the highest density of critical pitfalls. Budget extra time. Implement rAF buffering, Promise-based stream lifecycle, battle-tested SSE parser, error callback, and AbortController cleanup from the start. |
| Phase 4: Tool Cards | **#4** Event ordering/interleaving, **#8** Incomplete Markdown, **#12** Newline encoding | High | Use segment-based message model (design in Phase 3); test with multi-line tool outputs |
| Phase 5: Agent/Model Switching | **#7** Implicit state loss, **#14** Context overflow | Medium | Inspect Agent source code; implement history truncation; test switch-back behavior |
| Phase 6: Harness | Harness files too large for context window | Low | Validate file sizes; truncate/warn as needed |

---

## Key Takeaway

**Phase 3 is where this project succeeds or fails.** Six of the fourteen pitfalls concentrate there, and they interact with each other: the rAF buffering pattern (Pitfall 1) must preserve event ordering (Pitfall 4); the SSE parser (Pitfall 3) feeds the buffer; the Hono stream lifecycle (Pitfall 2) determines whether events arrive at all; error handling (Pitfall 6) prevents server crashes; and AbortController cleanup (Pitfall 9) prevents resource leaks across the entire stack.

Getting Phase 3 right means building these mechanisms as a cohesive pipeline, not as independent fixes applied after problems emerge. The recommended approach: start with the spike from Pitfall 13 (validate pi-agent-core API), then build the streaming pipeline from server to client as a single vertical slice before adding any UI polish.

---

## Sources

- [Streaming Backends & React: Controlling Re-render Chaos](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/) -- rAF buffering pattern (HIGH confidence)
- [SSE Not Production Ready After a Decade](https://dev.to/miketalbot/server-sent-events-are-still-not-production-ready-after-a-decade-a-lesson-for-me-a-warning-for-you-2gie) -- proxy buffering, reconnection pitfalls (HIGH confidence)
- [Hono streamSSE Issue #2050](https://github.com/honojs/hono/issues/2050) -- premature connection closure, resolved in v3.12.1 (HIGH confidence)
- [Hono Stream Auto-close Issue #2993](https://github.com/honojs/hono/issues/2993) -- auto-close behavior, Promise workaround (HIGH confidence)
- [Hono streamSSE Exception Issue #2164](https://github.com/honojs/hono/issues/2164) -- unhandled exceptions crashing server (HIGH confidence)
- [Hono Streaming Helper Docs](https://hono.dev/docs/helpers/streaming) -- streamSSE API reference (HIGH confidence)
- [eventsource-parser](https://github.com/rexxars/eventsource-parser) -- battle-tested SSE parser library (HIGH confidence)
- [Azure fetch-event-source](https://github.com/Azure/fetch-event-source) -- POST + reconnection for SSE (HIGH confidence)
- [Vercel Streamdown](https://github.com/vercel/streamdown) -- streaming Markdown renderer for AI (HIGH confidence)
- [react-markdown Performance Issue #459](https://github.com/remarkjs/react-markdown/issues/459) -- streaming re-render performance (HIGH confidence)
- [react-markdown Re-render Issue #899](https://github.com/remarkjs/react-markdown/issues/899) -- unnecessary re-renders (HIGH confidence)
- [Chrome Dev: Best Practices for LLM Response Rendering](https://developer.chrome.com/docs/ai/render-llm-responses) -- streaming rendering patterns (HIGH confidence)
- [AI SDK: Markdown Chatbot with Memoization](https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization) -- memoization pattern (HIGH confidence)
- [LangChain Parallel Tool Calls Issue #10196](https://github.com/langchain-ai/langchainjs/issues/10196) -- dropped parallel tool calls during streaming (HIGH confidence)
- [pi-mono Repository](https://github.com/badlogic/pi-mono) -- pi-ai and pi-agent-core source (MEDIUM confidence, limited docs)
- [Node.js Backpressuring in Streams](https://nodejs.org/en/learn/modules/backpressuring-in-streams) -- Node.js stream fundamentals (HIGH confidence)
- [MDN Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) -- SSE spec reference (HIGH confidence)
- [SSE Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html) -- EventSource limitations (HIGH confidence)
- [LLM Agents and Race Conditions](https://medium.com/@bhagyarana80/llm-agents-and-race-conditions-debugging-multi-tool-ai-with-langgraph-b0dcbf14fa67) -- multi-tool race conditions (MEDIUM confidence)
- [Event-driven Agentic Loops](https://boundaryml.com/podcast/2025-11-05-event-driven-agents) -- event log vs mutable state pattern (MEDIUM confidence)
