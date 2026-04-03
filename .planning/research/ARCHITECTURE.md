# Architecture Patterns

**Domain:** LLM Chat Web Application (SPA + Backend Proxy with Streaming)
**Researched:** 2026-04-03
**Overall Confidence:** HIGH

---

## Recommended Architecture

### Pattern: SPA + Backend Proxy with SSE Streaming

The architecture is a two-process system: a React SPA handles rendering and user interaction, while a Hono backend runs the agent loop, manages credentials, and streams events to the frontend via SSE.

This is the standard architecture for LLM chat web applications in 2025-2026. SSE is the dominant transport protocol -- used natively by OpenAI, Anthropic, and most LLM providers. The pattern is well-understood, debuggable, and maps directly to how pi-agent-core's event system works.

```
Browser (React SPA)          Backend (Hono + Node.js)         LLM Provider
+---------------------+      +-------------------------+      +------------------+
| React App           |      | Hono Server             |      | Anthropic API    |
| - useReducer state  | POST | - /api/auth/*           |      | OpenAI API       |
| - SSE stream reader |----->| - /api/chat (POST+SSE)  |      |                  |
| - Message rendering |      | - /api/models           |      |                  |
|                     |<-----| - /api/harness/*        |      |                  |
| fetch+ReadableStream| SSE  |                         |      |                  |
+---------------------+      | Agent Loop              |      |                  |
                              | - Agent instance        |      |                  |
                              | - Tool execution        |      |                  |
                              | - Event subscription    |----->|                  |
                              | - stream-adapter (SSE)  |<-----|                  |
                              +-------------------------+      +------------------+
```

---

## Component Boundaries

### Frontend Components

| Component | Responsibility | Communicates With | Boundary Rule |
|-----------|---------------|-------------------|---------------|
| **React App (app.tsx)** | Root layout, routing between connection and chat pages | All child components via Context | Owns global state provider |
| **ConnectionPage** | API key input, provider selection, auth flow | `useAuth` hook -> `api.ts` -> Backend `/api/auth/*` | No knowledge of chat state |
| **ChatPage** | Chat layout, message list, input area | `useChat`, `useAgent`, `useHarness` hooks | Orchestrates chat, agent, and harness concerns |
| **MessageList + Messages** | Render user, assistant, and tool messages | Reads from chat state only | Pure rendering -- no API calls |
| **ToolCard variants** | Render tool-specific UI (bash, file, search, etc.) | Receives tool data from message state | Stateless renderers, routed by `toolType` |
| **Header (agent/model selectors)** | Agent switching, model switching | `useAgent` hook -> Backend `/api/models`, `/api/chat` | Triggers agent recreation on backend |
| **HarnessModal** | Load and apply harness files | `useHarness` hook -> Backend `/api/harness/*` | Isolated from chat concerns |
| **stream-parser.ts** | Parse SSE text stream into typed events | Consumed by `useChat` hook | Stateless utility -- no React dependency |
| **api.ts** | HTTP client for all backend calls | Backend endpoints | Single point of network access |

### Backend Components

| Component | Responsibility | Communicates With | Boundary Rule |
|-----------|---------------|-------------------|---------------|
| **Hono Server (index.ts)** | HTTP server, route mounting, CORS | All routes | Entry point only -- no business logic |
| **auth.ts route** | Validate API keys, store credentials | `credentials.ts`, LLM provider (test call) | Returns success/failure, no streaming |
| **chat.ts route** | Accept chat messages, start agent, stream SSE | `agent/setup.ts`, `stream-adapter.ts` | The critical streaming endpoint |
| **models.ts route** | List available models per provider | pi-ai `getModels()` / `getProviders()` | Simple proxy to pi-ai registry |
| **agent/setup.ts** | Create Agent instance with tools and config | pi-agent-core `Agent`, `agent/tools.ts`, `agent/harness.ts` | Factory -- creates and returns configured Agent |
| **agent/tools.ts** | Define AgentTool instances (bash, read, write, etc.) | pi-agent-core `AgentTool` type | Pure tool definitions |
| **agent/harness.ts** | Load harness files, build system prompt | File system, pi-agent-core context | Reads files, returns structured content |
| **lib/credentials.ts** | In-memory credential storage | Used by auth.ts and agent/setup.ts | Simple Map -- no persistence |
| **lib/stream-adapter.ts** | Transform AgentEvent -> SSE writeSSE() calls | pi-agent-core Agent subscription, Hono `streamSSE` | The bridge between pi-agent-core and HTTP |

