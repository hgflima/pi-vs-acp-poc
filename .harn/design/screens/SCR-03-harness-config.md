# SCR-03: Harness Config

## 1. Meta
- **Route:** Modal overlay on `/chat`
- **Requirements:** BRIEF (Carregamento de harness), JOURNEY Phase 6
- **Status:** Draft
- **Last Updated:** 2026-04-03

## 2. Purpose

Modal para carregar e gerenciar arquivos de harness (CLAUDE.md, AGENTS.md, skills, hooks) que serao aplicados ao system prompt do agente. Permite ao usuario apontar os caminhos dos arquivos e ver o status de cada harness carregado.

## 3. Wireframe

**Estado inicial (nenhum harness carregado)**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│          ┌──────────────────────────────────────────┐           │
│          │                                     [✕]  │           │
│          │  Harness Configuration                   │           │
│          │  Load configuration files for the agent  │           │
│          │                                          │           │
│          │  ┌──────────────────────────────────────┐│           │
│          │  │ CLAUDE.md                            ││           │
│          │  │ ┌────────────────────────────┐       ││           │
│          │  │ │ /path/to/CLAUDE.md         │ [📂]  ││           │
│          │  │ └────────────────────────────┘       ││           │
│          │  │ ○ Not loaded                         ││           │
│          │  └──────────────────────────────────────┘│           │
│          │                                          │           │
│          │  ┌──────────────────────────────────────┐│           │
│          │  │ AGENTS.md                            ││           │
│          │  │ ┌────────────────────────────┐       ││           │
│          │  │ │ /path/to/AGENTS.md         │ [📂]  ││           │
│          │  │ └────────────────────────────┘       ││           │
│          │  │ ○ Not loaded                         ││           │
│          │  └──────────────────────────────────────┘│           │
│          │                                          │           │
│          │  ┌──────────────────────────────────────┐│           │
│          │  │ Skills Directory                     ││           │
│          │  │ ┌────────────────────────────┐       ││           │
│          │  │ │ /path/to/.claude/skills/   │ [📂]  ││           │
│          │  │ └────────────────────────────┘       ││           │
│          │  │ ○ Not loaded                         ││           │
│          │  └──────────────────────────────────────┘│           │
│          │                                          │           │
│          │  ┌──────────────────────────────────────┐│           │
│          │  │ Hooks                                ││           │
│          │  │ ┌────────────────────────────┐       ││           │
│          │  │ │ /path/to/.claude/hooks/    │ [📂]  ││           │
│          │  │ └────────────────────────────┘       ││           │
│          │  │ ○ Not loaded                         ││           │
│          │  └──────────────────────────────────────┘│           │
│          │                                          │           │
│          │         [Cancel]     [Apply Harness]      │           │
│          │                                          │           │
│          └──────────────────────────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Estado com harness carregado**

