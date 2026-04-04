# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-04
**Phases:** 4 | **Plans:** 18 | **Tasks:** 34

### What Was Built
- Full streaming chat pipeline: pi-agent-core Agent → SSE adapter → fetch parser → React rendered messages with Markdown + Shiki code blocks
- 8 visually distinct tool card components (bash/terminal, file read/write, glob/grep search, subagent, skill, toolsearch, generic) rendering inline during streaming
- Agent/model switching with dynamic model lists via pi-ai getModels, inline auth for unauthenticated providers
- Harness loading system: directory picker, file status, system prompt injection, persistent state via HarnessContext
- Connection page with provider selection, API key validation, and auto-redirect to chat

### What Worked
- **Coarse phase granularity** (4 phases instead of 8+) kept overhead low and momentum high for a 2-day POC
- **Promise anchor pattern** designed into Phase 2 from the start prevented SSE premature closure issues entirely
- **Segment-based message model** (defined in Phase 1 types) enabled clean tool/text interleaving in Phase 3 without refactoring
- **subscribe() before prompt()** pattern caught early in research, avoided event loss bugs
- **Gap closure plans** (01-04, 01-05, 04-05) were effective at fixing issues found during UAT without disrupting phase flow

### What Was Inefficient
- **4 requirements left unchecked** (FOUND-04, AUTH-01, AUTH-03, AUTH-05) despite being implemented — REQUIREMENTS.md wasn't updated during execution
- **Progress table in ROADMAP.md** showed Phase 3-4 as "Planned/Not started" even after completion — sync lag between execution and roadmap state
- **pi-ai streamSimple** doesn't throw on invalid API keys (returns empty result), requiring a workaround via AssistantMessage inspection — cost 2 extra gap-closure plans

### Patterns Established
- **SSE streaming pattern:** Agent factory → stream adapter → SSE → async generator parser → useReducer dispatch
- **Tool card pattern:** toolNameToVariant mapping → ToolCard router (switch/case) → variant-specific component with GenericCard fallback
- **Gap closure pattern:** UAT/Verification finds gap → new plan added to phase (01-04, 01-05, 04-05) → executed immediately
- **React.memo on completed messages** prevents O(n) re-renders during streaming

### Key Lessons
1. **Define types early and carefully** — shared types (Message, SSEEvent, segments[]) established in Phase 1 paid off in every subsequent phase
2. **Research pi-agent-core pitfalls before coding** — the 3 pitfalls identified in research (Promise anchor, subscribe-before-prompt, stale renders) would have been painful to debug in production
3. **Inline auth is essential for agent switching UX** — switching to an unauthenticated agent needs immediate auth, not a redirect to connection page
4. **HarnessContext must live above Router** — state held inside route components is destroyed on navigation; context providers must wrap RouterProvider

### Cost Observations
- Model mix: primarily sonnet for execution, opus for planning
- Sessions: ~6 sessions across 2 days
- Notable: 18 plans in 2 days = high velocity; coarse granularity and yolo mode reduced overhead significantly

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~6 | 4 | Coarse granularity (4 phases for full POC), yolo mode |

### Top Lessons (Verified Across Milestones)

1. Define shared types in Phase 1 — they compound across every subsequent phase
2. Research library pitfalls before coding — saves gap-closure plans later
