# Phase 1: Foundation + Connection - Research

**Researched:** 2026-04-03
**Domain:** Project scaffolding (Vite + React + Hono), pi-agent-core spike, API Key auth flow
**Confidence:** HIGH

## Summary

Phase 1 scaffolds a greenfield Vite + React 19 frontend and Hono backend, defines shared types for the entire project, validates pi-agent-core via a standalone spike script, and implements an API Key authentication flow that proves the frontend-backend pipeline works end-to-end.

The pi-agent-core API surface is well-documented through official guides: `Agent` accepts `initialState` (systemPrompt, model, tools, thinkingLevel) and a `streamFn` (defaults to `streamSimple` from pi-ai). Events are emitted via `agent.subscribe()` as a discriminated union (`agent_start`, `message_update`, `tool_execution_start`, `tool_execution_end`, `agent_end`). API keys can be passed explicitly via the third `options` parameter of `streamSimple` (`{ apiKey: "..." }`), which is critical for the backend proxy pattern where keys come from user input, not environment variables.

The Hono `streamSSE` helper has a well-known premature closure issue: the stream closes automatically when the async callback resolves. For the spike in Phase 1, this is irrelevant (no SSE needed), but the type definitions for SSEEvent and the stream-adapter pattern should be designed now to anticipate the Promise anchor pattern needed in Phase 2.

**Primary recommendation:** Scaffold both apps with a single `npm run dev` command using `concurrently`, validate pi-agent-core in an isolated spike script before building any app code, and define the complete type system (including segment-based AssistantMessage) upfront to prevent refactoring in later phases.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Provider selection via segmented control (Anthropic | OpenAI) -- alinhado com `segmented-control.tsx` definido na ARCHITECTURE.md
- **D-02:** API key input como password field com toggle show/hide -- padrao de seguranca, nao expor key durante digitacao
- **D-03:** Feedback de conexao inline no proprio formulario (estados: idle, connecting, connected, error) -- sem modais ou toasts separados
- **D-04:** Apos conexao bem-sucedida, auto-redirect para /chat apos breve feedback visual (1-2s com status "connected")
- **D-05:** Botao de conectar mostra spinner durante validacao, checkmark no sucesso, mensagem de erro inline no falha
- **D-06:** Single `npm run dev` usando `concurrently` para iniciar Vite (frontend :5173) e Hono (backend :3001) simultaneamente
- **D-07:** Vite proxy config: `/api/*` redireciona para `localhost:3001` -- sem CORS issues no dev
- **D-08:** Backend roda com `tsx watch` para hot-reload do servidor durante desenvolvimento
- **D-09:** Spike como script standalone em `spike/validate-agent.ts`, executado com `npx tsx spike/validate-agent.ts`
- **D-10:** Spike valida: criacao de Agent, subscription de eventos, stream lifecycle (text_delta, tool events, done), pelo menos 1 tool execution
- **D-11:** Spike usa API key real do ambiente (env var) -- nao e mock, valida conexao end-to-end com provider
- **D-12:** Definir tipos completos de Message (UserMessage, AssistantMessage com segments), SSEEvent, e auth state shape no `src/client/lib/types.ts`
- **D-13:** AssistantMessage usa modelo de segments (`segments[]`) para suportar interleaving de texto e tool calls em fases futuras -- definir a estrutura agora evita refactor em Phase 2/3
- **D-14:** AppState shape com auth slice totalmente tipado; chat/tool/harness slices como stubs iniciais que fases futuras expandem
- **D-15:** ToolCardVariant e ToolStatus definidos como union types desde Phase 1, mesmo que tool cards sejam implementados em Phase 3

### Claude's Discretion
- Escolha de componentes shadcn/ui especificos para a connection page (Button, Input, Card, etc.)
- Estrutura exata de pastas dentro de src/client e src/server (seguir ARCHITECTURE.md como guia, ajustar conforme necessario)
- Organizacao interna do spike script
- Configuracao de tsconfig.json (paths, target, module resolution)

