# Milestones

## v1.0 MVP (Shipped: 2026-04-04)

**Phases completed:** 4 phases, 18 plans, 34 tasks

**Key accomplishments:**

- Vite + React 19 frontend with Hono backend, shared type system (Message/SSEEvent/AppState), React Router, shadcn/ui components, and in-memory credentials store
- API key validation via pi-ai streamSimple test request, connection page with provider selector and inline feedback, auto-redirect to /chat on success
- Fixed auth endpoint model ID (claude-3-5-haiku-latest), added getModel null-check, and sanitized all error messages to prevent raw JS errors leaking to frontend
- API key validation now detects invalid keys via AssistantMessage.stopReason and errorMessage instead of relying on exceptions that never fire
- POST /api/chat SSE endpoint with pi-agent-core Agent factory, event-to-SSE adapter, Promise anchor lifecycle, and Phase 2 dependency installation
- SSE stream parser (async generator) and useChat hook (useReducer) for real-time chat state management with abort support
- React-markdown renderer with GFM + Shiki code blocks, user/assistant message components with visual differentiation, pulsing thinking dots, and blinking streaming cursor
- Complete chat page with auto-grow input, auto-scroll message list, empty state with suggestion chips, inline error retry, and header -- composing Plans 01-03 into end-to-end streaming chat at /chat
- Three POC tools (bash, read_file, list_files) registered in agent factory with stream adapter extended to emit tool_start/tool_update/tool_end SSE events
- Chat reducer extended with TOOL_START/UPDATE/END actions and toolNameToVariant mapping for 6 tool card variants
- 8 visually distinct tool card components with variant-dispatch router and segment-iterating AssistantMessage for inline tool/text interleaving
- Human-verified tool visualization pipeline: bash/file/search cards render inline with real-time status transitions and text interleaving
- Shared types (AgentId, ModelInfo, HarnessState), models endpoint wrapping pi-ai getModels, harness discovery from directory, and dynamic system prompt injection into createAgent
- useAgent hook with dynamic model fetching and inline auth, useHarness hook for harness lifecycle, plus shadcn popover/dialog/label components and API helpers
- AgentModelPopover with agent list + model list, InlineAuth for inline API key, dynamic ChatHeader with harness dot Link, and ChatLayout wired to useAgent/useHarness for dynamic model/provider
- Settings page at /settings with directory picker (drag & drop + manual input), per-file status display, and load/clear harness actions with navigation back to /chat
- HarnessContext lifts harness state above React Router so green dot persists when navigating from /settings to /chat

---
