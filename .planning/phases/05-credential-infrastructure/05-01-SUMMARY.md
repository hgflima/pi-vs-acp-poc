---
phase: 05-credential-infrastructure
plan: 01
subsystem: auth
tags: [credentials, oauth, api-key, hono, typescript, pi-ai]

requires:
  - phase: v1.0-foundation
    provides: "Simple Map<Provider, string> credential store and POST /auth/apikey route"
provides:
  - "Compound credential store holding both API Key and OAuth credentials per provider without collision"
  - "Granular API: storeApiKey, storeOAuthTokens, getActiveCredential, clearByType, getAuthStatus, hasAnyCredential"
  - "GET /api/auth/status?provider=... endpoint returning AuthStatus JSON"
  - "OAuth-over-API-Key priority policy (D-01) in getActiveCredential"
  - "POST /api/auth/apikey preserved byte-identical to v1.0 (OAUTH-04)"
affects: [06-anthropic-oauth, 07-openai-oauth, 08-oauth-ui, credentials, auth-status]

tech-stack:
  added: []
  patterns:
    - "Compound credential store: per-provider record of { apiKey, oauth } with priority resolution"
    - "Auth status endpoint pattern: per-provider query returning { hasApiKey, hasOAuth, activeMethod, oauthExpiry? }"
    - "Transitional @ts-expect-error for cross-plan signature changes (chat.ts createAgent)"

key-files:
  created: []
  modified:
    - src/server/lib/credentials.ts
    - src/server/routes/auth.ts
    - src/server/routes/models.ts
    - src/server/routes/chat.ts

key-decisions:
  - "OAuth takes priority over API Key when both credentials exist for a provider (D-01)"
  - "Credential store exposes per-type clearing (clearByType) rather than single clear — enables UI to revoke only one method"
  - "Auth status endpoint returns expiry timestamp only when OAuth is active, absent otherwise"
  - "createAgent no longer receives apiKey from chat.ts — factory will resolve credentials internally in Plan 02 (D-03)"

patterns-established:
  - "Compound credential record: per-provider { apiKey: ApiKeyCredential | null, oauth: OAuthCredential | null }"
  - "Priority resolver in getActiveCredential: returns oauth ?? apiKey ?? null"
  - "Empty-entry cleanup: clearByType deletes provider key when both credentials become null"

requirements-completed: [CRED-01, OAUTH-04]

duration: 4min
completed: 2026-04-04
---

# Phase 05 Plan 01: Credential Store Refactor Summary

**Compound API Key + OAuth credential store with granular per-type API, priority resolution, and GET /auth/status endpoint — v1.0 POST /auth/apikey preserved byte-identical**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04T21:24:12Z
- **Completed:** 2026-04-04T21:27:26Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Replaced `Map<Provider, string>` with compound `Map<Provider, { apiKey, oauth }>` store holding both credential types per provider without collision
- Shipped granular credential API: `storeApiKey`, `storeOAuthTokens`, `getActiveCredential`, `clearByType`, `getAuthStatus`, `hasAnyCredential`
- OAuth-over-API-Key priority resolution (D-01) implemented in `getActiveCredential`
- Added `GET /api/auth/status?provider=...` endpoint exposing per-provider `{ hasApiKey, hasOAuth, activeMethod, oauthExpiry? }` for Phase 8 UI badges
- Preserved POST /api/auth/apikey byte-identical to v1.0 (OAUTH-04 satisfied)
- Migrated `models.ts` and `chat.ts` guards to `hasAnyCredential` — 401/needsAuth response shapes unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor credentials.ts to compound store** - `b10b6edb` (refactor)
2. **Task 2: Update auth.ts + add GET /status** - `3df2a8f2` (feat)
3. **Task 3: Update models.ts + chat.ts guards** - `bf4eee78` (refactor)

## Files Created/Modified

- `src/server/lib/credentials.ts` - Rewrote from 20 LOC simple store to 97 LOC compound store with 6 exports, 3 types, 2 interfaces
- `src/server/routes/auth.ts` - Swapped `storeCredentials` → `storeApiKey`; added `authRoutes.get("/status", ...)` handler
- `src/server/routes/models.ts` - Swapped `hasCredentials` → `hasAnyCredential` on auth guard (401 response unchanged)
- `src/server/routes/chat.ts` - Swapped `getCredentials`+apiKey-passing → `hasAnyCredential` guard; `createAgent` no longer receives apiKey (temporary `@ts-expect-error` pending Plan 02)

## Decisions Made

- **OAuth priority over API Key (D-01 from 05-CONTEXT.md):** `getActiveCredential` returns `entry.oauth ?? entry.apiKey ?? null`. Rationale: when both exist, OAuth is the more explicit user choice and has richer capability (Claude Code / Codex harness features).
- **Per-type clearing via `clearByType(provider, "apiKey" | "oauth")`:** Enables UI to revoke one method without touching the other. Auto-cleanup: when both become null the provider entry is deleted entirely.
- **`oauthExpiry` only present when OAuth active:** `AuthStatus` uses an optional field (undefined when no OAuth) rather than a sentinel value. Keeps the JSON minimal.
- **Transitional `@ts-expect-error` on chat.ts createAgent call:** Plan 02 will update `createAgent` signature to drop the `apiKey` param (D-03: factory resolves credentials internally). Rather than edit both files in Plan 01, we isolate the signature change to Plan 02 and use the expect-error marker to keep the type check clean.

## Deviations from Plan

None — plan executed exactly as written. Acceptance criteria for all three tasks passed on first verification.

**Scope note:** Two pre-existing TypeScript errors surfaced in the modified files' type check output:
- `auth.ts(32,38)`: `getModel(provider, getTestModel(provider))` type mismatch — existed on baseline commit 322228a9
- `models.ts(20,28)`: `getModels(provider)` KnownProvider narrowing — existed on baseline commit 322228a9

Both confirmed pre-existing via `git stash` comparison against the unmodified files. Out of scope per SCOPE BOUNDARY rule. Logged to `.planning/phases/05-credential-infrastructure/deferred-items.md` with root-cause analysis and recommendations.

Full-build typecheck (`tsc -p tsconfig.node.json --noEmit`) reports 7 errors — identical count to the pre-plan baseline. **Zero new TypeScript errors introduced by this plan.**

## Issues Encountered

None.

## User Setup Required

None — in-memory credential store, no external services touched.

## Next Phase Readiness

**Plan 05-02 unblocked:**
- `storeOAuthTokens(provider, tokens)` ready for Phase 6-7 OAuth login flows to call
- `getActiveCredential(provider)` ready for the credential resolver the agent factory will invoke
- `@ts-expect-error` on chat.ts:23 must be removed by Plan 02 when `createAgent` signature drops `apiKey`

**Plan 05-03 unblocked:**
- Status endpoint contract stable: `{ hasApiKey, hasOAuth, activeMethod, oauthExpiry? }`
- Frontend can poll this in Phase 8 for OAuth badges

**Known Stubs:** None.

**Deferred Items (tracked, not blocking):** See `deferred-items.md` — 2 pre-existing TypeScript errors, not introduced by this plan.

## Self-Check: PASSED

All claimed files exist on disk. All claimed commits exist in git log.

- Files verified: src/server/lib/credentials.ts, src/server/routes/auth.ts, src/server/routes/models.ts, src/server/routes/chat.ts, 05-01-SUMMARY.md, deferred-items.md
- Commits verified: b10b6edb (Task 1), 3df2a8f2 (Task 2), bf4eee78 (Task 3)

---
*Phase: 05-credential-infrastructure*
*Completed: 2026-04-04*
