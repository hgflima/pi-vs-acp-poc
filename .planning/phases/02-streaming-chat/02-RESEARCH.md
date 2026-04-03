# Phase 02: Streaming Chat - Research

**Researched:** 2026-04-03
**Domain:** Real-time streaming chat (SSE + pi-agent-core Agent + React rendering)
**Confidence:** HIGH

## Summary

This phase builds the complete streaming pipeline: user message enters from a React frontend, reaches a Hono backend that creates a pi-agent-core `Agent` instance, subscribes to `AgentEvent` emissions, adapts them to SSE format via `streamSSE`, and streams them to the frontend where a `fetch + ReadableStream` parser consumes events, updates React state via `useReducer`, and renders the growing response as Markdown with syntax-highlighted code blocks.

The pi-agent-core `Agent` class is well-designed for this use case. It provides `subscribe()` for event listening, `prompt()` to initiate a conversation turn (returns a Promise that resolves when the entire agent loop finishes), and `abort()` for cancellation. The key insight from reading the source is that `Agent.subscribe()` fires synchronously during `prompt()` execution, meaning the SSE adapter must be wired up BEFORE calling `prompt()`. The Agent emits fine-grained events: `agent_start`, `message_start`, `message_update` (containing `assistantMessageEvent` with `text_delta`, `thinking_delta`, etc.), `message_end`, `tool_execution_start/update/end`, `turn_end`, and `agent_end`.

For this phase (no tool execution yet), the critical events are `message_update` with `assistantMessageEvent.type === "text_delta"` for streaming text tokens, `message_start`/`message_end` for lifecycle, and `agent_end` for completion. The frontend SSE parser maps these to the already-defined `SSEEvent` types from Phase 1 (`text_delta`, `done`, `error`). React-markdown handles progressive rendering by re-rendering on each accumulated content update. React-shiki provides code block highlighting via a custom `code` component passed to react-markdown.

**Primary recommendation:** Use pi-agent-core `Agent` class directly (not the lower-level `agentLoop` function). Wire `Agent.subscribe()` to Hono's `streamSSE.writeSSE()` using a Promise anchor pattern to keep the stream open until `agent_end` fires or the client disconnects.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Flat layout with differentiated backgrounds -- full-width messages, user with `bg-muted` rounded, assistant without background. Code blocks full-width. Similar to Claude.ai/ChatGPT.
- **D-02:** Icons with labels -- user icon (lucide User) and assistant icon (lucide Bot or Sparkles) with name beside ("You" / "Assistant").
- **D-03:** Header shows agent name + active model (e.g. "Claude Code . claude-sonnet-4-6") + New Chat button. Agent/model switching UI comes in Phase 4, for now just displays static info.
- **D-04:** "Thinking" indicator before first token: three animated pulsing dots in the assistant message area. Disappears when first token arrives.
- **D-05:** During streaming: blinking cursor after last character of text. Disappears when stream ends.
- **D-06:** Stop button replaces Send button in input area during streaming. Click aborts via AbortController. Already-received text is kept in the message.
- **D-07:** Auto-grow textarea: starts with 1 line, grows up to ~6 lines as user types, then internal scroll. Send/stop button to the right. Enter sends, Shift+Enter newline (CHAT-10).
- **D-08:** Empty state: centered greeting with icon + "Como posso ajudar?" + 2-3 clickable suggestion chips (e.g., "Explique este codigo", "Escreva um teste").
- **D-09:** Dark theme for syntax highlighting -- Shiki with github-dark or similar. Code blocks with dark background stand out from text.
- **D-10:** Progressive rendering during streaming -- react-markdown re-renders per token. Open code blocks show raw text until closed, then apply syntax highlighting. Accept temporary imperfections.
- **D-11:** Copy button on hover at top-right corner of code blocks. Appears on hover, copies content to clipboard.

