---
phase: 03-tool-visualization
plan: 01
subsystem: api
tags: [pi-agent-core, AgentTool, SSE, tool-events, typebox, streaming]

# Dependency graph
requires:
  - phase: 02-streaming-chat
    provides: SSE stream adapter, agent factory, chat endpoint
provides:
  - Server-side POC tools (bash, read_file, list_files) registered in agent factory
  - Stream adapter forwarding tool_execution_* AgentEvents as tool_start/tool_update/tool_end SSE events
  - extractTextFromResult helper with 10KB truncation
affects: [03-02, 03-03, 03-04]

# Tech tracking
tech-stack:
  added: ["@sinclair/typebox (Type.Object, Type.String, Type.Optional)"]
  patterns: ["AgentTool definition pattern with execute returning content/details", "extractTextFromResult for safe SSE payload extraction"]

key-files:
  created: [src/server/agent/tools.ts]
  modified: [src/server/agent/setup.ts, src/server/lib/stream-adapter.ts]

key-decisions:
  - "Tool execute functions return errors instead of throwing, matching pi-agent-core convention"
  - "10KB truncation applied both in readFileTool content and extractTextFromResult SSE payloads"

patterns-established:
  - "AgentTool pattern: name/label/description/parameters(Type.Object)/execute with try-catch returning content array"
  - "Stream adapter event mapping: AgentEvent type -> SSE event name with JSON.stringify payload"

requirements-completed: [TOOL-01]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 3 Plan 1: Server-Side Tool Registration and SSE Event Forwarding Summary

**Three POC tools (bash, read_file, list_files) registered in agent factory with stream adapter extended to emit tool_start/tool_update/tool_end SSE events**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T22:06:14Z
- **Completed:** 2026-04-03T22:09:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created three server-side AgentTool definitions (bash with 30s timeout, read_file with 10KB truncation, list_files) and exported as pocTools array
- Registered tools in agent factory with tool-aware system prompt that instructs the LLM to use tools for filesystem/command operations
- Extended stream adapter with extractTextFromResult helper and three new case handlers mapping tool_execution_start/update/end to tool_start/tool_update/tool_end SSE events

## Task Commits

Each task was committed atomically:

1. **Task 1: Create server-side POC tools and register in agent factory** - `4ea29f0f` (feat)
2. **Task 2: Extend stream adapter to emit tool lifecycle SSE events** - `6afc6c71` (feat)

## Files Created/Modified
- `src/server/agent/tools.ts` - Three AgentTool definitions (bash, read_file, list_files) with pocTools export array
- `src/server/agent/setup.ts` - Imports pocTools, passes to Agent constructor, updated system prompt
- `src/server/lib/stream-adapter.ts` - extractTextFromResult helper, three new tool event cases in switch block

## Decisions Made
- Tool execute functions return errors as content instead of throwing exceptions, consistent with pi-agent-core's expected AgentToolResult return type
- Applied 10KB truncation in both readFileTool (file content) and extractTextFromResult (SSE payloads) for consistent safety limits
- bashTool passes AbortSignal through to child_process exec for cancellation support

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server-side tools are registered and the LLM will now trigger tool_execution_* AgentEvents
- Stream adapter forwards these as SSE events matching the SSEEvent type union from client types.ts
- Plan 03-02 (client-side SSE parser and chat reducer) can now consume these events to build tool segments in the UI

---
*Phase: 03-tool-visualization*
*Completed: 2026-04-03*