### Deferred Ideas (OUT OF SCOPE)
None -- analise permaneceu dentro do escopo da Phase 1
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Projeto scaffolded com Vite + React 19 + Tailwind 4 + shadcn/ui + TypeScript | shadcn/ui Vite installation guide verified; Vite 6.4.1, React 19.2.4, TW 4.2.2, @vitejs/plugin-react 4.7.0 confirmed on npm |
| FOUND-02 | Backend Hono com endpoints skeleton e proxy config do Vite | Hono 4.12.10 + @hono/node-server 1.19.12 verified; Vite proxy config documented (`server.proxy` with target) |
| FOUND-03 | Tipos compartilhados (Message, SSEEvent, ToolCardVariant, AppState) | ARCHITECTURE.md S7 defines full state shape; segment-based message model from CONTEXT.md D-13 |
| FOUND-04 | Spike de validacao da API pi-agent-core (event types, subscribe, stream lifecycle) | Agent constructor, subscribe(), prompt(), AgentEvent types, AgentTool interface all documented with code examples |
| AUTH-01 | Usuario pode conectar ao provider via API Key (Anthropic ou OpenAI) | pi-ai `streamSimple` accepts `{ apiKey }` in options; `getModel("anthropic", modelId)` / `getModel("openai", modelId)` verified |
| AUTH-02 | Backend valida a API Key com request de teste ao provider | Use `streamSimple` or `completeSimple` with a trivial prompt + explicit apiKey option; catch errors for 401 |
| AUTH-03 | Credenciais armazenadas in-memory no servidor (nunca expostas ao frontend) | Simple Map/object in `server/lib/credentials.ts`; never returned in API responses |
| AUTH-04 | Feedback visual de conexao (conectando, conectado, erro) | D-03/D-05 define inline feedback pattern; auth state machine: idle -> connecting -> connected/error |
| AUTH-05 | Tela de conexao com selecao de provider e campo de API Key | D-01 (segmented control), D-02 (password field with toggle); shadcn/ui Button, Input, Card components |
</phase_requirements>

## Standard Stack

### Core (Phase 1 Only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mariozechner/pi-ai` | 0.64.0 | Unified LLM API (`getModel`, `streamSimple`) | Validation target; provides model registry and streaming |
| `@mariozechner/pi-agent-core` | 0.64.0 | Agent runtime (`Agent`, `AgentTool`, `AgentEvent`) | Validation target; agent loop and tool execution |
| React | 19.2.4 | UI framework | ADR decision, shadcn/ui requirement |
| React DOM | 19.2.4 | DOM rendering | Paired with React |
| TypeScript | ~5.7.0 | Type safety | Required for pi-ai/pi-agent-core typed APIs |
| Vite | 6.4.1 | Dev server + bundler | ADR decision; stay on 6.x (not 8.x) |
| `@vitejs/plugin-react` | 4.7.0 | React Fast Refresh | Must be 4.x for Vite 6 compatibility |
| Tailwind CSS | 4.2.2 | Utility-first CSS | ADR decision, shadcn/ui requirement |
| `@tailwindcss/vite` | 4.2.2 | Vite plugin for TW4 | Required for Tailwind 4 + Vite integration |
| Hono | 4.12.10 | HTTP server + SSE streaming | ADR-002; TypeScript-first, streaming helpers |
| `@hono/node-server` | 1.19.12 | Node.js adapter | Runs Hono on Node.js |
| `react-router` | 7.14.0 | Client-side SPA routing | Two routes: `/` and `/chat` |
| `lucide-react` | 1.7.0 | UI icons | Default icon set for shadcn/ui |

### Supporting (Phase 1 Only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tailwind-merge` | 3.5.0 | Class deduplication | `cn()` utility function |
| `clsx` | 2.1.1 | Conditional classes | `cn()` utility function |
| `class-variance-authority` | 0.7.1 | Component variants | Type-safe variant props |
| `concurrently` | 9.2.1 | Parallel dev scripts | `npm run dev` runs frontend + backend |
| `tsx` | 4.21.0 | TypeScript execution | Backend dev server (`tsx watch`) and spike script |
| `@types/node` | 25.5.1 | Node.js type definitions | Required for path resolution in vite.config.ts |