### Claude's Discretion
- Exact Shiki theme choice (github-dark, one-dark-pro, or similar)
- Exact content of suggestion chips in empty state
- Exact dimensions (max-width of chat, paddings, spacing)
- Dot and cursor animation (CSS keyframes, durations)
- Handling of markdown edge cases during streaming (nested blocks, partial lists)
- Auto-scroll with pause on scroll-up implementation (CHAT-07)
- Exact layout of inline error with retry button (CHAT-09)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-01 | User sends message, sees tokens streaming in real time | Agent.prompt() + subscribe() -> SSE -> fetch+ReadableStream parser -> useReducer state update |
| CHAT-02 | Backend executes agent loop via pi-agent-core, emits AgentEvents as SSE | Agent class with subscribe(), streamSSE adapter, Promise anchor pattern |
| CHAT-03 | Frontend parses SSE stream via fetch + ReadableStream (not EventSource) | Custom SSE line parser on ReadableStream, POST body support |
| CHAT-04 | Responses rendered as Markdown with syntax-highlighted code blocks | react-markdown + remark-gfm + react-shiki ShikiHighlighter custom code component |
| CHAT-05 | "Thinking..." indicator before first token (latency < 500ms) | CSS animated dots, toggled off on first text_delta event |
| CHAT-06 | Stop generation button aborts stream via AbortController | Frontend AbortController passed to fetch; backend Agent.abort() on client disconnect |
| CHAT-07 | Auto-scroll during streaming, pause when user scrolls up | scrollIntoView or scrollTop manipulation with scroll event listener to detect user scroll-up |
| CHAT-08 | Visual differentiation between user and assistant messages | D-01 flat layout: user bg-muted rounded, assistant no background, icons per D-02 |
| CHAT-09 | Error handling inline with retry button | SSE error event -> chat.error state -> inline alert with retry that re-sends last message |
| CHAT-10 | Input with Enter to send, Shift+Enter for newline | Textarea with onKeyDown handler, auto-grow via scrollHeight measurement |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mariozechner/pi-ai` | 0.64.0 | LLM API (getModel, streamSimple) | Validation target -- non-negotiable |
| `@mariozechner/pi-agent-core` | 0.64.0 | Agent runtime (Agent, AgentEvent, subscribe) | Validation target -- non-negotiable |
| `hono` | 4.12.10 | Backend HTTP + SSE streaming via streamSSE | Already installed, streaming helper built-in |
| `react` | ^19.2.0 | UI framework | Already installed |
| `lucide-react` | 1.7.0 | Icons (User, Bot/Sparkles, Send, Square, Copy, etc.) | Already installed, shadcn/ui default |

### New Dependencies (must install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-markdown` | 10.1.0 | Render assistant markdown responses | Standard React markdown renderer, ESM-only, supports custom components |
| `remark-gfm` | 4.0.1 | GitHub Flavored Markdown (tables, strikethrough, tasklists) | Required for rich LLM response rendering |
| `react-shiki` | 0.9.2 | Syntax highlighting for code blocks | React wrapper for Shiki, VS Code-quality highlighting, supports `delay` prop for streaming throttling |

### shadcn/ui Components (must add via CLI)
| Component | Purpose | When to Add |
|-----------|---------|-------------|
| `textarea` | Chat input with auto-grow | Chat input component |
| `scroll-area` | Scrollable message list | Message list container |
| `alert` | Inline error display with retry | Error handling (CHAT-09) |
| `separator` | Visual separation in header/layout | Layout refinement |
| `tooltip` | Copy button tooltip on code blocks | Code block copy (D-11) |
| `badge` | Status indicators | Header agent/model display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-shiki | @shikijs/rehype (rehype plugin) | rehype plugin integrates at markdown AST level but harder to control streaming behavior; react-shiki as custom component gives more control over progressive rendering |
| react-markdown | streamdown.ai | Purpose-built for streaming markdown but adds dependency and API to learn; react-markdown is simpler, well-known, and "good enough" with accepted temporary imperfections (D-10) |
| Custom SSE parser | eventsource-parser npm | Small utility but adds dependency for something that's ~30 lines of code for our use case |