### External Dependencies

| Dependency | Role | Boundary |
|------------|------|----------|
| **@mariozechner/pi-ai** | LLM API: `stream()`, `getModel()`, `getModels()`, `getProviders()`, auth | Used only in backend -- never exposed to frontend |
| **@mariozechner/pi-agent-core** | Agent runtime: `Agent` class, `AgentTool`, event subscriptions | Used only in backend -- events are transformed before reaching frontend |
| **Hono** | HTTP framework with `streamSSE()` helper | Backend only |
| **React + shadcn/ui** | UI rendering | Frontend only |

---

## Data Flow

### Flow 1: Chat Message with Streaming (Primary Flow)

This is the most complex and most important flow. It involves 5 stages:

```
Stage 1: User sends message
  [User] -> [ChatInput] -> useChat.sendMessage()
    -> dispatch({ type: 'ADD_USER_MESSAGE', content })
    -> dispatch({ type: 'SET_STREAMING', streaming: true })
    -> api.postChat({ message, model, agentType, context })

Stage 2: Backend receives, creates agent loop
  [api.ts] -> POST /api/chat
    -> chat.ts receives { message, model, agentType, context }
    -> setup.ts creates Agent({ model, tools, systemPrompt, streamFn: streamSimple })
    -> Agent.subscribe(event => stream-adapter forwards to SSE)
    -> Agent.prompt(message) starts the loop

Stage 3: Agent loop runs server-side
  [Agent] -> calls pi-ai stream(model, context) -> LLM Provider
    LLM Provider streams back: text_delta, toolcall_start/delta/end, thinking_delta, done
    Agent receives events, fires AgentEvent to subscribers:
      - agent_start -> SSE: not forwarded (internal)
      - turn_start -> SSE: not forwarded (internal)
      - message_update (text_delta) -> SSE: { type: "text_delta", data: "..." }
      - message_update (toolcall_start) -> SSE: { type: "tool_start", tool, id, params }
      - tool_execution_start -> SSE: { type: "tool_start", tool, id, params }
      - tool_execution_update -> SSE: { type: "tool_update", id, data }
      - tool_execution_end -> SSE: { type: "tool_end", id, result, status }
      - message_update (thinking_delta) -> SSE: { type: "thinking_delta", data: "..." }
      - agent_end -> SSE: { type: "done" }

  If tool calls exist, Agent automatically:
    1. Executes tools server-side (bash, read, write, etc.)
    2. Sends tool results back to LLM
    3. LLM continues generating (may call more tools)
    4. Loop repeats until LLM stops calling tools

Stage 4: Frontend consumes SSE stream
  [api.ts] -> fetch(POST /api/chat) returns Response with ReadableStream body
    -> stream-parser.ts reads via reader.read() loop
    -> TextDecoder decodes chunks with { stream: true }
    -> Splits on double-newline boundaries (\n\n)
    -> Parses JSON from data: fields
    -> Yields typed SSEEvent objects

Stage 5: React state updates from events
  [useChat] processes each SSEEvent:
    text_delta -> dispatch({ type: 'APPEND_TOKEN', data })
      (targets only the last message in array -- functional update)
    tool_start -> dispatch({ type: 'ADD_TOOL_MESSAGE', tool, id, params })
    tool_update -> dispatch({ type: 'UPDATE_TOOL', id, data })
    tool_end -> dispatch({ type: 'COMPLETE_TOOL', id, result, status })
    thinking_delta -> dispatch({ type: 'APPEND_THINKING', data })
    error -> dispatch({ type: 'SET_ERROR', message })
    done -> dispatch({ type: 'SET_STREAMING', streaming: false })
```