### shadcn/ui Components (Phase 1)

| Component | Purpose in Phase 1 |
|-----------|-------------------|
| `button` | Connect button, show/hide toggle |
| `input` | API key input field |
| `card` | Connection form container |

### Not Needed in Phase 1 (Future Phases)

| Library | Phase | Purpose |
|---------|-------|---------|
| `react-markdown` | 2 | Markdown rendering |
| `remark-gfm` | 2 | GFM support |
| `react-shiki` | 2 | Syntax highlighting |

**Installation (Phase 1):**

```bash
# Create Vite project
npm create vite@latest pi-ai-poc -- --template react-ts

# Core dependencies
npm install @mariozechner/pi-ai@^0.64.0 @mariozechner/pi-agent-core@^0.64.0

# Frontend
npm install react-router@^7.14.0 lucide-react@^1.7.0

# Styling utilities
npm install tailwind-merge@^3.5.0 clsx@^2.1.1 class-variance-authority@^0.7.1

# Backend
npm install hono@^4.12.0 @hono/node-server@^1.19.0

# Tailwind 4 Vite plugin
npm install tailwindcss@^4.2.0 @tailwindcss/vite@^4.2.0

# Dev dependencies
npm install -D concurrently@^9.2.0 tsx@^4.21.0 @types/node@^25.0.0

# shadcn/ui init
npx shadcn@latest init

# shadcn/ui components for Phase 1
npx shadcn@latest add button input card
```

## Architecture Patterns

### Recommended Project Structure (Phase 1)

```
pi-ai-poc/
├── src/
│   ├── client/                    # Frontend (React SPA)
│   │   ├── app.tsx                # Root component + router setup
│   │   ├── main.tsx               # Vite entry point
│   │   ├── components/
│   │   │   ├── ui/                # shadcn/ui primitives (auto-generated)
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   └── card.tsx
│   │   │   └── connection/
│   │   │       ├── connection-page.tsx   # SCR-01: full connection screen
│   │   │       └── segmented-control.tsx # Provider selector (Anthropic|OpenAI)
│   │   ├── hooks/
│   │   │   └── use-auth.ts        # Auth state + connect/disconnect
│   │   ├── lib/
│   │   │   ├── api.ts             # HTTP client for backend
│   │   │   ├── types.ts           # Shared types (Message, SSEEvent, AppState)
│   │   │   └── cn.ts              # Tailwind class merge utility
│   │   └── styles/
│   │       └── globals.css        # @import "tailwindcss"
│   │
│   └── server/                    # Backend (Node.js)
│       ├── index.ts               # Server entry (Hono + @hono/node-server)
│       ├── routes/
│       │   └── auth.ts            # POST /api/auth/apikey
│       └── lib/
│           └── credentials.ts     # In-memory API key storage
│
├── spike/
│   └── validate-agent.ts          # Standalone pi-agent-core validation
│
├── index.html                     # Vite HTML entry
├── vite.config.ts                 # Vite config (proxy, TW plugin, path alias)
├── tsconfig.json                  # Base TypeScript config
├── tsconfig.app.json              # Frontend TypeScript config
├── tsconfig.node.json             # Backend/Vite TypeScript config
├── components.json                # shadcn/ui config
└── package.json
```

### Pattern 1: Vite Dev Proxy Configuration

**What:** Proxy all `/api/*` requests from Vite dev server (:5173) to Hono backend (:3001)
**When to use:** Always during development; eliminates CORS issues

```typescript
// vite.config.ts
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
```

**Note:** No `rewrite` is needed -- backend routes already include `/api` prefix. The proxy forwards `/api/auth/apikey` as-is to `localhost:3001/api/auth/apikey`.

### Pattern 2: Hono Backend Entry Point

**What:** Minimal Hono server with route mounting and CORS-free design
**When to use:** Server entry point

