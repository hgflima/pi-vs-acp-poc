---
status: diagnosed
trigger: "Invalid API key produces raw JS error instead of user-friendly message"
created: 2026-04-03T00:00:00Z
updated: 2026-04-03T00:00:00Z
---

## Current Focus

hypothesis: getModel returns undefined because model ID mismatch, causing TypeError before API validation ever runs
test: checked model registry for "claude-3-5-haiku" under "anthropic" provider
expecting: model ID exists -> it does NOT
next_action: report root cause

## Symptoms

expected: Clean "Invalid API key" error message shown on connection page
actual: Raw JS error "Cannot read properties of undefined (reading 'api')" shown
errors: Cannot read properties of undefined (reading 'api')
reproduction: Enter "invalid-key-12345" as API key on connection page, click Connect
started: Always broken (model ID was always wrong)

## Eliminated

(none needed -- root cause found on first hypothesis)

## Evidence

- timestamp: 2026-04-03T00:00:00Z
  checked: src/server/routes/auth.ts line 41-44, getTestModel function
  found: returns "claude-3-5-haiku" for anthropic provider
  implication: this model ID will be passed to getModel("anthropic", "claude-3-5-haiku")

- timestamp: 2026-04-03T00:00:00Z
  checked: node_modules/@mariozechner/pi-ai/dist/models.generated.js lines 1468-1500
  found: under "anthropic" provider, model IDs are "claude-3-5-haiku-20241022" and "claude-3-5-haiku-latest" -- NOT "claude-3-5-haiku"
  implication: getModel("anthropic", "claude-3-5-haiku") returns undefined

- timestamp: 2026-04-03T00:00:00Z
  checked: node_modules/@mariozechner/pi-ai/dist/models.js lines 11-14
  found: getModel returns providerModels?.get(modelId), which is undefined for non-existent IDs
  implication: model variable in auth.ts is undefined

- timestamp: 2026-04-03T00:00:00Z
  checked: node_modules/@mariozechner/pi-ai/dist/stream.js lines 19-21
  found: streamSimple accesses model.api immediately -- TypeError when model is undefined
  implication: TypeError thrown BEFORE any API call is made

- timestamp: 2026-04-03T00:00:00Z
  checked: src/server/routes/auth.ts lines 35-38 (catch block)
  found: catch block forwards error.message verbatim to client
  implication: raw "Cannot read properties of undefined (reading 'api')" reaches the UI

## Resolution

root_cause: getTestModel() in auth.ts returns "claude-3-5-haiku" but the pi-ai model registry under the "anthropic" provider only has "claude-3-5-haiku-20241022" and "claude-3-5-haiku-latest". getModel() silently returns undefined, and streamSimple(undefined, ...) throws a TypeError accessing .api on undefined. This TypeError is caught and its raw message is forwarded to the frontend, so the user sees a JS error instead of "Invalid API key". The invalid API key is never actually tested against the Anthropic API -- the code crashes before reaching that point.
fix: (not applied -- diagnosis only)
verification: (not applied -- diagnosis only)
files_changed: []
