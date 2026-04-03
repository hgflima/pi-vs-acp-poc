# Phase 1: Foundation + Connection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 01-Foundation + Connection
**Mode:** auto (all decisions auto-selected with recommended defaults)
**Areas discussed:** Connection Page Design, Dev Workflow Setup, pi-agent-core Spike Scope, Shared Types Approach

---

## Connection Page Design

### Provider Selection UI

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented control | Tabs-like selector for Anthropic / OpenAI -- ARCHITECTURE.md defines segmented-control.tsx | [auto] |
| Dropdown | Select menu with provider options | |
| Radio buttons | Radio group with provider names | |

**User's choice:** [auto] Segmented control (recommended default)
**Notes:** ARCHITECTURE.md already defines this component in the planned structure

### API Key Input Style

| Option | Description | Selected |
|--------|-------------|----------|
| Password field with show/hide | Standard security pattern, key hidden by default | [auto] |
| Plain text field | Key always visible while typing | |
| Paste-only field | Disable typing, only allow paste | |

**User's choice:** [auto] Password field with show/hide (recommended default)
**Notes:** Standard security practice for credential input

### Connection Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Inline status + auto-redirect | States shown in form, redirect to /chat on success | [auto] |
| Toast notification | Success/error shown as toast overlay | |
| Modal confirmation | Dialog confirming connection before redirect | |

**User's choice:** [auto] Inline status + auto-redirect (recommended default)
**Notes:** Simplest UX, aligns with AUTH-04 requirement

### Connection Visual States

| Option | Description | Selected |
|--------|-------------|----------|
| Button inline states | Button shows spinner/checkmark/error message | [auto] |
| Separate status section | Dedicated area below form for status | |
| Full-page loading overlay | Overlay during connection attempt | |

**User's choice:** [auto] Button inline states (recommended default)
**Notes:** Minimal UI, keeps user context in the form

---

## Dev Workflow Setup

### Frontend + Backend Startup

| Option | Description | Selected |
|--------|-------------|----------|
| concurrently (single npm run dev) | Both servers start with one command | [auto] |
| Separate terminals | Manual start in two terminal windows | |
| Docker Compose | Containerized setup | |

**User's choice:** [auto] concurrently (recommended default)
**Notes:** Best DX for single-developer POC

### Vite Proxy

| Option | Description | Selected |
|--------|-------------|----------|
| /api/* -> localhost:3001 | Standard Vite proxy config | [auto] |
| Full URL rewriting | More complex proxy rules | |

**User's choice:** [auto] /api/* proxy (recommended default)
**Notes:** Standard pattern from ARCHITECTURE.md

---

## pi-agent-core Spike Scope

### Spike Format

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone script in spike/ | Isolated from app, run with npx tsx | [auto] |
| Integration test | Part of test suite | |
| In-app validation route | Backend endpoint that runs validation | |

**User's choice:** [auto] Standalone script (recommended default)
**Notes:** Keeps spike independent from app code, easy to discard later

### Validation Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Agent + events + stream + 1 tool | Covers core API surface | [auto] |
| Minimal (Agent creation only) | Just verify import/instantiation works | |
| Comprehensive (all event types) | Full event type coverage | |

**User's choice:** [auto] Agent + events + stream + 1 tool (recommended default)
**Notes:** Sufficient to validate core hypothesis without over-engineering spike

---

## Shared Types Approach

### Type Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Full Message + SSEEvent + auth, stubs for rest | Define what Phase 1 needs fully, stub future phases | [auto] |
| Minimal (only auth types) | Just what Phase 1 auth needs | |
| Complete AppState from ARCHITECTURE.md | All types upfront | |

**User's choice:** [auto] Full Message + SSEEvent + auth, stubs for rest (recommended default)
**Notes:** Segment-based AssistantMessage must be defined now per STATE.md concern (Pitfall 4 avoidance)

---

## Claude's Discretion

- shadcn/ui component selection for connection page
- Exact folder structure within src/client and src/server
- Spike script internal organization
- tsconfig.json configuration

## Deferred Ideas

None -- analysis stayed within phase scope