```typescript
// src/server/index.ts
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { authRoutes } from "./routes/auth"

const app = new Hono()

// Mount route groups
app.route("/api/auth", authRoutes)

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }))

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Backend running on http://localhost:${info.port}`)
})
```

### Pattern 3: Concurrent Dev Script

**What:** Single `npm run dev` runs both Vite frontend and Hono backend
**When to use:** Development workflow

```json
{
  "scripts": {
    "dev": "concurrently -n fe,be -c blue,green \"npm run dev:frontend\" \"npm run dev:backend\"",
    "dev:frontend": "vite",
    "dev:backend": "tsx watch src/server/index.ts"
  }
}
```

### Pattern 4: API Key Validation via pi-ai Test Request

**What:** Validate an API key by making a minimal LLM request
**When to use:** `POST /api/auth/apikey` handler

```typescript
// src/server/routes/auth.ts
import { Hono } from "hono"
import { getModel, streamSimple } from "@mariozechner/pi-ai"
import { storeCredentials } from "../lib/credentials"

const authRoutes = new Hono()

authRoutes.post("/apikey", async (c) => {
  const { provider, key } = await c.req.json<{
    provider: "anthropic" | "openai"
    key: string
  }>()

  try {
    // Validate by making a minimal test request
    const model = getModel(provider, getTestModel(provider))
    const stream = streamSimple(
      model,
      {
        systemPrompt: "Reply with OK",
        messages: [{ role: "user", content: "test", timestamp: Date.now() }],
      },
      { apiKey: key }
    )

    // Consume the stream to completion (validates the key)
    const result = await stream.result()

    // Store credentials in-memory (never returned to frontend)
    storeCredentials(provider, key)

    return c.json({ status: "ok", provider })
  } catch (error: any) {
    return c.json(
      { status: "error", message: error.message || "Invalid API key" },
      401
    )
  }
})

function getTestModel(provider: "anthropic" | "openai"): string {
  // Use cheapest model for validation
  return provider === "anthropic"
    ? "claude-haiku-3-5"
    : "gpt-4o-mini"
}

export { authRoutes }
```

### Pattern 5: Agent Spike Script

**What:** Standalone script that validates pi-agent-core Agent creation, events, and tool execution
**When to use:** FOUND-04 requirement; run before building the main app

```typescript
// spike/validate-agent.ts
import { Agent } from "@mariozechner/pi-agent-core"
import { getModel, streamSimple, Type } from "@mariozechner/pi-ai"
import type { AgentTool } from "@mariozechner/pi-agent-core"

// 1. Define a test tool
const echoParams = Type.Object({
  message: Type.String({ description: "Message to echo" }),
})

const echoTool: AgentTool<typeof echoParams> = {
  name: "echo",
  label: "Echo",
  description: "Echoes back the given message",
  parameters: echoParams,
  execute: async (_id, params, _signal, onUpdate) => {
    return {
      content: [{ type: "text", text: `Echo: ${params.message}` }],
      details: {},
    }
  },
}

// 2. Create Agent
const model = getModel("anthropic", "claude-haiku-3-5")

const agent = new Agent({
  initialState: {
    systemPrompt: "You have an echo tool. Use it to echo 'hello world'.",
    model,
    tools: [echoTool],
    thinkingLevel: "off",
  },
  streamFn: streamSimple,
})

// 3. Subscribe to events
const events: string[] = []
agent.subscribe((event) => {
  events.push(event.type)
  switch (event.type) {
    case "agent_start":
      console.log("[spike] Agent started")
      break
    case "message_update":
      if (event.assistantMessageEvent?.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta)
      }
      break
    case "tool_execution_start":
      console.log(`\n[spike] Tool: ${event.toolName}(${JSON.stringify(event.args)})`)
      break
    case "tool_execution_end":
      console.log(`[spike] Tool result: ${event.isError ? "ERROR" : "OK"}`)
      break
    case "agent_end":
      console.log("\n[spike] Agent finished")
      break
  }
})

