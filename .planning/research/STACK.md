# Technology Stack

**Project:** Pi AI Chat Web (POC)
**Researched:** 2026-04-03
**Overall Confidence:** MEDIUM-HIGH

---

## Executive Summary

The stack is anchored by two non-negotiable packages -- `@mariozechner/pi-ai` and `@mariozechner/pi-agent-core` -- which are the validation targets. Everything else was chosen to support them effectively. The architecture calls for a React SPA frontend with a Hono backend proxy, communicating via SSE for real-time streaming of agent events.

A key discovery during research: `@mariozechner/pi-web-ui` already provides a complete chat UI with streaming, tool visualization, artifacts, and IndexedDB persistence -- but it uses Lit-based web components, not React. The project explicitly chose React + shadcn/ui (per ADRs), so pi-web-ui serves as a **reference implementation** rather than a direct dependency. Its patterns (event mapping, stream consumption, tool rendering) should inform the React implementation.

The recommended stack uses **Vite 6** (not Vite 8) because Vite 8's Rolldown migration introduces CommonJS interop changes and plugin compatibility risks that add unnecessary friction to a 2-hour POC. Vite 6 is stable, well-tested with the React plugin, and adequate for this project's needs. Upgrade to Vite 8 later if the POC evolves to MVP.

---

## Recommended Stack

### Core (Non-Negotiable)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@mariozechner/pi-ai` | ^0.64.0 | Unified LLM API (stream, auth, model registry) | **Validation target** -- the whole POC exists to test this | HIGH |
| `@mariozechner/pi-agent-core` | ^0.64.0 | Agent runtime (Agent, tools, events, streamProxy) | **Validation target** -- agent loop and tool execution | HIGH |

These packages are the reason the project exists. They power streaming (`stream(model, context)`), authentication (`getEnvApiKey`, OAuth), model discovery (`getModels`, `getProviders`), agent lifecycle (`Agent` class, `AgentEvent`), tool execution (`AgentTool`), and browser proxy routing (`streamProxy`).

**Important:** Pin to the same version for both packages. They are released in lockstep from the pi-mono monorepo (currently at 0.64.0 as of March 29, 2026).

### Frontend Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | ^19.2.0 | UI framework | Mature ecosystem, required by shadcn/ui, ADR decision | HIGH |
| React DOM | ^19.2.0 | DOM rendering | Paired with React | HIGH |
| TypeScript | ^5.7.0 | Type safety | Required for pi-ai/pi-agent-core typed APIs | HIGH |

React 19.2 is the latest stable release (October 2025, with 19.2.1 patch in December 2025). It brings improved async orchestration and performance. Use 19.2.x, not 19.0.x -- shadcn/ui is fully compatible.

### Build Tool

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vite | ^6.2.0 | Dev server + bundler | Fast HMR, TypeScript native, dev proxy for backend | HIGH |
| `@vitejs/plugin-react` | ^4.4.0 | React Fast Refresh | Official React plugin for Vite 6 | HIGH |

**Why Vite 6 and not Vite 8:** Vite 8.0 (March 2026) replaces esbuild+Rollup with Rolldown, delivering 10-30x faster builds. However, for a POC:
- Vite 8 introduces CommonJS interop breaking changes that may affect pi-ai/pi-agent-core imports
- `@vitejs/plugin-react` v6 (for Vite 8) drops Babel and uses Oxc -- new territory with potential edge cases
- Vite 6 builds are already fast enough for a local-only single-developer POC
- Migration from 6 to 8 is straightforward later if needed

**Decision: Use Vite 6 for stability. Revisit Vite 8 at MVP stage.**

### Styling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | ^4.2.0 | Utility-first CSS | ADR decision, shadcn/ui requirement, pi-web-ui also uses TW4 | HIGH |
| `tailwind-merge` | ^3.5.0 | Class deduplication | Resolves conflicting Tailwind classes in `cn()` utility | HIGH |
| `clsx` | ^2.1.1 | Conditional classes | Used by shadcn/ui's `cn()` helper, tiny (239B) | HIGH |
| `class-variance-authority` | ^0.7.1 | Component variants | Type-safe variant props for component styling | MEDIUM |