### Flow 2: Authentication (API Key)

```
[ConnectionPage] -> useAuth.connect(provider, apiKey)
  -> api.postAuthApiKey({ provider, key })
  -> POST /api/auth/apikey
  -> Backend tests key with provider (lightweight request)
  -> Backend stores key in credentials.ts (in-memory Map)
  -> Response: { status: "ok" } or { status: "error", message }
  -> dispatch({ type: 'SET_AUTH', status: 'connected', provider })
  -> Navigate to /chat
```

### Flow 3: Agent/Model Switch

```
[AgentSelector] -> useAgent.switchAgent(newAgent)
  -> dispatch({ type: 'SET_AGENT', agent: newAgent })
  -> No backend call yet -- Agent is recreated on next chat message

[ModelSelector] -> useAgent.switchModel(newModel)
  -> api.getModels(provider) if needed
  -> dispatch({ type: 'SET_MODEL', model: newModel })
  -> No backend call yet -- model change takes effect on next Agent creation

Key insight: Agent is recreated per POST /api/chat call.
  The backend creates a NEW Agent instance for each chat request,
  configured with the current agent type, model, and harness.
  History (messages[]) is sent from frontend as context.
  This is simpler than ADR-006's "recreate on switch" --
  in practice, the agent is recreated on EVERY request.
```

### Flow 4: Harness Loading

```
[HarnessModal] -> useHarness.loadHarness(files)
  -> api.postHarnessLoad({ files })
  -> POST /api/harness/load
  -> Backend reads files from filesystem
  -> Response: { results: [{ path, status, detail, size }] }
  -> dispatch({ type: 'SET_HARNESS', files: results })

[HarnessModal] -> useHarness.applyHarness()
  -> api.postHarnessApply()
  -> POST /api/harness/apply
  -> Backend marks harness as active (affects next Agent's systemPrompt)
  -> Response: { status: "ok" }
  -> dispatch({ type: 'APPLY_HARNESS' })
```

---

## Critical Integration Point: stream-adapter.ts

This is the most architecturally significant component. It bridges two worlds:

**Input:** pi-agent-core's `Agent.subscribe(callback)` which fires `AgentEvent` objects
**Output:** Hono's `streamSSE(c, async (stream) => { ... })` which writes SSE text

```typescript
// Conceptual implementation of the bridge
// This is the core architectural pattern

import { streamSSE } from 'hono/streaming'
import type { Agent } from '@mariozechner/pi-agent-core'

export function createStreamAdapter(c: Context, agent: Agent) {
  return streamSSE(c, async (stream) => {
    // Subscribe to agent events and forward as SSE
    agent.subscribe(async (event) => {
      switch (event.type) {
        case 'message_update':
          if (event.assistantMessageEvent.type === 'text_delta') {
            await stream.writeSSE({
              event: 'text_delta',
              data: JSON.stringify({ data: event.assistantMessageEvent.delta }),
              id: String(Date.now()),
            })
          }
          // ... handle toolcall_start, thinking_delta, etc.
          break

        case 'tool_execution_start':
          await stream.writeSSE({
            event: 'tool_start',
            data: JSON.stringify({
              tool: event.toolName,
              id: event.toolCallId,
              params: event.args,
            }),
            id: String(Date.now()),
          })
          break

        case 'tool_execution_update':
          await stream.writeSSE({
            event: 'tool_update',
            data: JSON.stringify({
              id: event.toolCallId,
              data: event.content,
            }),
            id: String(Date.now()),
          })
          break

        case 'tool_execution_end':
          await stream.writeSSE({
            event: 'tool_end',
            data: JSON.stringify({
              id: event.toolCallId,
              result: event.result,
              status: event.isError ? 'error' : 'done',
            }),
            id: String(Date.now()),
          })
          break

        case 'agent_end':
          await stream.writeSSE({
            event: 'done',
            data: JSON.stringify({ type: 'done' }),
            id: String(Date.now()),
          })
          break
      }
    })

    // Start the agent loop -- events flow through subscribe above
    await agent.prompt(message)
  })
}
```