```
┌─────────────────────────────────────────────────────────────────┐
│          ┌──────────────────────────────────────────┐           │
│          │                                     [✕]  │           │
│          │  Harness Configuration                   │           │
│          │  Load configuration files for the agent  │           │
│          │                                          │           │
│          │  ┌──────────────────────────────────────┐│           │
│          │  │ CLAUDE.md                       [✕]  ││           │
│          │  │ /project/CLAUDE.md                   ││           │
│          │  │ ✓ Loaded — 2.4 KB                    ││           │
│          │  └──────────────────────────────────────┘│           │
│          │                                          │           │
│          │  ┌──────────────────────────────────────┐│           │
│          │  │ AGENTS.md                       [✕]  ││           │
│          │  │ /project/.claude/AGENTS.md           ││           │
│          │  │ ✓ Loaded — 1.1 KB (3 agents)         ││           │
│          │  └──────────────────────────────────────┘│           │
│          │                                          │           │
│          │  ┌──────────────────────────────────────┐│           │
│          │  │ Skills Directory                [✕]  ││           │
│          │  │ /project/.claude/skills/             ││           │
│          │  │ ✓ Loaded — 5 skills                  ││           │
│          │  └──────────────────────────────────────┘│           │
│          │                                          │           │
│          │  ┌──────────────────────────────────────┐│           │
│          │  │ Hooks                                ││           │
│          │  │ ┌────────────────────────────┐       ││           │
│          │  │ │                            │ [📂]  ││           │
│          │  │ └────────────────────────────┘       ││           │
│          │  │ ○ Not loaded                         ││           │
│          │  └──────────────────────────────────────┘│           │
│          │                                          │           │
│          │         [Cancel]     [Apply Harness]      │           │
│          │                                          │           │
│          └──────────────────────────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Layout Structure
- **Overlay:** Full viewport, background `rgba(0,0,0,0.4)` — click outside to dismiss
- **Modal:** Centered, max-width 520px, max-height 80vh, overflow-y auto
- **Modal background:** `color.background.default` (#FFFFFF)
- **Modal border-radius:** `border.radius.xl` (16px)
- **Modal shadow:** `shadow.xl`
- **Modal padding:** spacing.6 (24px)
- **Sections gap:** spacing.4 (16px)
- **Section internal padding:** spacing.4 (16px)
- **Section background:** `color.background.muted` (#F5F5F0)
- **Section border-radius:** `border.radius.lg` (12px)

## 5. Components

| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| Overlay | backdrop | onClick=close | Semi-transparent backdrop |
| Modal | default | maxWidth=520px | Main container |
| IconButton | ghost | icon=close | Top-right close button |
| Heading | h2 | size=xl, weight=semibold | "Harness Configuration" |
| Text | muted | size=sm | Subtitle |
| HarnessSection | card | - | Repeated per harness type |
| Text | label | size=sm, weight=medium | Section title (CLAUDE.md, AGENTS.md, etc.) |
| Input | default | type=text, placeholder="/path/to/..." | Path input |
| IconButton | ghost | icon=folder | Browse/paste path |
| StatusIndicator | not-loaded | - | `○ Not loaded` — gray |
| StatusIndicator | loaded | - | `✓ Loaded — {size}` — green |
| StatusIndicator | error | - | `✕ Error — {message}` — red |
| IconButton | ghost-sm | icon=close | Remove loaded harness |
| Button | ghost | - | "Cancel" |
| Button | primary | - | "Apply Harness" |

## 6. States

### Default State (empty)
- All sections show path inputs with placeholders
- All status: "Not loaded"
- Apply button enabled (applies empty harness / clears)

### Partial Load
- Some sections loaded, some not
- Loaded sections show file info (size, count)
- Apply button enabled

### Fully Loaded
- All sections show loaded status with details
- AGENTS.md: shows agent count
- Skills: shows skill count
- Hooks: shows hook count

### Loading State
- "Apply Harness" shows spinner + "Applying..."
- Sections disabled during apply
- Sequential loading with per-section status updates

### Error State (per section)
- Section shows error icon + message
- "File not found" / "Parse error" / "File too large"
- Other sections unaffected
- Apply still works (skips errored sections)

### Applied State
- Brief success flash
- Modal closes automatically
- Harness indicator in chat header updates (small badge/dot)

## 7. Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| Click overlay | Close modal | Modal fades out |
| Click close (✕) | Close modal | Modal fades out |
| Escape key | Close modal | Modal fades out |
| Enter path + blur | Validate path exists | Status updates: loaded or error |
| Click folder icon | Focus input (POC — no native picker) | Input focused |
| Click section remove (✕) | Clear that harness | Status returns to "Not loaded" |
| Click Cancel | Close without applying | Modal closes, no changes |
| Click Apply | Load all harness files, apply to system prompt | Loading state -> success/error per section |
| Apply success | Close modal, update header indicator | Modal closes, header shows harness active |

## 8. Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| Desktop (all) | Modal centered, max-width 520px — POC is desktop-only |

## 9. Accessibility

- Focus trapped inside modal while open
- First focusable element: first path input
- Escape closes modal
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on heading
- Status changes announced via `aria-live="polite"`
- Close button: `aria-label="Close harness configuration"`

## 10. Content

| Element | Text | Notes |
|---------|------|-------|
| Title | "Harness Configuration" | Modal heading |
| Subtitle | "Load configuration files for the agent" | Below title |
| Section 1 label | "CLAUDE.md" | System instructions |
| Section 2 label | "AGENTS.md" | Agent definitions |
| Section 3 label | "Skills Directory" | Skills folder |
| Section 4 label | "Hooks" | Hooks folder |
| Path placeholder | "/path/to/file..." | Input placeholder |
| Status not loaded | "Not loaded" | Gray, with empty circle |
| Status loaded | "Loaded — {size}" | Green, with checkmark |
| Status loaded detail | "{count} agents" / "{count} skills" | Additional info |
| Status error | "Error — {message}" | Red, with X |
| Cancel button | "Cancel" | Ghost style |
| Apply button | "Apply Harness" | Primary style |
| Apply loading | "Applying..." | With spinner |
