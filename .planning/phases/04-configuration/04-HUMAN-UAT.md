---
status: partial
phase: 04-configuration
source: [04-VERIFICATION.md]
started: 2026-04-04T16:00:00Z
updated: 2026-04-04T16:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Agent Popover Visual Rendering
expected: Clicking the agent name in chat header opens a 280px popover with Bot/Cpu icons, agent list, separator, and model list. Selected items show green dot.
result: [pending]

### 2. Inline Auth Flow
expected: Switching to Codex (unauthenticated) shows API key form with AlertTriangle icon, password input, Save API Key button inside the popover
result: [pending]

### 3. Agent/Model Switch Clears Chat
expected: Clicking a model in the popover closes it, chat clears, and model badge in header shows the new model name
result: [pending]

### 4. Harness Settings End-to-End
expected: Clicking Settings2 icon navigates to /settings. Entering a project path discovers files with status rows. Clicking Load Harness calls backend, navigates to /chat, shows green harness dot in header.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
