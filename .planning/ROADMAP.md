# Roadmap: Pi AI Chat Web

## Overview

This POC validates whether pi-ai + pi-agent-core can sustain a chat web experience with real-time streaming, tool call visualization, agent/model switching, and harness loading. The roadmap moves from scaffolding and provider connection (Phase 1), through the critical streaming pipeline (Phase 2), to tool card rendering (Phase 3), and finally configuration capabilities (Phase 4). Phase 2 is the make-or-break phase -- if the streaming pipeline works end-to-end, the rest is incremental UI on top of a proven foundation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation + Connection** - Scaffold both apps, shared types, API spike, and provider auth so the system is wired end-to-end
- [ ] **Phase 2: Streaming Chat** - Build the complete streaming pipeline from pi-agent-core Agent through SSE adapter through frontend parser to rendered messages
- [ ] **Phase 3: Tool Visualization** - Render tool calls with type-specific cards (bash, file, search, agent, toolsearch, generic) during streaming
- [ ] **Phase 4: Configuration** - Agent switching, model switching, and harness loading to complete the full POC feature set

## Phase Details

### Phase 1: Foundation + Connection
**Goal**: User can launch the app, connect to a provider via API Key, and navigate to an empty chat screen -- proving the frontend-backend pipeline works end-to-end
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. Running `npm run dev` starts both Vite frontend and Hono backend with proxy working (requests from :5173 reach :3001)
  2. User sees a connection page, can select a provider (Anthropic or OpenAI), enter an API Key, and get visual feedback (connecting/connected/error)
  3. After successful connection, user is navigated to the chat page (empty state)
  4. API Key is stored only on the backend -- never returned to or visible in the frontend
  5. A standalone spike script validates pi-agent-core Agent creation, event subscription, and stream lifecycle before the main app is built
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

**UI hint**: yes

### Phase 2: Streaming Chat
**Goal**: User can send a message and see the assistant's response arrive token-by-token in real time, with markdown rendering, stop generation, error handling, and smooth scroll -- validating the core hypothesis that pi-ai + pi-agent-core sustain a streaming chat experience
**Depends on**: Phase 1
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, CHAT-08, CHAT-09, CHAT-10
**Success Criteria** (what must be TRUE):
  1. User sends a message and sees tokens stream in real time with latency under 500ms to first visible token
  2. Streaming responses render as Markdown with syntax-highlighted code blocks
  3. User can click "Stop" to abort generation mid-stream, and the input re-enables for the next message
  4. If the backend errors during streaming, the user sees an inline error with a retry button that works
  5. Chat auto-scrolls during streaming but pauses when user scrolls up; user and assistant messages are visually distinct
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

**UI hint**: yes

### Phase 3: Tool Visualization
**Goal**: When the assistant uses tools during a conversation, each tool call renders as a type-specific card with live status updates -- proving pi-agent-core's tool events flow through the entire pipeline to differentiated UI
**Depends on**: Phase 2
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-07, TOOL-08
**Success Criteria** (what must be TRUE):
  1. Tool calls appear inline within the assistant's response (interleaved with text, not as separate messages) with a running/done/error lifecycle
  2. At least 6 tool types render with visually distinct cards: bash (terminal), read/write (file with path), glob/grep (search results), subagent/skill (name + status), toolsearch (tool list), and a generic fallback
  3. Tool cards update in real time during streaming (params appear at start, output streams during execution, final status shows at end)
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

**UI hint**: yes

### Phase 4: Configuration
**Goal**: User can switch agents (Claude Code / Codex), switch models within a provider, and load harness files -- completing the full POC feature set and proving the stack supports runtime configuration
**Depends on**: Phase 2 (Phase 3 is not a strict dependency -- agent/model switching and harness loading operate on the chat pipeline, not on tool cards)
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, MODEL-01, MODEL-02, MODEL-03, MODEL-04, HARN-01, HARN-02, HARN-03, HARN-04
**Success Criteria** (what must be TRUE):
  1. User can switch between Claude Code and Codex via a selector in the header; the active agent is visually indicated and the next message uses the selected agent
  2. User can pick a model from a dropdown that lists models available for the current provider (via getModels); model list updates when the agent/provider changes
  3. If the user selects an agent whose provider is not authenticated, the app prompts for authentication before proceeding
  4. User can select harness files (CLAUDE.md, AGENTS.md, skills, hooks), see confirmation that harness is active, and the agent's behavior reflects the loaded harness in subsequent messages
  5. Errors in harness loading (file not found, too large, invalid format) surface as clear feedback rather than silent failures
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Connection | 0/3 | Not started | - |
| 2. Streaming Chat | 0/3 | Not started | - |
| 3. Tool Visualization | 0/2 | Not started | - |
| 4. Configuration | 0/3 | Not started | - |
