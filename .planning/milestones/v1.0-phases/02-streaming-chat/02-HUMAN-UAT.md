---
status: partial
phase: 02-streaming-chat
source: [02-VERIFICATION.md]
started: 2026-04-03T17:00:00.000Z
updated: 2026-04-03T17:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end token streaming
expected: Tokens arrive token-by-token in real time via pi-agent-core with latency < 500ms to first visible token
result: [pending]

### 2. Markdown + Shiki syntax highlighting
expected: Assistant responses render as Markdown with syntax-highlighted code blocks (github-dark theme, copy button on hover)
result: [pending]

### 3. Stop generation mid-stream
expected: Clicking Stop aborts the SSE stream via AbortController, preserves already-received text, re-enables input
result: [pending]

### 4. Auto-scroll pause/resume
expected: Chat auto-scrolls during streaming, pauses when user scrolls up, resumes when scrolled back to bottom
result: [pending]

### 5. Error handling with retry
expected: Invalid API key or backend error shows inline error with retry button that works when clicked
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