// 4. Run and validate
await agent.prompt("Please use the echo tool to echo 'hello world'")

// 5. Verify lifecycle
const required = ["agent_start", "tool_execution_start", "tool_execution_end", "agent_end"]
const missing = required.filter((e) => !events.includes(e))
if (missing.length > 0) {
  console.error(`[spike] FAIL: Missing events: ${missing.join(", ")}`)
  process.exit(1)
} else {
  console.log("[spike] PASS: All required events observed")
  console.log(`[spike] Event sequence: ${events.join(" -> ")}`)
}
```

### Pattern 6: Segment-Based Message Model (D-13)

**What:** Define AssistantMessage with `segments[]` from Phase 1 to prevent refactoring in Phase 2/3
**When to use:** Type definitions in `src/client/lib/types.ts`

```typescript
// src/client/lib/types.ts

// --- Provider & Auth ---
export type Provider = "anthropic" | "openai"

export type AuthStatus = "disconnected" | "connecting" | "connected" | "error"

export interface AuthState {
  status: AuthStatus
  provider: Provider | null
  error: string | null
}

// --- Messages ---
export type ToolCardVariant = "bash" | "file" | "search" | "agent" | "toolsearch" | "generic"
export type ToolStatus = "running" | "done" | "error"

export interface TextSegment {
  type: "text"
  content: string
}

export interface ToolSegment {
  type: "tool"
  toolId: string
  toolName: string
  variant: ToolCardVariant
  status: ToolStatus
  args: Record<string, unknown>
  result?: string
  error?: string
}

export type MessageSegment = TextSegment | ToolSegment

export interface UserMessage {
  role: "user"
  content: string
  timestamp: number
}

export interface AssistantMessage {
  role: "assistant"
  segments: MessageSegment[]  // Interleaved text + tool calls
  streaming: boolean
  timestamp: number
}

export type Message = UserMessage | AssistantMessage

// --- SSE Events (for Phase 2+, define now) ---
export type SSEEvent =
  | { type: "text_delta"; data: string }
  | { type: "tool_start"; tool: string; id: string; params: Record<string, unknown> }
  | { type: "tool_update"; id: string; data: string }
  | { type: "tool_end"; id: string; result: string; status: "done" | "error" }
  | { type: "thinking_delta"; data: string }
  | { type: "error"; message: string }
  | { type: "done" }

// --- App State ---
export interface AppState {
  auth: AuthState
  agent: {
    current: "claude-code" | "codex"
    model: string | null
    availableModels: Array<{ id: string; name: string }>
  }
  chat: {
    messages: Message[]
    streaming: boolean
    error: string | null
  }
  harness: {
    applied: boolean
  }
}
```

### Pattern 7: In-Memory Credentials Store

**What:** Simple server-side credential storage
**When to use:** `server/lib/credentials.ts`

```typescript
// src/server/lib/credentials.ts
type Provider = "anthropic" | "openai"

const credentials = new Map<Provider, string>()

export function storeCredentials(provider: Provider, apiKey: string): void {
  credentials.set(provider, apiKey)
}

export function getCredentials(provider: Provider): string | null {
  return credentials.get(provider) ?? null
}

export function hasCredentials(provider: Provider): boolean {
  return credentials.has(provider)
}

export function clearCredentials(provider: Provider): void {
  credentials.delete(provider)
}
```

### Pattern 8: React Router 7 SPA Setup

**What:** Minimal two-route SPA with `createBrowserRouter`
**When to use:** `src/client/app.tsx`

```typescript
// src/client/app.tsx
import { createBrowserRouter, RouterProvider, Navigate } from "react-router"
import { ConnectionPage } from "./components/connection/connection-page"

// ChatPage is a placeholder in Phase 1
function ChatPage() {
  return <div className="flex items-center justify-center h-screen">
    <p className="text-muted-foreground">Chat coming in Phase 2</p>
  </div>
}