**Why this matters:** The stream-adapter is the seam between the pi-agent-core world (which uses callback-based event subscriptions) and the HTTP world (which uses SSE text protocol). Getting this mapping right is the single most important integration task.

---

## Critical Integration Point: stream-parser.ts

The frontend counterpart to stream-adapter. Converts raw SSE text back into typed events.

```typescript
// Conceptual implementation of the client-side parser

export type SSEEvent =
  | { type: 'text_delta'; data: string }
  | { type: 'tool_start'; tool: string; id: string; params: Record<string, unknown> }
  | { type: 'tool_update'; id: string; data: string }
  | { type: 'tool_end'; id: string; result: string; status: 'done' | 'error' }
  | { type: 'thinking_delta'; data: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export async function* parseSSEStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    if (signal?.aborted) break
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? '' // Keep incomplete chunk

    for (const part of parts) {
      const eventLine = part.match(/^event:\s*(.+)$/m)
      const dataLine = part.match(/^data:\s*(.+)$/m)
      if (eventLine && dataLine) {
        const parsed = JSON.parse(dataLine[1])
        yield { type: eventLine[1], ...parsed } as SSEEvent
      }
    }
  }
}
```

**Key design decisions:**
- Uses `fetch` + `ReadableStream` (NOT `EventSource`) because `EventSource` only supports GET
- AsyncGenerator pattern for clean consumption in hooks
- Buffer handles chunks that split across SSE message boundaries
- `{ stream: true }` on TextDecoder handles multi-byte characters across chunks
- AbortSignal support for cancellation

---

## Performance Pattern: Streaming State Updates

The most common performance pitfall in LLM chat UIs is re-rendering the entire message list on every token. The recommended pattern:

### Approach: useReducer with Targeted Last-Message Updates

```typescript
// Reducer targets only the last message for token appends
case 'APPEND_TOKEN':
  const messages = [...state.chat.messages]
  const last = messages[messages.length - 1]
  if (last.role === 'assistant') {
    messages[messages.length - 1] = {
      ...last,
      content: last.content + action.data,
    }
  }
  return { ...state, chat: { ...state.chat, messages } }
```

### Optional Optimization: useRef Buffer + requestAnimationFrame

If token throughput causes visible jank (unlikely for single-stream POC but important for MVP):

1. Buffer incoming tokens in a `useRef` (no re-renders)
2. Flush buffer to state via `requestAnimationFrame` (~60fps)
3. React sees one update per frame instead of one per token

**Recommendation for POC:** Start with direct `useReducer` dispatch per token. The single-user, single-stream scenario is unlikely to cause jank. Add the ref-buffer optimization only if profiling shows it is needed.

---

## How pi-ai and pi-agent-core Fit

### pi-ai's Role (Backend Only)

pi-ai provides the LLM communication layer:

- **`stream(model, context)`** -- Returns `AssistantMessageEventStream`, an async-iterable of events: `start`, `text_start/delta/end`, `thinking_start/delta/end`, `toolcall_start/delta/end`, `done`, `error`
- **`streamSimple(model, context)`** -- Simplified streaming variant used as `streamFn` in Agent config
- **`getModel(provider, modelId)`** -- Resolves a model from the registry
- **`getModels(provider)`** -- Lists available models for a provider
- **`getProviders()`** -- Lists available providers
- **`Type` (re-exported from TypeBox)** -- Used for tool parameter schemas

pi-ai is consumed exclusively by the backend. The frontend never imports or calls pi-ai directly.

### pi-agent-core's Role (Backend Only)