Tailwind CSS 4.2 (February 2026) is a ground-up rewrite: CSS-first configuration (no `tailwind.config.ts` needed for basics), 5x faster full builds, 100x faster incremental builds. Note: Tailwind 4 uses `@import "tailwindcss"` in CSS instead of `@tailwind` directives.

**CVA note:** class-variance-authority 0.7.1 hasn't been updated in over a year. It works fine but consider it maintenance-mode. For this POC, it's adequate. If building an MVP, evaluate `tailwind-variants` as an alternative.

### Component Library

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| shadcn/ui (CLI v4) | Latest (CLI) | Headless component primitives | Copy-paste components, full control, Tailwind-native | HIGH |
| Radix UI primitives | Various | Accessible headless components | shadcn/ui is built on Radix, installed automatically | HIGH |

shadcn/ui is not a package you install -- it's a CLI that copies component source code into your project. The CLI v4 (March 2026) supports Tailwind v4 and React 19 natively. Components get a `data-slot` attribute for styling. No `forwardRef` needed in React 19.

Components needed for this POC (from architecture doc): Button, Input, Select, Card, Dialog, Badge, Alert, Separator, Tooltip, ScrollArea, Textarea -- all available in shadcn/ui.

### Routing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `react-router` | ^7.13.0 | Client-side SPA routing | Two routes only (`/` and `/chat`), SPA mode | HIGH |

React Router 7 in SPA mode (`ssr: false` in config) generates a static `index.html` at build time. For a 2-route POC, this is the simplest approach. No need for framework mode, loaders, or actions.

**Note:** In React Router 7, `react-router-dom` is deprecated. Import everything from `react-router` directly.

### Backend Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Hono | ^4.12.0 | HTTP server + SSE streaming | TypeScript-first, streaming helpers, lightweight | HIGH |
| `@hono/node-server` | ^1.19.0 | Node.js adapter for Hono | Runs Hono on Node.js (required for pi-agent-core tools) | HIGH |

Hono provides built-in `streamSSE` helper that handles all SSE protocol details (headers, chunked encoding, reconnection). This maps directly to the AgentEvent -> SSE adapter pattern in the architecture.

**Why Hono over Express:** Hono is TypeScript-first (no `@types/` needed), has zero dependencies, includes streaming helpers natively, and is growing at 340% YoY (2.8M weekly downloads). Express would require additional middleware for SSE.

### Streaming (SSE)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Hono `streamSSE` | Built-in | Server-side SSE emission | Part of Hono's streaming helpers, zero config | HIGH |
| Native `EventSource` API | Browser built-in | Client-side SSE consumption | Standard browser API, auto-reconnection | MEDIUM |
| `fetch` + `ReadableStream` | Browser built-in | Alternative SSE client for POST requests | EventSource only supports GET; chat needs POST | HIGH |

**Critical detail:** The native `EventSource` API only supports GET requests. The `/api/chat` endpoint requires POST (to send message, model, context). Two options:

1. **Recommended: Use `fetch` with `ReadableStream`** -- POST the message, read the response as a stream, parse SSE events manually with a lightweight parser. This is what ChatGPT, Claude.ai, and most LLM chat UIs do.
2. Alternative: Split into POST (initiate) + GET (stream) with a session ID. More complex, unnecessary for POC.

For parsing the SSE stream from `fetch`, use a manual line parser in `stream-parser.ts` (architecture already has this file). The format is simple (`data: {...}\n\n`), and a custom parser avoids adding a dependency. If you want a dependency, `eventsource-parser` (3.0.6) is the standard choice.

### Markdown Rendering

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `react-markdown` | ^10.1.0 | Render assistant markdown responses | Standard React markdown renderer | HIGH |
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown | Tables, strikethrough, tasklists in responses | HIGH |

### Syntax Highlighting

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `react-shiki` | ^0.9.0 | Code block highlighting in messages | React wrapper for Shiki, VS Code-quality highlighting | MEDIUM |

**Why react-shiki over raw shiki:** react-shiki provides a `ShikiHighlighter` component and `isInlineCode` helper that integrates directly with react-markdown's `components` prop. It handles the React rendering lifecycle correctly (async grammar loading, etc.).

**Bundle size consideration:** The full Shiki bundle is ~1.2MB gzipped. Use the "web" bundle (~695KB) or "core" bundle with only the languages you need (TypeScript, JavaScript, Bash, JSON, Markdown). For a POC, the web bundle is fine; optimize at MVP stage.