**Installation:**
```bash
npm install react-markdown remark-gfm react-shiki
npx shadcn@latest add textarea scroll-area alert separator tooltip badge
```

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)
```
src/
├── client/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── chat-layout.tsx        # Full page layout (header + messages + input)
│   │   │   ├── chat-header.tsx        # Agent name + model + New Chat button
│   │   │   ├── message-list.tsx       # ScrollArea with auto-scroll logic
│   │   │   ├── user-message.tsx       # User message bubble (bg-muted)
│   │   │   ├── assistant-message.tsx  # Assistant message with markdown rendering
│   │   │   ├── markdown-renderer.tsx  # react-markdown + remark-gfm + code block component
│   │   │   ├── code-block.tsx         # react-shiki + copy button
│   │   │   ├── thinking-indicator.tsx # Animated dots (•••)
│   │   │   ├── streaming-cursor.tsx   # Blinking block cursor
│   │   │   ├── chat-input.tsx         # Auto-grow textarea + send/stop button
│   │   │   └── empty-state.tsx        # Greeting + suggestion chips
│   │   └── ui/                        # shadcn/ui primitives (existing + new)
│   ├── hooks/
│   │   └── use-chat.ts               # Chat state (useReducer) + streaming consumer
│   └── lib/
│       ├── stream-parser.ts           # SSE line parser for fetch ReadableStream
│       └── types.ts                   # Existing types (already defined in Phase 1)
│
└── server/
    ├── routes/
    │   └── chat.ts                    # POST /api/chat -> Agent + SSE stream
    ├── agent/
    │   └── setup.ts                   # Agent factory (create Agent with config)
    └── lib/
        └── stream-adapter.ts          # AgentEvent -> SSE event adapter
```

### Pattern 1: Agent-to-SSE Stream Adapter (Backend)

**What:** The backend creates an Agent, subscribes to events, maps them to SSE format, and writes them via Hono's `streamSSE`. A Promise anchor keeps the stream open until `agent_end` fires.

**When to use:** Every `/api/chat` request.

**Example:**
```typescript
// Source: pi-agent-core agent.d.ts + hono streamSSE
import { streamSSE } from "hono/streaming";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { getCredentials } from "../lib/credentials";

chatRoutes.post("/", async (c) => {
  const { message, model: modelId, provider } = await c.req.json();
  const apiKey = getCredentials(provider);
  if (!apiKey) return c.json({ error: "Not authenticated" }, 401);

  const model = getModel(provider, modelId);
  const agent = new Agent({
    initialState: {
      systemPrompt: "You are a helpful assistant.",
      model,
      tools: [], // No tools in Phase 2
    },
    getApiKey: () => apiKey,
  });

  return streamSSE(c, async (stream) => {
    // Promise anchor: keeps stream open until agent finishes
    const done = new Promise<void>((resolve) => {
      const unsubscribe = agent.subscribe((event) => {
        switch (event.type) {
          case "message_update": {
            const ame = event.assistantMessageEvent;
            if (ame.type === "text_delta") {
              stream.writeSSE({
                event: "text_delta",
                data: JSON.stringify({ data: ame.delta }),
              });
            }
            break;
          }
          case "agent_end":
            stream.writeSSE({ event: "done", data: "{}" });
            unsubscribe();
            resolve();
            break;
        }
      });

      // Handle client disconnect
      stream.onAbort(() => {
        agent.abort();
        unsubscribe();
        resolve();
      });
    });

    // Fire and forget the prompt - events flow through subscribe
    agent.prompt(message).catch((err) => {
      stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: err.message }),
      });
    });

    // Keep stream callback alive until agent finishes
    await done;
  });
});
```

### Pattern 2: SSE Stream Parser (Frontend)

**What:** Custom line parser that reads SSE events from a `fetch` Response's `ReadableStream`. Handles `event:` and `data:` lines per SSE spec.

**When to use:** The `useChat` hook calls this to consume the streaming response.

