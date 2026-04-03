<!-- GSD:project-start source:PROJECT.md -->
## Project

**Pi AI Chat Web**

Um chat web (SPA + Backend Proxy) que valida se a stack `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core` consegue sustentar uma experiencia de chat similar ao Claude.ai/ChatGPT — com streaming em tempo real, troca de agentes (Claude Code / Codex), troca de modelos, carregamento de harness e visualizacao diferenciada de tool calls. Uso pessoal do autor para decidir se a stack e viavel para um produto futuro.

**Core Value:** Provar que pi-ai + pi-agent-core sustentam um chat web com streaming em tempo real, tool calls visiveis e troca de agentes — a validacao tecnica que decide se a stack segue para MVP.

### Constraints

- **Stack:** pi-ai + pi-agent-core obrigatorios — sao o objeto de validacao
- **Infraestrutura:** Sem banco de dados, sem deploy, local-only
- **Usuarios:** Single-user (o proprio autor)
- **Seguranca:** API keys nao podem ser expostas no frontend (proxy obrigatorio)
- **Agent switching:** Nova instancia de Agent a cada troca (ADR-006), contexto via history
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Summary
## Recommended Stack
### Core (Non-Negotiable)
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@mariozechner/pi-ai` | ^0.64.0 | Unified LLM API (stream, auth, model registry) | **Validation target** -- the whole POC exists to test this | HIGH |
| `@mariozechner/pi-agent-core` | ^0.64.0 | Agent runtime (Agent, tools, events, streamProxy) | **Validation target** -- agent loop and tool execution | HIGH |
### Frontend Framework
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | ^19.2.0 | UI framework | Mature ecosystem, required by shadcn/ui, ADR decision | HIGH |
| React DOM | ^19.2.0 | DOM rendering | Paired with React | HIGH |
| TypeScript | ^5.7.0 | Type safety | Required for pi-ai/pi-agent-core typed APIs | HIGH |
### Build Tool
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vite | ^6.2.0 | Dev server + bundler | Fast HMR, TypeScript native, dev proxy for backend | HIGH |
| `@vitejs/plugin-react` | ^4.4.0 | React Fast Refresh | Official React plugin for Vite 6 | HIGH |
- Vite 8 introduces CommonJS interop breaking changes that may affect pi-ai/pi-agent-core imports
- `@vitejs/plugin-react` v6 (for Vite 8) drops Babel and uses Oxc -- new territory with potential edge cases
- Vite 6 builds are already fast enough for a local-only single-developer POC
- Migration from 6 to 8 is straightforward later if needed
### Styling
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | ^4.2.0 | Utility-first CSS | ADR decision, shadcn/ui requirement, pi-web-ui also uses TW4 | HIGH |
| `tailwind-merge` | ^3.5.0 | Class deduplication | Resolves conflicting Tailwind classes in `cn()` utility | HIGH |
| `clsx` | ^2.1.1 | Conditional classes | Used by shadcn/ui's `cn()` helper, tiny (239B) | HIGH |
| `class-variance-authority` | ^0.7.1 | Component variants | Type-safe variant props for component styling | MEDIUM |
### Component Library
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| shadcn/ui (CLI v4) | Latest (CLI) | Headless component primitives | Copy-paste components, full control, Tailwind-native | HIGH |
| Radix UI primitives | Various | Accessible headless components | shadcn/ui is built on Radix, installed automatically | HIGH |
### Routing
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `react-router` | ^7.13.0 | Client-side SPA routing | Two routes only (`/` and `/chat`), SPA mode | HIGH |
### Backend Framework
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Hono | ^4.12.0 | HTTP server + SSE streaming | TypeScript-first, streaming helpers, lightweight | HIGH |
| `@hono/node-server` | ^1.19.0 | Node.js adapter for Hono | Runs Hono on Node.js (required for pi-agent-core tools) | HIGH |
### Streaming (SSE)
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Hono `streamSSE` | Built-in | Server-side SSE emission | Part of Hono's streaming helpers, zero config | HIGH |
| Native `EventSource` API | Browser built-in | Client-side SSE consumption | Standard browser API, auto-reconnection | MEDIUM |
| `fetch` + `ReadableStream` | Browser built-in | Alternative SSE client for POST requests | EventSource only supports GET; chat needs POST | HIGH |
### Markdown Rendering
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `react-markdown` | ^10.1.0 | Render assistant markdown responses | Standard React markdown renderer | HIGH |
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown | Tables, strikethrough, tasklists in responses | HIGH |
### Syntax Highlighting
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `react-shiki` | ^0.9.0 | Code block highlighting in messages | React wrapper for Shiki, VS Code-quality highlighting | MEDIUM |
### Icons
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `lucide-react` | ^1.7.0 | UI icons | Default icon set for shadcn/ui, tree-shakable | HIGH |
## Key Discovery: @mariozechner/pi-web-ui
- Message history + streaming
- Tool execution visualization
- Artifact rendering (HTML, SVG, Markdown) in sandboxed iframes
- File attachments with text extraction
- IndexedDB persistence
- Model selector and settings dialogs
### Recommendation: Use as Reference, Not Dependency
| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Use pi-web-ui directly | Immediate functionality, maintained by pi-mono team | Lit + web components, not React; no shadcn/ui integration; styling mismatch | **NO** -- architecture chose React |
| Wrap pi-web-ui in React | Reuse logic, adapt rendering | Web component/React interop is fragile; state sync issues; defeats the POC's purpose | **NO** -- too much friction |
| Use as reference implementation | Study event mapping, stream consumption, tool rendering patterns | Requires reimplementation in React | **YES** -- learn from it, build React equivalents |
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
## Installation
# Core (non-negotiable)
# Frontend
# Backend
# Markdown + syntax highlighting
# Icons
# Dev dependencies
# shadcn/ui setup (run after project init)
# Then add components as needed:
## Version Pinning Strategy
| Package | Pin Strategy | Rationale |
|---------|-------------|-----------|
| pi-ai, pi-agent-core | `^0.64.0` (caret) | Track minor updates from pi-mono; they are pre-1.0 so minor = features |
| React, React DOM | `^19.2.0` (caret) | Stable major; patches are safe |
| Vite | `^6.2.0` (caret) | Stay on 6.x; do NOT auto-upgrade to 7 or 8 |
| Hono | `^4.12.0` (caret) | Actively maintained; patches are safe |
| Tailwind CSS | `^4.2.0` (caret) | v4 is stable; no breaking changes expected in 4.x |
| Everything else | Caret (^) | Standard approach for non-critical deps |
## Node.js Version
## Vite Configuration Notes
## Package Manager
- shadcn/ui CLI works best with npm (auto-handles React 19 dependency flags)
- pi-mono packages publish to npm
- Simplest for POC; no workspace config needed
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