**Alternative: Use `rehype-pretty-code`** if you prefer a rehype plugin approach over a component. Both work, but react-shiki gives more control over rendering.

### Icons

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `lucide-react` | ^1.7.0 | UI icons | Default icon set for shadcn/ui, tree-shakable | HIGH |

---

## Key Discovery: @mariozechner/pi-web-ui

During research, I discovered that the pi-mono ecosystem includes `@mariozechner/pi-web-ui` -- a **complete chat UI** with:
- Message history + streaming
- Tool execution visualization
- Artifact rendering (HTML, SVG, Markdown) in sandboxed iframes
- File attachments with text extraction
- IndexedDB persistence
- Model selector and settings dialogs

**However, it uses Lit web components, not React.** The project's ADRs chose React + shadcn/ui.

### Recommendation: Use as Reference, Not Dependency

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Use pi-web-ui directly | Immediate functionality, maintained by pi-mono team | Lit + web components, not React; no shadcn/ui integration; styling mismatch | **NO** -- architecture chose React |
| Wrap pi-web-ui in React | Reuse logic, adapt rendering | Web component/React interop is fragile; state sync issues; defeats the POC's purpose | **NO** -- too much friction |
| Use as reference implementation | Study event mapping, stream consumption, tool rendering patterns | Requires reimplementation in React | **YES** -- learn from it, build React equivalents |

Study these pi-web-ui patterns specifically:
1. How `AgentInterface` maps `AgentEvent` types to UI updates
2. How `ChatPanel` orchestrates streaming state
3. How tool execution cards handle running/done/error states
4. The `convertToLlm` function for message format conversion

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Build tool | Vite 6 | Vite 8 | CommonJS interop risks with pi-ai packages; unnecessary for POC |
| Build tool | Vite 6 | Next.js | Over-engineered for SPA POC; SSR unnecessary; ADR chose Vite |
| Backend | Hono | Express | No built-in TypeScript, no streaming helpers, more boilerplate |
| Backend | Hono | Fastify | Heavier, more config; Hono's SSE helper is purpose-built |
| State management | useReducer + Context | Zustand | Overkill for 1-user POC with 3 screens; ADR chose local state |
| State management | useReducer + Context | Jotai/Valtio | Same reason -- POC simplicity wins |
| Styling | Tailwind CSS 4 | CSS Modules | shadcn/ui requires Tailwind; ADR chose Tailwind |
| Component library | shadcn/ui | Chakra UI / MUI | Heavier, opinionated styling; shadcn/ui gives full control |
| Chat UI | Custom React | pi-web-ui | Lit web components, not React; architecture chose React |
| Chat UI | Custom React | Vercel AI SDK UI | Different streaming protocol; doesn't integrate with pi-ai/pi-agent-core events |
| SSE client | fetch + ReadableStream | EventSource API | EventSource only supports GET; chat requires POST |
| Routing | React Router 7 | TanStack Router | Two routes only; React Router is simpler for minimal SPA |
| Markdown | react-markdown | MDX | MDX is for authoring, not rendering LLM responses |
| Syntax highlighting | react-shiki | highlight.js / Prism | Shiki provides VS Code-quality highlighting; industry moving to Shiki |

---

## Installation

```bash
# Core (non-negotiable)
npm install @mariozechner/pi-ai@^0.64.0 @mariozechner/pi-agent-core@^0.64.0

# Frontend
npm install react@^19.2.0 react-dom@^19.2.0 react-router@^7.13.0

# Backend
npm install hono@^4.12.0 @hono/node-server@^1.19.0

# Markdown + syntax highlighting
npm install react-markdown@^10.1.0 remark-gfm@^4.0.1 react-shiki@^0.9.0

# Icons
npm install lucide-react@^1.7.0

# Dev dependencies
npm install -D typescript@^5.7.0 vite@^6.2.0 @vitejs/plugin-react@^4.4.0
npm install -D tailwindcss@^4.2.0 @tailwindcss/vite@^4.2.0
npm install -D @types/react@^19.0.0 @types/react-dom@^19.0.0

# shadcn/ui setup (run after project init)
npx shadcn@latest init
# Then add components as needed:
npx shadcn@latest add button input select card dialog badge alert separator tooltip scroll-area textarea
```