**Example:**
```typescript
// Source: SSE specification + fetch API
export async function* parseSSEStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "") {
          // Empty line = event boundary
          if (currentEvent && currentData) {
            try {
              const parsed = JSON.parse(currentData);
              yield { type: currentEvent, ...parsed } as SSEEvent;
            } catch { /* skip malformed */ }
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

### Pattern 3: useChat Hook with useReducer

**What:** Central chat state manager using `useReducer`. Dispatches actions for: add user message, start streaming, append text delta, set error, stop streaming.

**When to use:** The ChatLayout component consumes this hook.

**Example:**
```typescript
// Source: ADR-003 (useReducer + Context), types.ts
type ChatAction =
  | { type: "ADD_USER_MESSAGE"; content: string }
  | { type: "START_STREAMING" }
  | { type: "APPEND_TEXT_DELTA"; data: string }
  | { type: "STOP_STREAMING" }
  | { type: "SET_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "CLEAR_MESSAGES" };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_USER_MESSAGE":
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: "user", content: action.content, timestamp: Date.now() },
        ],
      };
    case "START_STREAMING":
      return {
        ...state,
        streaming: true,
        error: null,
        messages: [
          ...state.messages,
          { role: "assistant", segments: [], streaming: true, timestamp: Date.now() },
        ],
      };
    case "APPEND_TEXT_DELTA": {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1] as AssistantMessage;
      const segments = [...last.segments];
      const lastSeg = segments[segments.length - 1];
      if (lastSeg?.type === "text") {
        segments[segments.length - 1] = {
          ...lastSeg,
          content: lastSeg.content + action.data,
        };
      } else {
        segments.push({ type: "text", content: action.data });
      }
      msgs[msgs.length - 1] = { ...last, segments };
      return { ...state, messages: msgs };
    }
    case "STOP_STREAMING": {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, streaming: false };
      }
      return { ...state, streaming: false, messages: msgs };
    }
    // ...
  }
}
```

### Pattern 4: Progressive Markdown Rendering with Code Blocks

**What:** react-markdown re-renders on each state update (every text_delta). Custom `code` component uses react-shiki's `ShikiHighlighter` for fenced code blocks with the `delay` prop for throttled highlighting during streaming.

**When to use:** AssistantMessage rendering.

**Example:**
```typescript
// Source: react-markdown docs, react-shiki README
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match; // No language = inline code
          if (isInline) {
            return (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            );
          }
          return (
            <CodeBlock language={match[1]}>
              {String(children).replace(/\n$/, "")}
            </CodeBlock>
          );
        },
        // Wrap pre to remove default styling
        pre({ children }) {
          return <>{children}</>;
        },
      }}
    />
  );
}
```

```typescript
// code-block.tsx
import ShikiHighlighter from "react-shiki";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-4">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-muted/80 hover:bg-muted"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <ShikiHighlighter
        language={language}
        theme="github-dark"
        delay={100}
        addDefaultStyles={true}
      >
        {children}
      </ShikiHighlighter>
    </div>
  );
}
```

### Pattern 5: Auto-Scroll with Pause on User Scroll-Up

**What:** During streaming, the message list auto-scrolls to bottom. If the user manually scrolls up, auto-scroll pauses. It resumes when the user scrolls back to the bottom (or when a new message is sent).

**Example:**
```typescript
// Auto-scroll hook
function useAutoScroll(containerRef: RefObject<HTMLElement>, streaming: boolean) {
  const userScrolledUp = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      userScrolledUp.current = !isAtBottom;
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [containerRef]);

  useEffect(() => {
    if (streaming && !userScrolledUp.current) {
      containerRef.current?.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }); // Runs on every render during streaming
}
```

### Anti-Patterns to Avoid
- **Using EventSource API:** EventSource only supports GET requests. Chat needs POST to send the message body. Use `fetch` + `ReadableStream` instead.
- **Calling agent.prompt() before subscribe():** Events fire synchronously during prompt execution. If you subscribe after calling prompt(), you will miss early events. Always subscribe first.
- **Returning from streamSSE callback without awaiting:** Hono's `streamSSE` has a `finally { stream.close() }` clause. If the callback returns before all events are written, the stream closes prematurely. Use a Promise anchor pattern.
- **Re-rendering the entire message list on each token:** Use React keys and component memoization. Only the last (streaming) message should re-render on each delta.
- **Accumulating content in state without immutable updates:** The reducer must create new array/object references for React to detect changes. Mutating segments in place will not trigger re-renders.
- **Stringifying the full message as a single text block:** Use the segment-based model (`AssistantMessage.segments[]`) from Phase 1 types. This supports Phase 3 (tool calls as separate segments) without refactoring.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom markdown parser | `react-markdown` + `remark-gfm` | GFM spec is complex (tables, autolinks, strikethrough), edge cases in streaming |
| Syntax highlighting | Regex-based highlighter | `react-shiki` (Shiki engine) | VS Code-quality grammar parsing, 100+ languages, theme ecosystem |
| SSE server emission | Manual string formatting | Hono `streamSSE` + `writeSSE` | Handles multi-line data, event/id/retry fields, proper `\n\n` termination |
| Component primitives | Custom textarea, scroll area | shadcn/ui CLI components | Accessible, tested, Tailwind-native, consistent with existing UI |
| Agent lifecycle | Custom LLM loop | `Agent` class from pi-agent-core | Handles multi-turn, tool execution, abort, error recovery, streaming events |

**Key insight:** The pi-agent-core `Agent` class handles the entire LLM interaction lifecycle (prompt, stream, tool calls, abort, error). The backend's job is only to: (1) create an Agent, (2) subscribe to events, (3) map events to SSE, and (4) keep the stream open. Do not re-implement agent loop logic.

## Common Pitfalls

### Pitfall 1: Hono streamSSE Premature Closure
**What goes wrong:** The SSE stream closes immediately after `streamSSE` callback returns, even though Agent events are still pending.
**Why it happens:** Hono's `streamSSE` runs the callback then executes `stream.close()` in a `finally` clause. If the callback doesn't await a long-running operation, it returns immediately.
**How to avoid:** Use a Promise anchor pattern. Create a `new Promise<void>((resolve) => {...})` that resolves only when `agent_end` fires or the client disconnects. `await` this promise at the end of the callback.
**Warning signs:** Client receives only the first SSE event or nothing at all; stream closes with no `done` event.

### Pitfall 2: Agent Events Missed Due to Late Subscribe
**What goes wrong:** First few streaming events (agent_start, message_start, early text_deltas) are lost.
**Why it happens:** `Agent.subscribe()` must be called BEFORE `Agent.prompt()`. The prompt method runs the agent loop which emits events synchronously through the listener set. If subscribe is called after prompt, early events fire with no listener.
**How to avoid:** Always call `agent.subscribe(handler)` before `agent.prompt(message)`.
**Warning signs:** First few tokens of the response are missing; "thinking" indicator never appears.

### Pitfall 3: React-Markdown Re-Parse Performance
**What goes wrong:** UI becomes sluggish during fast streaming because react-markdown re-parses the entire accumulated content on every token.
**Why it happens:** react-markdown does a full AST parse on every render. With large content + many tokens/second, this becomes expensive.
**How to avoid:** (1) Only the streaming message should re-render (memo other messages). (2) Consider batching text_delta updates with requestAnimationFrame or a small interval (e.g., collect deltas and dispatch every 50ms). (3) react-shiki's `delay` prop throttles re-highlighting of code blocks.
**Warning signs:** Input becomes unresponsive during streaming; visible frame drops; high CPU in React DevTools profiler.

### Pitfall 4: Incomplete Code Block During Streaming
**What goes wrong:** While streaming, a code fence opens (```) but hasn't closed yet. react-markdown may render it as a broken code block or plain text.
**Why it happens:** Markdown parsers expect complete syntax. A partial ` ```python\ndef hello():` without closing ``` is ambiguous.
**How to avoid:** Accept temporary imperfections per D-10. react-markdown handles this reasonably -- it will render the unclosed block as an indented block or paragraph, then reflow correctly once the closing fence arrives. Do NOT try to "fix" the markdown by appending closing fences; this creates flash/reflow artifacts.
**Warning signs:** Code block content briefly appearing as plain text, then snapping into a highlighted block. This is expected and acceptable.

