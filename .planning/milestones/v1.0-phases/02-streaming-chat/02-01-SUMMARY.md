---
phase: 02-streaming-chat
plan: 01
subsystem: api
tags: [hono, sse, pi-agent-core, pi-ai, streaming, tailwindcss-typography, shadcn-ui, react-markdown, react-shiki]

# Dependency graph
requires:
  - phase: 01-foundation-connection
    provides: "Hono server, auth routes, credentials store, Provider type"
provides:
  - "POST /api/chat SSE streaming endpoint"
  - "Agent factory (createAgent) for per-request Agent instances"
  - "AgentEvent-to-SSE stream adapter (adaptAgentEvents)"
  - "@tailwindcss/typography plugin registered for prose classes"
  - "shadcn/ui components: textarea, scroll-area, alert, separator, tooltip, badge"
affects: [02-02-useChat-hook, 02-03-markdown-renderer, 02-04-chat-layout]

# Tech tracking
tech-stack:
  added: [react-markdown, remark-gfm, react-shiki, "@tailwindcss/typography"]
  patterns: ["Agent-per-request factory", "Promise anchor for SSE stream lifecycle", "AgentEvent subscriber-to-SSE adapter"]

key-files:
  created:
    - src/server/agent/setup.ts
    - src/server/lib/stream-adapter.ts
    - src/server/routes/chat.ts
    - src/client/components/ui/textarea.tsx
    - src/client/components/ui/scroll-area.tsx
    - src/client/components/ui/alert.tsx
    - src/client/components/ui/separator.tsx
    - src/client/components/ui/tooltip.tsx
    - src/client/components/ui/badge.tsx
  modified:
    - package.json
    - src/client/styles/globals.css
    - src/server/index.ts

key-decisions:
  - "Agent created inside streamSSE callback to scope lifecycle to stream"
  - "subscribe() called before prompt() to avoid missed events (Pitfall 2)"
  - "Promise anchor pattern keeps Hono SSE stream open until agent_end (Pitfall 1)"

patterns-established:
  - "Agent-per-request: new Agent per POST /api/chat, scoped to stream callback"
  - "Promise anchor: new Promise<void>(resolve => { ... }) awaited at end of streamSSE callback"
  - "Event adapter: separate module maps AgentEvent types to SSE writeSSE calls"

requirements-completed: [CHAT-01, CHAT-02]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 2 Plan 01: Backend Streaming Pipeline Summary

**POST /api/chat SSE endpoint with pi-agent-core Agent factory, event-to-SSE adapter, Promise anchor lifecycle, and Phase 2 dependency installation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T16:20:18Z
- **Completed:** 2026-04-03T16:23:25Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Installed Phase 2 dependencies: react-markdown, remark-gfm, react-shiki, @tailwindcss/typography
- Registered @tailwindcss/typography plugin for prose classes in globals.css
- Added 6 shadcn/ui components (textarea, scroll-area, alert, separator, tooltip, badge)
- Built complete backend streaming pipeline: Agent factory, AgentEvent-to-SSE adapter, chat route with Promise anchor and abort handling
- Registered POST /api/chat route in Hono server

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, register typography plugin, and add shadcn/ui components** - `4e3a0185` (chore)
2. **Task 2: Create Agent factory, stream adapter, chat route, and register in server** - `86c5d2fd` (feat)

## Files Created/Modified
- `src/server/agent/setup.ts` - Agent factory: creates per-request Agent with pi-agent-core
- `src/server/lib/stream-adapter.ts` - Maps AgentEvent (text_delta, agent_end) to SSE writeSSE calls
- `src/server/routes/chat.ts` - POST /api/chat with streamSSE, Promise anchor, abort handling
- `src/server/index.ts` - Registers chatRoutes at /api/chat
- `src/client/styles/globals.css` - Added @plugin "@tailwindcss/typography" directive
- `src/client/components/ui/textarea.tsx` - shadcn/ui textarea component
- `src/client/components/ui/scroll-area.tsx` - shadcn/ui scroll-area component
- `src/client/components/ui/alert.tsx` - shadcn/ui alert component
- `src/client/components/ui/separator.tsx` - shadcn/ui separator component
- `src/client/components/ui/tooltip.tsx` - shadcn/ui tooltip component
- `src/client/components/ui/badge.tsx` - shadcn/ui badge component
- `package.json` - Added 4 new dependencies

## Decisions Made
- Agent is created inside the streamSSE callback (not before) so its lifecycle is scoped to the stream
- subscribe() is called before prompt() to avoid missing early events (per Pitfall 2 from research)
- Promise anchor pattern used to keep Hono SSE stream open until agent_end fires (per Pitfall 1)
- stream.onAbort() calls agent.abort() to stop provider token consumption on client disconnect (per Pitfall 5)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- shadcn CLI (`npx shadcn@latest`) failed due to npm script resolution conflict; resolved by running the local binary directly (`./node_modules/.bin/shadcn add ...`)

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all code is functional, no placeholder data.

## Next Phase Readiness
- Backend streaming pipeline complete, ready for Plan 02 (useChat hook + SSE parser)
- Plan 03 (MarkdownRenderer) can use @tailwindcss/typography prose classes
- All shadcn/ui components needed by Plans 03-04 are installed

## Self-Check: PASSED

All 12 created/modified files verified on disk. Both task commits (4e3a0185, 86c5d2fd) confirmed in git log.

---
*Phase: 02-streaming-chat*
*Completed: 2026-04-03*
