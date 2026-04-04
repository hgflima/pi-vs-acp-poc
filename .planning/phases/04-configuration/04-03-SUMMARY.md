---
phase: 04-configuration
plan: 03
subsystem: ui
tags: [react, popover, shadcn, agent-switching, model-switching, inline-auth]

# Dependency graph
requires:
  - phase: 04-configuration plan 01
    provides: backend types, models endpoint, harness endpoint, createAgent factory
  - phase: 04-configuration plan 02
    provides: useAgent hook, useHarness hook, fetchModels API helper, popover shadcn component
provides:
  - AgentModelPopover component with agent list + model list in controlled popover
  - InlineAuth component for API key entry when provider unauthenticated
  - Rewritten ChatHeader with dynamic agent icon, name, model badge, harness dot, settings link
  - ChatLayout wired to useAgent and useHarness for dynamic model/provider in send/retry
affects: [04-configuration plan 04 (settings page), future chat enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns: [popover-controlled-state, prop-drilling-from-layout, clear-on-switch]

key-files:
  created:
    - src/client/components/config/agent-model-popover.tsx
    - src/client/components/config/inline-auth.tsx
  modified:
    - src/client/components/chat/chat-header.tsx
    - src/client/components/chat/chat-layout.tsx

key-decisions:
  - "Popover uses controlled open state with explicit setOpen(false) on every selection (Pitfall 5 defense)"
  - "ChatLayout calls clearMessages before switchAgent/switchModel to ensure chat clears on every switch (D-05)"
  - "Harness dot is a clickable Link to /settings wrapped in Tooltip per D-09"
  - "TooltipTrigger uses render prop with Link for harness dot and settings icon (base-ui pattern)"

patterns-established:
  - "Controlled popover: useState<boolean> + open/onOpenChange props on Popover root"
  - "Agent icon helper: function that maps icon string to Bot/Cpu lucide component"
  - "Clear-on-switch: ChatLayout handles clearMessages before hook state updates"

requirements-completed: [AGENT-01, AGENT-02, AGENT-03, AGENT-04, MODEL-01, MODEL-02, MODEL-03, MODEL-04]

# Metrics
duration: 3min
completed: 2026-04-04
---

# Phase 4 Plan 3: Agent/Model Switching UI Summary

**AgentModelPopover with agent list + model list, InlineAuth for inline API key, dynamic ChatHeader with harness dot Link, and ChatLayout wired to useAgent/useHarness for dynamic model/provider**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-04T11:10:41Z
- **Completed:** 2026-04-04T11:13:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- AgentModelPopover renders agents with icons + models in 280px popover with green dot selection indicators
- InlineAuth provides API key form with save button, loading spinner, and error feedback when provider unauthenticated
- ChatHeader fully rewritten: dynamic agent icon/name via popover trigger, model badge, clickable harness dot, settings icon
- ChatLayout uses useAgent() and useHarness() hooks for dynamic model/provider in handleSend/handleRetry

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AgentModelPopover and InlineAuth components** - `a530c56e` (feat)
2. **Task 2: Rewrite ChatHeader + wire ChatLayout with dynamic agent/model state** - `e3128df8` (feat)

## Files Created/Modified
- `src/client/components/config/agent-model-popover.tsx` - Popover with agent section + model section, controlled state, InlineAuth conditional
- `src/client/components/config/inline-auth.tsx` - API key form with password input, save button, error/loading states
- `src/client/components/chat/chat-header.tsx` - Dynamic header with popover trigger, model badge, harness dot Link, settings icon
- `src/client/components/chat/chat-layout.tsx` - Orchestrator wiring useAgent/useHarness with dynamic model/provider in send/retry

## Decisions Made
- Popover uses controlled open state with explicit setOpen(false) on every selection to prevent stale open states (Pitfall 5)
- ChatLayout calls clearMessages() before switchAgent/switchModel to ensure chat always clears on switch (D-05)
- Harness dot is a clickable Link to /settings wrapped in Tooltip, not just a visual indicator (D-09)
- TooltipTrigger uses `render` prop with Link elements rather than `asChild` (base-ui/shadcn v4 pattern)
- PopoverTrigger uses `render` prop with button element for proper trigger behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cherry-picked plan 02 dependencies into worktree**
- **Found during:** Pre-task setup
- **Issue:** Plan 02 feat commits (shadcn popover, hooks) were on parallel worktree, not in this worktree's history
- **Fix:** Cherry-picked commits 3eeb9da6 and 80da3eba to get popover component, useAgent, useHarness, API helpers
- **Files affected:** 6 files from plan 02
- **Verification:** TypeScript compilation passed after cherry-pick

**2. [Rule 1 - Bug] Used render prop instead of asChild for TooltipTrigger and PopoverTrigger**
- **Found during:** Task 1 and Task 2
- **Issue:** base-ui/shadcn v4 components use `render` prop pattern, not Radix `asChild` for composing with custom elements
- **Fix:** Used `render={<button type="button" />}` for PopoverTrigger and `render={<Link to="/settings" ... />}` for TooltipTrigger
- **Files modified:** agent-model-popover.tsx, chat-header.tsx
- **Verification:** TypeScript compilation passed

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both necessary for correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## Known Stubs
None -- all components are fully wired to hooks and render dynamic data.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Agent/model switching UI complete, ready for settings page (Plan 04)
- ChatLayout fully dynamic -- no more hardcoded agent/model references
- Settings page at /settings route needed (Plan 04) for harness configuration

## Self-Check: PASSED

- All 4 created/modified files exist on disk
- Both task commits (a530c56e, e3128df8) found in git history
- TypeScript compiles without errors

---
*Phase: 04-configuration*
*Completed: 2026-04-04*