pi-agent-core provides the agent runtime:

- **`Agent` class** -- Stateful agent that manages the conversation loop
  - `new Agent({ initialState: { model, tools, systemPrompt, thinkingLevel }, streamFn })`
  - `agent.prompt(message)` -- Starts the agent loop
  - `agent.subscribe(callback)` -- Receives all AgentEvent types
  - `agent.setModel()`, `agent.setTools()`, `agent.setSystemPrompt()` -- Runtime config changes
  - `agent.steer()` -- Interrupt current work with a new message
  - `agent.followUp()` -- Queue message after current completion
- **`AgentTool<TParams, TDetails>`** -- Tool definition interface
  - `name`, `label`, `description` -- metadata
  - `parameters` -- TypeBox schema for typed validation
  - `execute(toolCallId, params, signal, onUpdate)` -- execution function
    - `signal` -- AbortSignal for cancellation
    - `onUpdate` -- callback for streaming partial results
- **`AgentEvent` types:**
  - `agent_start` / `agent_end` -- lifecycle boundaries
  - `turn_start` / `turn_end` -- individual agent iterations
  - `message_start` / `message_update` / `message_end` -- LLM communication
  - `tool_execution_start` / `tool_execution_update` / `tool_execution_end` -- tool invocation

The Agent's `subscribe()` method is the hook point for the stream-adapter. Every relevant AgentEvent is transformed into an SSE event and forwarded to the frontend.

### Key Insight: Agent per Request, Not per Session

The original ADR-006 describes "recreate Agent on agent/model switch." In practice, the simpler pattern is: **create a new Agent for every POST /api/chat request.** The frontend sends conversation history as context, and the backend builds a fresh Agent each time.

This is simpler because:
- No server-side session state to manage
- No race conditions between concurrent requests
- Agent/model switching is automatic (next request uses new config)
- Matches HTTP's stateless model
- The Agent's `subscribe()` callback naturally scopes to one request

### Note on pi-web-ui

pi-web-ui (`@mariozechner/pi-web-ui`) provides pre-built web components for chat interfaces using mini-lit. However, the POC uses React + shadcn/ui because:

1. The POC's goal is to validate pi-ai + pi-agent-core, not pi-web-ui
2. pi-web-ui uses mini-lit (web components), not React
3. Building custom React components gives more control over tool card rendering
4. shadcn/ui is already decided as the component library (ADR decisions)

pi-web-ui's architecture is still valuable as a **reference implementation** -- its `createStreamFn` proxy pattern, event types, and message schemas inform how to build the React equivalent.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: EventSource for POST Requests
**What:** Using the browser's `EventSource` API for the chat streaming endpoint.
**Why bad:** `EventSource` only supports GET requests. Chat messages require POST with a JSON body containing message content, model selection, and conversation context.
**Instead:** Use `fetch()` with POST and read `response.body` as a `ReadableStream`.

### Anti-Pattern 2: Full State Replacement on Each Token
**What:** Replacing the entire messages array in state on each text_delta.
**Why bad:** Creates new array references for ALL messages, causing every `MessageComponent` to re-render on every token.
**Instead:** Target only the last message with functional updates. Memoize message components with `React.memo`.

### Anti-Pattern 3: Agent Persistence Across Requests
**What:** Keeping a single Agent instance alive between chat requests, trying to reuse it.
**Why bad:** pi-agent-core Agent is stateful. Reusing it across requests risks state leaks, tool registration conflicts, and makes agent/model switching complex.
**Instead:** Create a fresh Agent instance per POST /api/chat request. Pass conversation history as context.

### Anti-Pattern 4: Parsing SSE on the Backend Twice
**What:** Subscribing to Agent events AND separately parsing the pi-ai stream output.
**Why bad:** pi-agent-core's Agent already wraps pi-ai's stream(). Subscribing via `agent.subscribe()` gives you all events. No need to also tap into the underlying stream.
**Instead:** Use `agent.subscribe()` as the single source of truth. The Agent handles the stream internally.