const router = createBrowserRouter([
  { path: "/", element: <ConnectionPage /> },
  { path: "/chat", element: <ChatPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
])

export function App() {
  return <RouterProvider router={router} />
}
```

### Anti-Patterns to Avoid

- **Importing pi-ai/pi-agent-core in the frontend:** These packages MUST only run server-side. They contain Node.js APIs and API key references. The frontend communicates exclusively via HTTP to the backend.
- **Using `EventSource` for the auth endpoint:** `EventSource` only supports GET. Auth uses POST. Use standard `fetch`.
- **Storing API keys in React state or localStorage:** Keys go to the backend via POST and stay there. Frontend only stores auth status ("connected"/"disconnected").
- **Using Vite 8 or `@vitejs/plugin-react` v6:** Locked to Vite 6.x + plugin-react 4.x per stack decision. Vite 8 has CommonJS interop breaking changes that may affect pi-ai imports.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS class merging | Custom class concat | `cn()` from `clsx` + `tailwind-merge` | Handles Tailwind conflicts (e.g., `p-2` vs `p-4`) |
| Component variants | Manual className switching | `class-variance-authority` (cva) | Type-safe, composable variant system |
| Accessible UI primitives | Custom button/input/card | shadcn/ui + Radix UI | Keyboard navigation, ARIA, focus management built-in |
| Dev script orchestration | Shell scripts with `&` | `concurrently` | Named output streams, proper cleanup on Ctrl+C |
| TypeScript execution | Custom build step | `tsx` | Zero-config TS execution with watch mode |
| LLM API normalization | Provider-specific HTTP calls | `streamSimple` from pi-ai | Handles auth, streaming, error normalization across providers |
| Agent event loop | Custom tool execution loop | `Agent` from pi-agent-core | Handles tool validation, parallel/sequential execution, event emission |

**Key insight:** Phase 1 is infrastructure. Every custom solution here creates technical debt that compounds across 3 subsequent phases. Use the established libraries for everything except the connection UI.

## Common Pitfalls

### Pitfall 1: Hono streamSSE Premature Closure

**What goes wrong:** `streamSSE` callback resolves immediately and closes the connection before all events are sent
**Why it happens:** Hono's streaming helper has a `finally` clause that auto-closes the stream when the async callback completes
**How to avoid:** In Phase 1, this only matters if the spike tried SSE (it doesn't). For Phase 2, use the Promise anchor pattern:

```typescript
return streamSSE(c, async (stream) => {
  return new Promise<void>((resolve) => {
    // Write events from agent subscription
    agent.subscribe(async (event) => {
      await stream.writeSSE({ data: JSON.stringify(mapEvent(event)) })
      if (event.type === "agent_end") resolve()
    })
    // Start the agent
    agent.prompt(message)
  })
})
```

**Warning signs:** Stream closes after first event; client receives partial data

### Pitfall 2: @vitejs/plugin-react Version Mismatch

**What goes wrong:** Using `@vitejs/plugin-react` v6 with Vite 6 causes build errors
**Why it happens:** v6 is built for Vite 8 and uses Oxc instead of Babel
**How to avoid:** Pin to `@vitejs/plugin-react@^4.7.0` which is the latest 4.x for Vite 6
**Warning signs:** Build errors mentioning Oxc or incompatible plugin API

### Pitfall 3: API Key Exposure in Frontend

**What goes wrong:** API key leaks to browser via React state, localStorage, or API response body
**Why it happens:** Natural tendency to store credentials client-side for convenience
**How to avoid:** Frontend only sends the key via POST to backend; backend stores it in-memory and never returns it. Frontend tracks only `AuthState.status` (connected/disconnected), never the key itself.
**Warning signs:** Key visible in DevTools Network tab response body, or in React DevTools state

### Pitfall 4: Flat Message Model Preventing Tool Interleaving

**What goes wrong:** Using `{ role: "assistant"; content: string }` makes it impossible to render interleaved text + tool calls in Phase 2/3
**Why it happens:** Seems sufficient for Phase 1 (no streaming yet), but Phase 2 needs segments
**How to avoid:** Define `AssistantMessage.segments: MessageSegment[]` from Phase 1 (D-13). Each segment is either `TextSegment` or `ToolSegment`. This allows `[text, tool, text, tool, text]` interleaving.
**Warning signs:** Phase 2 requiring a full Message type refactor

### Pitfall 5: Vite Proxy Not Forwarding to Backend

**What goes wrong:** `/api/*` requests return 404 or Vite's HTML fallback instead of reaching Hono
**Why it happens:** Misconfigured proxy (wrong target URL, missing port, or backend not started)
**How to avoid:** Ensure Hono listens on port 3001 BEFORE Vite starts (concurrently handles this). Test with `curl http://localhost:3001/api/health` directly.
**Warning signs:** API calls return HTML; network tab shows 200 with HTML content

### Pitfall 6: pi-ai API Key via Environment Variable Instead of Explicit Parameter

**What goes wrong:** `getModel("anthropic", ...)` + `streamSimple(model, context)` uses `ANTHROPIC_API_KEY` from server env, not the user-provided key
**Why it happens:** pi-ai defaults to env vars for auth
**How to avoid:** Always pass the explicit `{ apiKey }` option as the third parameter to `streamSimple`: `streamSimple(model, context, { apiKey: userProvidedKey })`
**Warning signs:** Auth works only when env var is set; user-provided keys are ignored

### Pitfall 7: Hono writeSSE Security Vulnerability (CVE-2026-29085)

**What goes wrong:** SSE control field injection via CR/LF characters in event data
**Why it happens:** Hono < 4.12.4 did not validate `event`, `id`, and `retry` fields for newline characters
**How to avoid:** Use Hono >= 4.12.4 (current is 4.12.10, already safe). Still, always `JSON.stringify` event data to escape special characters.
**Warning signs:** Using Hono < 4.12.4

### Pitfall 8: shadcn/ui Path Alias Misconfiguration

**What goes wrong:** `@/components/ui/button` imports fail with "module not found"
**Why it happens:** Vite 6 uses multiple tsconfig files (`tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`); path aliases must be configured in BOTH `tsconfig.json`/`tsconfig.app.json` (for IDE) AND `vite.config.ts` (for bundler)
**How to avoid:** Configure `baseUrl` + `paths` in tsconfig files AND `resolve.alias` in vite.config.ts:

```json
// tsconfig.json AND tsconfig.app.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

```typescript
// vite.config.ts
resolve: {
  alias: { "@": path.resolve(__dirname, "./src") }
}
```

**Warning signs:** Imports work in IDE but fail at build time, or vice versa

## Code Examples

### shadcn/ui cn() Utility

```typescript
// src/client/lib/cn.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### useAuth Hook

```typescript
// src/client/hooks/use-auth.ts
import { useState, useCallback } from "react"
import type { AuthState, Provider } from "@/lib/types"

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({
    status: "disconnected",
    provider: null,
    error: null,
  })

  const connect = useCallback(async (provider: Provider, apiKey: string) => {
    setAuth({ status: "connecting", provider, error: null })

    try {
      const res = await fetch("/api/auth/apikey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key: apiKey }),
      })

      const data = await res.json()

      if (data.status === "ok") {
        setAuth({ status: "connected", provider, error: null })
        return true
      } else {
        setAuth({ status: "error", provider, error: data.message })
        return false
      }
    } catch (err: any) {
      setAuth({ status: "error", provider, error: err.message })
      return false
    }
  }, [])

  return { auth, connect }
}
```

### Globals CSS for Tailwind 4

```css
/* src/client/styles/globals.css */
@import "tailwindcss";
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind config file (`tailwind.config.ts`) | CSS-first config (`@import "tailwindcss"`) | TW4 (Jan 2025) | No tailwind.config.ts needed; plugins via `@tailwindcss/vite` |
| `@vitejs/plugin-react` with Babel | Oxc-based transform | plugin-react v6 (2026) | Only for Vite 8; use v4.x with Vite 6 |
| EventSource for SSE | `fetch` + `ReadableStream` | Always for POST | EventSource only supports GET; chat needs POST |
| `react-router-dom` package | `react-router` package (unified) | React Router 7 | Single `react-router` package for all environments |

**Deprecated/outdated:**
- `tailwind.config.ts` / `tailwind.config.js`: Not needed with Tailwind 4; use CSS `@import` + Vite plugin
- `react-router-dom`: Merged into `react-router` package in v7

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | Yes | v24.14.1 | -- |
| npm | Package management | Yes | 11.11.0 | -- |
| npx | shadcn CLI, spike execution | Yes | 11.11.0 | -- |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None

## Open Questions

1. **`getModels()` function in pi-ai**
   - What we know: `getModel(provider, modelId)` returns a single model. The coding agent has `--list-models` CLI flag.
   - What's unclear: Whether pi-ai exports a programmatic `getModels(provider)` function for listing all available models for a provider.
   - Recommendation: Not needed for Phase 1 (AUTH only requires key validation). For Phase 4 (MODEL-01), investigate the pi-ai exports or build a static model list as fallback.

2. **`streamSimple` third parameter exact shape**
   - What we know: The Nader Dabit gist shows `streamSimple(model, context, { apiKey: "..." })`. The official README doesn't explicitly document the options parameter.
   - What's unclear: Full TypeScript type of the options object (beyond `apiKey`).
   - Recommendation: HIGH confidence on `apiKey` field based on gist code + community examples. The spike (FOUND-04) will confirm this works before building the auth endpoint.

3. **`Agent.setModel()` method existence**
   - What we know: The Nader gist shows `agent.setModel(getModel(...))`. DeepWiki references configuration in constructor only.
   - What's unclear: Whether `setModel` is a real method or from a newer version.
   - Recommendation: Not needed for Phase 1. For Phase 4 (agent recreation on switch per ADR-006), we recreate the Agent instance anyway, so `setModel` is unnecessary.

## Sources

### Primary (HIGH confidence)
- [pi-mono GitHub repo](https://github.com/badlogic/pi-mono) - Agent class, AgentTool, AgentEvent types
- [Nader Dabit PI framework gist](https://gist.github.com/dabit3/e97dbfe71298b1df4d36542aceb5f158) - Complete working code examples for Agent, streamSimple, tools, API key passing
- [Hono streaming docs](https://hono.dev/docs/helpers/streaming) - streamSSE helper usage
- [Hono streamSSE premature closure issue #2050](https://github.com/honojs/hono/issues/2050) - Promise anchor pattern for keeping streams open
- [Vite server proxy docs](https://vite.dev/config/server-options) - server.proxy configuration
- [shadcn/ui Vite installation](https://ui.shadcn.com/docs/installation/vite) - Step-by-step setup with TW4
- [React Router SPA mode](https://reactrouter.com/how-to/spa) - createBrowserRouter for SPA
- npm registry - Version verification for all packages (2026-04-03)

### Secondary (MEDIUM confidence)
- [Nader Dabit substack article](https://nader.substack.com/p/how-to-build-a-custom-agent-framework) - Additional PI framework patterns
- [DeepWiki pi-agent-core analysis](https://deepwiki.com/badlogic/pi-mono/3-pi-agent-core:-agent-framework) - Agent framework architecture
- [CVE-2026-29085 advisory](https://advisories.gitlab.com/pkg/npm/hono/CVE-2026-29085/) - Hono SSE injection vulnerability

### Tertiary (LOW confidence)
- None -- all findings verified with at least two sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified against npm registry on 2026-04-03; stack decisions locked by CLAUDE.md and ADRs
- Architecture: HIGH - Project structure defined in ARCHITECTURE.md; patterns verified with official docs
- Pitfalls: HIGH - Hono streamSSE issue confirmed via GitHub issue #2050; pi-ai apiKey option confirmed via multiple code examples
- pi-agent-core API: HIGH - Agent constructor, subscribe, prompt, AgentTool interface all confirmed via gist + DeepWiki + npm docs

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (30 days -- stable technologies, locked versions)