### Pitfall 5: AbortController Not Propagated to Backend
**What goes wrong:** User clicks Stop, frontend fetch is aborted, but the backend Agent continues running (consuming provider tokens).
**Why it happens:** Aborting the fetch on the client side closes the TCP connection, but Hono needs to detect this and the Agent needs to be explicitly aborted.
**How to avoid:** Use `stream.onAbort()` in the Hono streamSSE callback to call `agent.abort()`. Also pass the request's abort signal: `c.req.raw.signal` can be monitored.
**Warning signs:** Backend logs continue showing LLM streaming after the user clicks stop; provider billing shows full response tokens even after abort.

### Pitfall 6: Message State Mutation Instead of Immutable Update
**What goes wrong:** Appending a text delta to the last segment's `content` string mutates state in place. React does not detect the change and does not re-render.
**Why it happens:** JavaScript strings are immutable but objects/arrays are reference types. Modifying `segments[i].content += delta` changes the object but not the array reference.
**How to avoid:** The reducer must create new references at every level: new messages array, new last message object, new segments array, new last segment object. Spread operators at each level.
**Warning signs:** Tokens arrive (visible in console.log) but the UI does not update; messages appear to "freeze" then jump.

## Code Examples

### Backend: Chat Route with Agent + SSE (Complete)