### Anti-Pattern 5: Storing API Keys in Frontend State
**What:** Keeping API keys in React state or localStorage after authentication.
**Why bad:** Keys are visible in browser DevTools, memory dumps, and XSS attacks.
**Instead:** Send key to backend once during auth. Backend stores it in-memory. Frontend only knows "connected" / "disconnected" status.

### Anti-Pattern 6: Rendering Markdown During Incomplete Streaming
**What:** Passing every partial token directly to react-markdown as it arrives.
**Why bad:** Partial markdown causes rendering glitches: unclosed code fences, incomplete links, half-rendered tables.
**Instead:** Buffer tokens in raw text, render markdown in a slightly debounced manner (50-100ms). For code blocks, detect the opening triple backtick and defer full rendering until the closing fence arrives, or show as pre-formatted text while streaming.

---

## Suggested Build Order

Dependencies between components determine the order things must be built. Independent components can be built in parallel within a phase.

### Phase 1: Foundation (no dependencies)

Build the skeleton that everything else connects to.

1. **Project scaffolding** -- Vite + React + Tailwind + shadcn/ui + Hono
2. **Vite proxy config** -- `/api/*` proxied to `:3001`
3. **Shared types** -- `SSEEvent`, `Message`, `AppState` type definitions
4. **api.ts** -- HTTP client skeleton (empty functions, correct signatures)
5. **Hono server skeleton** -- Routes mounted, returning stub responses

**Why first:** Every other component depends on types, project structure, and the ability to make HTTP calls.

### Phase 2: Auth + Connection (depends on: Phase 1)

The gateway. Nothing else works without authenticated credentials.

1. **Backend: credentials.ts** -- In-memory credential store
2. **Backend: auth.ts route** -- POST /api/auth/apikey with provider test call
3. **Frontend: useAuth hook** -- Auth state management
4. **Frontend: ConnectionPage** -- UI for API key input + provider selection
5. **Frontend: Navigation** -- Route from `/` (connection) to `/chat`

**Why second:** Chat streaming requires valid credentials. This is the smallest vertical slice that proves the frontend-backend connection works.

### Phase 3: Chat + Streaming (depends on: Phase 2) -- THE CRITICAL PHASE

This is where the architecture proves itself. Build bottom-up:

1. **Backend: agent/tools.ts** -- At least one tool (bash or read) for testing
2. **Backend: agent/setup.ts** -- Agent factory using pi-agent-core
3. **Backend: lib/stream-adapter.ts** -- AgentEvent -> SSE bridge (THE KEY COMPONENT)
4. **Backend: chat.ts route** -- POST /api/chat with streamSSE response
5. **Frontend: stream-parser.ts** -- SSE text -> typed events
6. **Frontend: useChat hook** -- useReducer + stream consumption
7. **Frontend: ChatPage** -- Message list + chat input + streaming cursor

**Why this order within Phase 3:**
- Tools must exist before Agent can be created (Agent config requires tools array)
- Agent must exist before stream-adapter can subscribe to it
- stream-adapter must work before chat.ts can return SSE
- stream-parser must work before useChat can process events
- useChat must work before ChatPage can render

**Build bottom-up:** Start from the backend integration with pi-agent-core and work toward the UI. This catches integration issues with the pi-ai/pi-agent-core libraries early.

### Phase 4: Tool Cards (depends on: Phase 3)

Enhances the streaming experience with visual tool rendering.

1. **Frontend: tool-card.tsx** -- Router component dispatching to variants
2. **Frontend: bash-card.tsx, file-card.tsx, etc.** -- Individual tool renderers
3. **Integration: useChat reducer** -- Handle tool_start/update/end events to create tool messages

**Why after streaming:** Tool cards are a rendering concern. They consume the same SSE events that Phase 3 already delivers.

### Phase 5: Agent/Model Switching (depends on: Phase 3)

