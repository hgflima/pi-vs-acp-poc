---
status: complete
phase: 04-configuration
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md]
started: 2026-04-04T18:00:00Z
updated: 2026-04-04T18:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Run `npm run dev` (or equivalent). Server boots without errors, frontend loads at localhost, and chat page renders with header and input area.
result: pass

### 2. Agent Popover Visual Rendering
expected: Clicking the agent name in the chat header opens a 280px popover with Bot/Cpu icons, agent list (Claude Code, Codex), separator, and model list. Selected agent and model show green dot indicators.
result: pass

### 3. Model Switching
expected: Clicking a different model in the popover closes it, chat messages clear, and the model badge in the header updates to show the new model name.
result: pass

### 4. Agent Switching
expected: Switching from Claude Code to Codex (or vice-versa) closes the popover, clears chat, and fetches the new agent's available models. The header updates with the new agent icon and name.
result: pass

### 5. Inline Auth Flow
expected: Switching to Codex (if unauthenticated) shows an API key form inside the popover with AlertTriangle icon, password input, and "Save API Key" button. Submitting a valid key dismisses the form and shows models.
result: pass

### 6. Settings Page Navigation
expected: Clicking the settings (gear) icon in the chat header navigates to /settings. The page shows a "Harness" section with a directory input field and a back-to-chat link/button.
result: pass

### 7. Harness Directory Discovery
expected: Entering a valid project directory path (e.g., the pi-ai-poc root) and triggering load shows per-file status rows with icons indicating found/not-found for CLAUDE.md, AGENTS.md, .claude/skills/, .claude/hooks/.
result: pass

### 8. Harness Load End-to-End
expected: After loading a harness successfully, the app navigates to /chat and a green harness dot appears in the chat header next to the settings icon. The dot persists across page interactions.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