**Note on shadcn/ui:** The `npx shadcn@latest init` command will automatically install `tailwind-merge`, `clsx`, `class-variance-authority`, and required Radix UI primitives. Do not install these manually beforehand.

---

## Version Pinning Strategy

| Package | Pin Strategy | Rationale |
|---------|-------------|-----------|
| pi-ai, pi-agent-core | `^0.64.0` (caret) | Track minor updates from pi-mono; they are pre-1.0 so minor = features |
| React, React DOM | `^19.2.0` (caret) | Stable major; patches are safe |
| Vite | `^6.2.0` (caret) | Stay on 6.x; do NOT auto-upgrade to 7 or 8 |
| Hono | `^4.12.0` (caret) | Actively maintained; patches are safe |
| Tailwind CSS | `^4.2.0` (caret) | v4 is stable; no breaking changes expected in 4.x |
| Everything else | Caret (^) | Standard approach for non-critical deps |

---

## Node.js Version

**Required: Node.js >= 20.19 or >= 22.12**

Vite 6 requires Node.js 18+, but Hono's node-server adapter and modern Tailwind CSS perform best on Node 20+. Use **Node.js 22 LTS** if available on your machine, otherwise **Node.js 20 LTS**.

---

## Vite Configuration Notes

```typescript
// vite.config.ts - Key configuration for this project
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
```

The Vite dev server proxy routes `/api/*` requests to the Hono backend at port 3001. This avoids CORS issues during development without any extra configuration.

**Tailwind CSS 4 note:** With TW4 + `@tailwindcss/vite`, there is no `tailwind.config.ts` file. Configuration is done via CSS `@theme` blocks in `globals.css`. The `@tailwindcss/vite` plugin replaces the PostCSS approach from TW3.

---

## Package Manager

Use **npm** (not pnpm/yarn/bun) unless you have a strong preference. Rationale:
- shadcn/ui CLI works best with npm (auto-handles React 19 dependency flags)
- pi-mono packages publish to npm
- Simplest for POC; no workspace config needed

---

## Sources

### Official / Authoritative
- [React 19.2 release blog](https://react.dev/blog/2025/10/01/react-19-2) -- HIGH confidence
- [Vite 6 docs](https://vite.dev/releases) -- HIGH confidence
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) -- HIGH confidence
- [Tailwind CSS 4.0 release](https://tailwindcss.com/blog/tailwindcss-v4) -- HIGH confidence
- [Hono streaming helpers](https://hono.dev/docs/helpers/streaming) -- HIGH confidence
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) -- HIGH confidence
- [React Router 7 SPA mode](https://reactrouter.com/how-to/spa) -- HIGH confidence
- [pi-mono GitHub repo](https://github.com/badlogic/pi-mono) -- HIGH confidence

### Package Registries (npm)
- [@mariozechner/pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) -- v0.64.0, March 2026
- [@mariozechner/pi-agent-core](https://www.npmjs.com/package/@mariozechner/pi-agent-core) -- v0.64.0, March 2026
- [@mariozechner/pi-web-ui](https://www.npmjs.com/package/@mariozechner/pi-web-ui) -- reference implementation
- [Hono](https://www.npmjs.com/package/hono) -- v4.12.10
- [@hono/node-server](https://www.npmjs.com/package/@hono/node-server) -- v1.19.12
- [react-shiki](https://www.npmjs.com/react-shiki) -- v0.9.2
- [lucide-react](https://www.npmjs.com/package/lucide-react) -- v1.7.0

### Community / Blog (verified with official sources)
- [SSE for LLM streaming best practices](https://dev.to/pockit_tools/the-complete-guide-to-streaming-llm-responses-in-web-applications-from-sse-to-real-time-ui-3534) -- MEDIUM confidence
- [Hono SSE tutorial](https://dev.to/yanael/hono-with-server-sent-events-6gf) -- MEDIUM confidence
- [Building custom agent with PI stack](https://gist.github.com/dabit3/e97dbfe71298b1df4d36542aceb5f158) -- MEDIUM confidence
- [pi-web-ui DeepWiki analysis](https://deepwiki.com/badlogic/pi-mono/6-@mariozechnerpi-web-ui) -- MEDIUM confidence