1. **Backend: models.ts route** -- GET /api/models wrapping pi-ai registry
2. **Frontend: useAgent hook** -- Agent and model selection state
3. **Frontend: AgentSelector + ModelSelector** -- Header components

**Why late:** Switching works by creating a new Agent on the next request with different config. The chat flow from Phase 3 already creates agents per request. This phase just adds the UI to change which agent/model gets created.

### Phase 6: Harness (depends on: Phase 3)

1. **Backend: agent/harness.ts** -- File loading and system prompt construction
2. **Backend: harness routes** -- POST /api/harness/load, /api/harness/apply
3. **Frontend: useHarness hook** -- Harness file state
4. **Frontend: HarnessModal** -- UI for loading and applying harness

**Why last:** Harness modifies the system prompt passed to Agent creation. The agent creation pipeline from Phase 3 must already work.

### Build Order Dependency Graph

```
Phase 1: Foundation
    |
    v
Phase 2: Auth + Connection
    |
    v
Phase 3: Chat + Streaming  <-- Critical path, highest risk
   / |  \
  v  v   v
Phase 4   Phase 5   Phase 6
(Tools)   (Switch)  (Harness)
          [independent of each other]
```

---

## Scalability Considerations

| Concern | POC (1 user) | MVP (10+ users) | Production (1000+ users) |
|---------|--------------|------------------|--------------------------|
| Agent instances | 1 at a time, in-process | Multiple concurrent, in-process | Worker pool or separate processes |
| Credentials | In-memory Map | Per-user in-memory with auth | Database + encryption |
| SSE connections | 1 connection | HTTP/2 multiplexing | Load balancer + connection pooling |
| State management | useReducer + Context | Zustand with selectors | Zustand + React Query for server state |
| Tool execution | Direct in main process | Sandboxed child processes | Container isolation |
| Conversation history | Frontend-only | IndexedDB (like pi-web-ui) | Database with append-only log |

---

## Sources

### Official / Authoritative
- [Hono Streaming Helper docs](https://hono.dev/docs/helpers/streaming) -- HIGH confidence
- [pi-mono GitHub repository](https://github.com/badlogic/pi-mono) -- HIGH confidence
- [pi-mono DeepWiki documentation](https://deepwiki.com/badlogic/pi-mono) -- HIGH confidence
- [Building Custom Agents with PI (Gist)](https://gist.github.com/dabit3/e97dbfe71298b1df4d36542aceb5f158) -- HIGH confidence (verified API patterns)
- [pi-web-ui DeepWiki](https://deepwiki.com/badlogic/pi-mono/6-@mariozechnerpi-web-ui-and-pi-proxy) -- HIGH confidence

### Community / Pattern References
- [Streaming LLM Responses: SSE to Real-Time UI (dev.to)](https://dev.to/pockit_tools/the-complete-guide-to-streaming-llm-responses-in-web-applications-from-sse-to-real-time-ui-3534) -- MEDIUM confidence
- [Streaming Backends & React: Re-render Control (SitePoint)](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/) -- MEDIUM confidence
- [SSE Streaming using HTTP POST](https://patrickdesjardins.com/blog/sse-streaming-using-http-post) -- MEDIUM confidence
- [Hono with SSE (yanael.io)](https://yanael.io/articles/hono-sse/) -- MEDIUM confidence
- [Streaming in 2026: SSE vs WebSockets vs RSC (JetBI)](https://jetbi.com/blog/streaming-architecture-2026-beyond-websockets/) -- MEDIUM confidence
- [SSE Deep Dive: Consuming Streamed LLM Responses](https://tpiros.dev/blog/streaming-llm-responses-a-deep-dive/) -- MEDIUM confidence
- [ChatGPT Smooth Streaming vs React Lag](https://akashbuilds.com/blog/chatgpt-stream-text-react) -- MEDIUM confidence
- [AG-UI Protocol for Agent Events (Microsoft)](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/) -- LOW confidence (different framework, pattern reference only)