```typescript
// src/server/routes/chat.ts
// Source: pi-agent-core Agent class, Hono streamSSE helper
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { getCredentials } from "../lib/credentials";
import type { AgentEvent } from "@mariozechner/pi-agent-core";

const chatRoutes = new Hono();

chatRoutes.post("/", async (c) => {
  const { message, model: modelId, provider } = await c.req.json<{
    message: string;
    model: string;
    provider: "anthropic" | "openai";
  }>();

  const apiKey = getCredentials(provider);
  if (!apiKey) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  const model = getModel(provider, modelId as any);

  return streamSSE(c, async (stream) => {
    const agent = new Agent({
      initialState: {
        systemPrompt: "You are a helpful assistant.",
        model,
        tools: [],
      },
      getApiKey: () => apiKey,
    });

    const done = new Promise<void>((resolve) => {
      const unsubscribe = agent.subscribe((event: AgentEvent) => {
        try {
          switch (event.type) {
            case "message_update": {
              const ame = event.assistantMessageEvent;
              if (ame.type === "text_delta") {
                void stream.writeSSE({
                  event: "text_delta",
                  data: JSON.stringify({ data: ame.delta }),
                });
              }
              break;
            }
            case "agent_end":
              void stream.writeSSE({
                event: "done",
                data: "{}",
              }).then(() => {
                unsubscribe();
                resolve();
              });
              break;
          }
        } catch {
          // Stream may be closed if client disconnected
        }
      });

      stream.onAbort(() => {
        agent.abort();
        unsubscribe();
        resolve();
      });
    });

    // Start the agent loop -- events flow through subscribe callback
    agent.prompt(message).catch(async (err) => {
      try {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: err.message || "Agent error" }),
        });
      } catch {
        // Stream already closed
      }
    });

    await done; // Anchor: keeps stream open
  });
});

export { chatRoutes };
```

### Frontend: SSE Parser (Complete)

```typescript
// src/client/lib/stream-parser.ts
import type { SSEEvent } from "./types";

export async function* parseSSEStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData += line.slice(6);
        } else if (line === "") {
          if (currentEvent && currentData) {
            try {
              const parsed = JSON.parse(currentData);
              yield { type: currentEvent, ...parsed } as SSEEvent;
            } catch {
              // Skip malformed events
            }
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

### Frontend: Sending a Message with Streaming

```typescript
// Inside useChat hook
async function sendMessage(content: string) {
  dispatch({ type: "ADD_USER_MESSAGE", content });
  dispatch({ type: "START_STREAMING" });

  const controller = new AbortController();
  abortControllerRef.current = controller;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        model: "claude-sonnet-4-20250514", // From agent state
        provider: "anthropic",             // From auth state
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.json();
      dispatch({ type: "SET_ERROR", message: err.error || "Request failed" });
      dispatch({ type: "STOP_STREAMING" });
      return;
    }

    for await (const event of parseSSEStream(response, controller.signal)) {
      switch (event.type) {
        case "text_delta":
          dispatch({ type: "APPEND_TEXT_DELTA", data: event.data });
          break;
        case "error":
          dispatch({ type: "SET_ERROR", message: event.message });
          break;
        case "done":
          break;
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // User clicked stop -- not an error
    } else {
      dispatch({
        type: "SET_ERROR",
        message: err instanceof Error ? err.message : "Connection error",
      });
    }
  } finally {
    dispatch({ type: "STOP_STREAMING" });
    abortControllerRef.current = null;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| EventSource API | fetch + ReadableStream | Always for POST | EventSource only supports GET; fetch required for POST body |
| String-based message content | Segment-based model (TextSegment, ToolSegment) | Phase 1 types | Enables Phase 3 tool rendering without refactoring |
| highlight.js / Prism | Shiki (via react-shiki) | 2024+ | VS Code-quality grammars, theme ecosystem, WASM or RegExp engine |
| Custom streaming solutions | pi-agent-core Agent class | 0.64.0 | Agent handles full lifecycle: prompt, stream, tools, abort |

**Deprecated/outdated:**
- `EventSource` API for POST-based streaming (use fetch + ReadableStream)
- `highlight.js` / `Prism` for new projects (Shiki is the standard now)
- Direct `streamSimple()` calls in backend (use `Agent` class which wraps it with full lifecycle management)

## Open Questions

1. **Agent instance lifecycle -- singleton vs per-request?**
   - What we know: ADR-006 says recreate Agent on agent/model switch. Phase 2 has no switching.
   - What's unclear: Should we create one Agent instance per chat request, or maintain a singleton for the session? Per-request is simpler but loses the internal message history that Agent tracks.
   - Recommendation: **Per-request Agent** for Phase 2 simplicity. The frontend manages conversation history and sends it as context. This aligns with the stateless HTTP model and simplifies error recovery. The Agent's internal `messages` accumulation is redundant when we manage history in React state. In Phase 4, agent switching creates new instances anyway (ADR-006).

2. **Conversation history passthrough**
   - What we know: Types already support `Message[]` in AppState. Agent expects messages as context.
   - What's unclear: Should POST /api/chat receive the full history array, or just the latest message with the backend maintaining history?
   - Recommendation: **Frontend sends full history** in each request (as `context` array). Backend is stateless. This enables easy "New Chat" (clear frontend state), retry (re-send same history), and aligns with ADR-006 (agent recreated per interaction).

3. **react-shiki bundle size**
   - What we know: Full bundle is ~1.2MB gzipped with all languages and themes. Core bundle (~12KB) exists.
   - What's unclear: Will full bundle cause slow initial load?
   - Recommendation: Start with the default import. For a local-only POC, bundle size is not a concern. Optimize later if needed by switching to `react-shiki/core` with selective language imports.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend server | Verified via existing project | ^22.x (tsx runs) | -- |
| npm | Package manager | Verified via existing project | Available | -- |
| react-markdown | CHAT-04 | Not installed | 10.1.0 (latest) | Must install |
| remark-gfm | CHAT-04 | Not installed | 4.0.1 (latest) | Must install |
| react-shiki | CHAT-04 (code highlighting) | Not installed | 0.9.2 (latest) | Must install |

**Missing dependencies with no fallback:**
- `react-markdown`, `remark-gfm`, `react-shiki` must be installed before implementation

**Missing dependencies with fallback:**
- None -- all missing deps are required

## Sources

### Primary (HIGH confidence)
- `@mariozechner/pi-agent-core` v0.64.0 source code (agent.d.ts, agent.js, agent-loop.js, types.d.ts) -- Agent class API, AgentEvent types, subscribe/prompt/abort lifecycle, event emission order
- `@mariozechner/pi-ai` v0.64.0 source code (types.d.ts, stream.d.ts, event-stream.js) -- AssistantMessageEvent types, streamSimple API, EventStream async iteration
- Hono v4.12.10 source code (streaming/sse.js, sse.d.ts) -- streamSSE API, writeSSE method, callback lifecycle, auto-close behavior
- Phase 1 existing code -- types.ts (SSEEvent, Message, AppState), api.ts (fetch pattern), credentials.ts (getCredentials), auth routes (Hono pattern)
- ARCHITECTURE.md -- Module structure, data flow diagrams, API surface
- ADR-004 -- SSE for streaming decision (fetch + ReadableStream, not EventSource)
- ADR-003 -- useReducer + Context state management
- ADR-006 -- Agent recreation on switch

### Secondary (MEDIUM confidence)
- [react-shiki GitHub](https://github.com/AVGVSTVS96/react-shiki) -- ShikiHighlighter props, `delay` option, react-markdown integration patterns
- [react-shiki npm](https://www.npmjs.com/react-shiki) -- v0.9.2, peerDeps verified (React >= 16.8.0)
- [Hono streamSSE docs](https://hono.dev/docs/helpers/streaming) -- Official streaming helper documentation
- [Hono GitHub issues #2050, #2993](https://github.com/honojs/hono/issues/2050) -- Premature stream closure patterns and workarounds

### Tertiary (LOW confidence)
- Web search results on react-markdown streaming performance -- multiple community sources agree on re-parse cost but no official benchmarks

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified against installed packages and npm registry; pi-agent-core API verified by reading actual source code
- Architecture: HIGH -- patterns derived from reading actual Agent source code (agent.js, agent-loop.js); Hono streamSSE behavior verified from source
- Pitfalls: HIGH -- pitfalls 1-2 verified from Hono source code and Agent source code; pitfalls 3-6 from established React patterns
- Code examples: MEDIUM -- examples are synthesis of verified API surfaces but not runtime-tested

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (30 days -- stable stack, no pre-release dependencies)
