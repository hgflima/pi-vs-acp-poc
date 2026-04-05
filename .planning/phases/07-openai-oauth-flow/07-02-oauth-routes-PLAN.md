---
phase: 07-openai-oauth-flow
plan: 02
type: execute
wave: 2
depends_on: ["07-01"]
files_modified:
  - src/server/routes/oauth.ts
autonomous: true
requirements: [OAUTH-02, OAUTH-03]
must_haves:
  truths:
    - "POST /api/auth/oauth/start accepts provider: 'openai' and dispatches to loginOpenAICodex (D-03), preserving the existing provider: 'anthropic' → loginAnthropic branch"
    - "POST /api/auth/oauth/start with provider: 'openai' and port 1455 free returns { status: 'started', provider: 'openai', authUrl } with a non-empty authUrl from loginOpenAICodex's onAuth callback"
    - "POST /api/auth/oauth/start with provider: 'openai' and port 1455 occupied returns HTTP 409 with message verbatim: 'Port 1455 is already in use by another process. This port is required by the OpenAI Codex OAuth callback. If you have Codex CLI running, please stop it and try again.' (D-04)"
    - "After loginOpenAICodex resolves, storeOAuthTokens('openai', creds) is called and session.status flips to 'done' (existing Promise-resolver pattern extended per D-03)"
    - "POST /api/auth/oauth/debug/force-expire?provider=openai mutates the stored OAuth credential's expires via forceExpireOAuth('openai') and returns { status: 'ok', provider: 'openai', before: <epoch-ms>, after: <epoch-ms>, message: 'Forced expiry on openai OAuth credential. Next chat request will trigger refresh.' } (D-06)"
    - "POST /api/auth/oauth/debug/force-expire with no OAuth credential stored returns HTTP 404 with message: 'No OAuth credential stored for openai. Complete OAuth login first.' (D-06)"
    - "POST /api/auth/oauth/debug/force-expire is ALWAYS enabled (no NODE_ENV gate per D-07)"
    - "Existing /start + /status behavior for provider: 'anthropic' is preserved byte-for-byte (no regression)"
  artifacts:
    - path: "src/server/routes/oauth.ts"
      provides: "Extended Hono sub-router: POST /start dispatches both providers via loginFnForProvider(provider), port pre-check calls portForProvider(provider), GET /status handles both providers (already does), POST /debug/force-expire for SC#4 UAT"
      exports: ["oauthRoutes"]
  key_links:
    - from: "src/server/routes/oauth.ts"
      to: "loginOpenAICodex from @mariozechner/pi-ai/oauth"
      via: "import + call from loginFnForProvider('openai') branch with { onAuth, onPrompt, onProgress } callbacks (no onManualCodeInput)"
      pattern: "loginOpenAICodex\\("
    - from: "src/server/routes/oauth.ts"
      to: "forceExpireOAuth from ../lib/credentials"
      via: "import + call in POST /debug/force-expire handler"
      pattern: "forceExpireOAuth\\("
    - from: "src/server/routes/oauth.ts"
      to: "ensurePortFree helper (same file)"
      via: "pre-check called with portForProvider(provider) — 1455 for openai, 53692 for anthropic"
      pattern: "ensurePortFree\\("
---

<objective>
Extend `src/server/routes/oauth.ts` to dispatch both OAuth providers (Anthropic + OpenAI Codex) from the existing `POST /start` endpoint (D-03), add per-provider port constants (53692 for Anthropic, 1455 for OpenAI Codex — D-04), and add a new `POST /debug/force-expire` endpoint (D-06, D-07) that proves end-to-end OAuth refresh without waiting 6 hours. All existing Phase 6 behavior for Anthropic is preserved.

Purpose: OAUTH-02 requires the user to authenticate via OAuth PKCE with OpenAI Codex using `loginOpenAICodex` from pi-ai. OAUTH-03 requires automatic refresh before expiry. The infrastructure (per-provider `PendingSession` Map, Promise-resolver on `onAuth`, background promise lifecycle, `storeOAuthTokens` persistence, `resolveCredential` with 60s buffer and refresh mutex) already exists from Phase 5 and Phase 6. Plan 02's job is the ~40 lines of dispatch glue: replace the hardcoded `if (provider !== "anthropic")` guard with a provider → login-function lookup, parametrize the port pre-check, and add the force-expire debug endpoint that Plan 03's UAT uses to exercise the refresh path.

Output: `src/server/routes/oauth.ts` modified (NOT rewritten — existing helper functions and patterns are extended in place). No new files. No changes to index.ts (oauthRoutes is already mounted at /api/auth/oauth from Phase 6).
</objective>

<execution_context>
@/Users/henriquelima/Documents/dev/personal/pi-ai-poc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/henriquelima/Documents/dev/personal/pi-ai-poc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/07-openai-oauth-flow/07-CONTEXT.md
@.planning/phases/07-openai-oauth-flow/07-RESEARCH.md
@.planning/phases/07-openai-oauth-flow/07-01-provider-remap-PLAN.md

@src/server/routes/oauth.ts
@src/server/lib/credentials.ts
@.planning/phases/06-anthropic-oauth-flow/06-01-SUMMARY.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From src/server/lib/credentials.ts (Plan 01 added forceExpireOAuth):
```typescript
export type Provider = "anthropic" | "openai"
export function storeOAuthTokens(provider: Provider, tokens: OAuthCredentials): void
export function forceExpireOAuth(provider: Provider): { before: number; after: number } | null  // D-06 helper from Plan 01
```

From node_modules/@mariozechner/pi-ai/dist/utils/oauth/openai-codex.d.ts:
```typescript
export declare function loginOpenAICodex(options: {
  onAuth: (info: { url: string; instructions?: string }) => void
  onPrompt: (prompt: OAuthPrompt) => Promise<string>
  onProgress?: (message: string) => void
  onManualCodeInput?: () => Promise<string>  // DO NOT pass — web UI has no paste path (D-04)
  originator?: string
}): Promise<OAuthCredentials>
```

From node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.d.ts (existing, already imported):
```typescript
export declare function loginAnthropic(options: {
  onAuth: (info: { url: string; instructions?: string }) => void
  onPrompt: (prompt: OAuthPrompt) => Promise<string>
  onProgress?: (message: string) => void
  onManualCodeInput?: () => Promise<string>
}): Promise<OAuthCredentials>
```

Both login functions share the SAME onAuth/onPrompt/onProgress shape, so the Promise-resolver pattern in the existing route works unchanged for either.

From src/server/routes/oauth.ts (EXISTING file — current state after Phase 6):
```typescript
// Current imports:
import { Hono } from "hono"
import { loginAnthropic } from "@mariozechner/pi-ai/oauth"
import { createServer } from "node:http"
import { storeOAuthTokens, type Provider } from "../lib/credentials"

// Current state:
const pendingSessions = new Map<Provider, PendingSession>()
const ANTHROPIC_OAUTH_PORT = 53692

// Current POST /start has this hardcoded guard (line 34-39):
if (provider !== "anthropic") {
  return c.json({ status: "error", message: "Only 'anthropic' is supported in Phase 6" }, 400)
}

// Current POST /start uses ANTHROPIC_OAUTH_PORT and loginAnthropic directly.

// Current GET /status already accepts both providers (line 120-121):
if (!provider || !["anthropic", "openai"].includes(provider)) { ... }
```

Current ensurePortFree helper (keep unchanged — it is already port-agnostic):
```typescript
async function ensurePortFree(port: number, host = "127.0.0.1"): Promise<void> { ... }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extend POST /start to dispatch both providers (Anthropic + OpenAI Codex) with per-provider port pre-check</name>
  <files>src/server/routes/oauth.ts</files>
  <read_first>
    - src/server/routes/oauth.ts (FULL current file — must see existing imports at lines 1-4, PendingSession type at lines 6-13, pendingSessions Map at line 15, ANTHROPIC_OAUTH_PORT at line 16, ensurePortFree helper at lines 18-26, POST /start handler at lines 30-117, GET /status handler at lines 119-144)
    - .planning/phases/07-openai-oauth-flow/07-CONTEXT.md (D-03 dispatch semantics; D-04 port 1455 pre-check with verbatim error message mentioning Codex CLI)
    - .planning/phases/07-openai-oauth-flow/07-RESEARCH.md (Pattern 1 for provider dispatch; Pattern 4 for background promise lifecycle — both unchanged from Phase 6)
    - node_modules/@mariozechner/pi-ai/dist/utils/oauth/openai-codex.d.ts (loginOpenAICodex signature — confirms identical callback shape to loginAnthropic)
    - .planning/phases/06-anthropic-oauth-flow/06-01-SUMMARY.md (Phase 6 implementation choices — Promise-resolver with rejectAuthUrl safety, auto-clear on done/error)
  </read_first>
  <action>
    Modify `src/server/routes/oauth.ts` to support both providers. Do NOT rewrite the file. Do NOT remove `ensurePortFree`, the Promise-resolver pattern, the `rejectAuthUrl` safety, or the background promise error handling. Do NOT touch GET /status (it already accepts both providers).

    **Change 1 — Extend the pi-ai OAuth import (line 2).** Current:

    ```typescript
    import { loginAnthropic } from "@mariozechner/pi-ai/oauth"
    ```

    Replace verbatim with:

    ```typescript
    import { loginAnthropic, loginOpenAICodex } from "@mariozechner/pi-ai/oauth"
    ```

    **Change 2 — Extend the credentials import (line 4) to include forceExpireOAuth.** Current:

    ```typescript
    import { storeOAuthTokens, type Provider } from "../lib/credentials"
    ```

    Replace verbatim with:

    ```typescript
    import { forceExpireOAuth, storeOAuthTokens, type Provider } from "../lib/credentials"
    ```

    **Change 3 — Add OPENAI_OAUTH_PORT constant (after existing ANTHROPIC_OAUTH_PORT at line 16).** Current:

    ```typescript
    const ANTHROPIC_OAUTH_PORT = 53692
    ```

    Insert AFTER that line, verbatim:

    ```typescript
    const OPENAI_OAUTH_PORT = 1455
    ```

    **Change 4 — Add two provider-dispatch helper functions BEFORE `const oauthRoutes = new Hono()`.** Insert verbatim (after the `ensurePortFree` function, before `const oauthRoutes = new Hono()`):

    ```typescript
    function portForProvider(provider: Provider): number {
      return provider === "anthropic" ? ANTHROPIC_OAUTH_PORT : OPENAI_OAUTH_PORT
    }

    function loginFnForProvider(provider: Provider) {
      return provider === "anthropic" ? loginAnthropic : loginOpenAICodex
    }

    function portConflictMessage(provider: Provider): string {
      if (provider === "anthropic") {
        return "Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again."
      }
      return "Port 1455 is already in use by another process. This port is required by the OpenAI Codex OAuth callback. If you have Codex CLI running, please stop it and try again."
    }
    ```

    **Change 5 — Replace the hardcoded `provider !== "anthropic"` guard in POST /start (currently lines 34-39) with a generic provider validation.** Current:

    ```typescript
      if (provider !== "anthropic") {
        return c.json(
          { status: "error", message: "Only 'anthropic' is supported in Phase 6" },
          400
        )
      }
    ```

    Replace verbatim with:

    ```typescript
      if (provider !== "anthropic" && provider !== "openai") {
        return c.json(
          { status: "error", message: "Invalid provider. Use 'anthropic' or 'openai'." },
          400
        )
      }
    ```

    **Change 6 — Update the port pre-check to use portForProvider (currently line 46).** Current:

    ```typescript
        await ensurePortFree(ANTHROPIC_OAUTH_PORT)
    ```

    Replace verbatim with:

    ```typescript
        await ensurePortFree(portForProvider(provider))
    ```

    **Change 7 — Update the EADDRINUSE message to use portConflictMessage (currently lines 49-58, the inner 409 return).** Current:

    ```typescript
        if (code === "EADDRINUSE") {
          return c.json(
            {
              status: "error",
              message:
                "Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again.",
            },
            409
          )
        }
    ```

    Replace verbatim with:

    ```typescript
        if (code === "EADDRINUSE") {
          return c.json(
            { status: "error", message: portConflictMessage(provider) },
            409
          )
        }
    ```

    **Change 8 — Update the generic probe-failure 500 message to mention the right port (currently line 60).** Current:

    ```typescript
        return c.json(
          { status: "error", message: `Could not probe port 53692: ${code ?? "unknown error"}` },
          500
        )
    ```

    Replace verbatim with:

    ```typescript
        return c.json(
          { status: "error", message: `Could not probe port ${portForProvider(provider)}: ${code ?? "unknown error"}` },
          500
        )
    ```

    **Change 9 — Swap the direct loginAnthropic call for loginFnForProvider(provider) (currently line 81).** Current:

    ```typescript
      loginAnthropic({
        onAuth: (info) => resolveAuthUrl(info.url),
        onPrompt: async () => "",
        onProgress: (msg) => console.log(`[oauth:${provider}] ${msg}`),
      })
    ```

    Replace verbatim with:

    ```typescript
      const loginFn = loginFnForProvider(provider)
      loginFn({
        onAuth: (info) => resolveAuthUrl(info.url),
        onPrompt: async () => "",
        onProgress: (msg) => console.log(`[oauth:${provider}] ${msg}`),
      })
    ```

    Do NOT pass `onManualCodeInput` — per D-04, the web UI has no CLI paste path. The callback server is the only acquisition path; EADDRINUSE on 1455 is caught by the pre-check, so loginOpenAICodex never needs to fall back.

    Do NOT modify the `.then(...)` that calls `storeOAuthTokens(provider, creds)`, the session guard, or the `.catch(...)` with `rejectAuthUrl`. These work identically for both providers.

    Do NOT modify the `authUrlPromise` await block or the final `c.json({ status: "started", provider, authUrl })` response.

    After all changes, the POST /start handler body should read (for orientation — do not copy as a single replacement):

    ```typescript
    oauthRoutes.post("/start", async (c) => {
      const body = await c.req.json<{ provider?: Provider }>().catch(() => ({ provider: undefined }))
      const provider = body.provider

      if (provider !== "anthropic" && provider !== "openai") {
        return c.json({ status: "error", message: "Invalid provider. Use 'anthropic' or 'openai'." }, 400)
      }

      pendingSessions.delete(provider)

      try {
        await ensurePortFree(portForProvider(provider))
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code
        if (code === "EADDRINUSE") {
          return c.json({ status: "error", message: portConflictMessage(provider) }, 409)
        }
        return c.json({ status: "error", message: `Could not probe port ${portForProvider(provider)}: ${code ?? "unknown error"}` }, 500)
      }

      let resolveAuthUrl!: (url: string) => void
      let rejectAuthUrl!: (err: unknown) => void
      const authUrlPromise = new Promise<string>((resolve, reject) => { resolveAuthUrl = resolve; rejectAuthUrl = reject })

      const session: PendingSession = { authUrl: "", status: "pending", startedAt: Date.now() }
      pendingSessions.set(provider, session)

      const loginFn = loginFnForProvider(provider)
      loginFn({
        onAuth: (info) => resolveAuthUrl(info.url),
        onPrompt: async () => "",
        onProgress: (msg) => console.log(`[oauth:${provider}] ${msg}`),
      })
        .then((creds) => {
          storeOAuthTokens(provider, creds)
          if (pendingSessions.get(provider) === session) session.status = "done"
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          if (pendingSessions.get(provider) === session) {
            session.status = "error"
            session.error = message
          }
          rejectAuthUrl(err)
        })

      let authUrl: string
      try { authUrl = await authUrlPromise }
      catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return c.json({ status: "error", message: `OAuth flow failed to start: ${message}` }, 500)
      }

      session.authUrl = authUrl
      return c.json({ status: "started", provider, authUrl })
    })
    ```
  </action>
  <verify>
    <automated>grep -q 'import { loginAnthropic, loginOpenAICodex } from "@mariozechner/pi-ai/oauth"' src/server/routes/oauth.ts && grep -q 'forceExpireOAuth, storeOAuthTokens' src/server/routes/oauth.ts && grep -q 'const OPENAI_OAUTH_PORT = 1455' src/server/routes/oauth.ts && grep -q 'function portForProvider(provider: Provider)' src/server/routes/oauth.ts && grep -q 'function loginFnForProvider(provider: Provider)' src/server/routes/oauth.ts && grep -q 'function portConflictMessage(provider: Provider)' src/server/routes/oauth.ts && grep -q 'Port 1455 is already in use by another process' src/server/routes/oauth.ts && grep -q 'Codex CLI' src/server/routes/oauth.ts && grep -q 'ensurePortFree(portForProvider(provider))' src/server/routes/oauth.ts && grep -q 'const loginFn = loginFnForProvider(provider)' src/server/routes/oauth.ts && ! grep -q 'Only .anthropic. is supported' src/server/routes/oauth.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | (! grep -E "src/server/routes/oauth\.ts")</automated>
  </verify>
  <acceptance_criteria>
    - loginOpenAICodex imported: `grep -c 'loginOpenAICodex' src/server/routes/oauth.ts` returns at least 2 (import + call via loginFnForProvider)
    - Combined pi-ai import line: `grep -q 'import { loginAnthropic, loginOpenAICodex } from "@mariozechner/pi-ai/oauth"' src/server/routes/oauth.ts`
    - forceExpireOAuth imported: `grep -q 'forceExpireOAuth, storeOAuthTokens' src/server/routes/oauth.ts`
    - OPENAI_OAUTH_PORT constant present: `grep -c 'const OPENAI_OAUTH_PORT = 1455' src/server/routes/oauth.ts` returns 1
    - ANTHROPIC_OAUTH_PORT still present (preserved): `grep -c 'const ANTHROPIC_OAUTH_PORT = 53692' src/server/routes/oauth.ts` returns 1
    - portForProvider helper defined: `grep -c 'function portForProvider(provider: Provider): number' src/server/routes/oauth.ts` returns 1
    - loginFnForProvider helper defined: `grep -c 'function loginFnForProvider(provider: Provider)' src/server/routes/oauth.ts` returns 1
    - portConflictMessage helper defined: `grep -c 'function portConflictMessage(provider: Provider): string' src/server/routes/oauth.ts` returns 1
    - D-04 message verbatim (port 1455): `grep -q 'Port 1455 is already in use by another process. This port is required by the OpenAI Codex OAuth callback. If you have Codex CLI running, please stop it and try again.' src/server/routes/oauth.ts`
    - Phase 6 D-02 message verbatim (port 53692) preserved: `grep -q 'Port 53692 is already in use by another process. This port is required by the Anthropic OAuth callback. If you have Claude Code CLI running, please stop it and try again.' src/server/routes/oauth.ts`
    - Generic guard replaces hardcoded anthropic-only guard: `grep -q 'provider !== "anthropic" && provider !== "openai"' src/server/routes/oauth.ts`
    - Old Phase 6 guard removed: `grep -c 'Only .anthropic. is supported' src/server/routes/oauth.ts` returns 0
    - Generic invalid-provider message: `grep -q "Invalid provider. Use 'anthropic' or 'openai'." src/server/routes/oauth.ts`
    - Port pre-check parametrized: `grep -q 'ensurePortFree(portForProvider(provider))' src/server/routes/oauth.ts`
    - Login dispatch: `grep -q 'const loginFn = loginFnForProvider(provider)' src/server/routes/oauth.ts`
    - loginFn call uses onAuth resolver pattern: `grep -q 'onAuth: (info) => resolveAuthUrl(info.url)' src/server/routes/oauth.ts`
    - onPrompt returns empty string: `grep -q 'onPrompt: async () => ""' src/server/routes/oauth.ts`
    - onManualCodeInput NOT passed: `grep -c 'onManualCodeInput' src/server/routes/oauth.ts` returns 0
    - storeOAuthTokens call preserved: `grep -q 'storeOAuthTokens(provider, creds)' src/server/routes/oauth.ts`
    - Session guard preserved: `grep -q 'pendingSessions.get(provider) === session' src/server/routes/oauth.ts`
    - Pattern 4 background promise preserved: `grep -q '.then((creds)' src/server/routes/oauth.ts` (or similar — the .then/.catch chain is intact)
    - rejectAuthUrl safety preserved: `grep -q 'rejectAuthUrl' src/server/routes/oauth.ts`
    - TypeScript compiles clean: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/server/routes/oauth\.ts"` returns nothing (exit 1)
  </acceptance_criteria>
  <done>
    Per OAUTH-02, D-03, D-04: POST /api/auth/oauth/start dispatches to loginOpenAICodex when provider is "openai" and loginAnthropic when provider is "anthropic"; port 1455 pre-check returns 409 with Codex CLI conflict message on EADDRINUSE; port 53692 pre-check for anthropic preserved byte-for-byte. onManualCodeInput is NOT wired (web UI has no paste path). Promise-resolver, session guard, background promise lifecycle all preserved from Phase 6. File compiles clean.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Add POST /debug/force-expire handler to oauthRoutes for UAT refresh verification</name>
  <files>src/server/routes/oauth.ts</files>
  <read_first>
    - src/server/routes/oauth.ts (post-Task-1 version — must see oauthRoutes router to know where to add the new handler; must see existing GET /status handler for JSON envelope style)
    - src/server/lib/credentials.ts (post-Plan-01 — confirms forceExpireOAuth signature: returns { before: number; after: number } | null)
    - .planning/phases/07-openai-oauth-flow/07-CONTEXT.md (D-06 semantics: force expire triggers refresh on next chat request; D-07: always enabled, no NODE_ENV gate)
    - .planning/phases/07-openai-oauth-flow/07-UI-SPEC.md (Backend Error Messages table — verbatim message for force-expire success, verbatim 404 message when no credential stored)
  </read_first>
  <action>
    Add a new route handler to `src/server/routes/oauth.ts`. Insert it AFTER the existing GET /status handler (currently lines 119-144) and BEFORE the `export { oauthRoutes }` statement.

    Insert verbatim:

    ```typescript
    // D-06: Dev/UAT helper — force-expire the stored OAuth credential for a provider so the next
    // chat request triggers resolveCredential's refresh path (60s buffer). Exercises the end-to-end
    // refresh cycle (mutex, refresh{Anthropic,OpenAICodex}Token, storeOAuthTokens, new access token
    // into pi-agent-core mid-stream) without waiting for the natural ~6h token lifetime.
    // D-07: Always enabled (no NODE_ENV gate) — POC is local-only, single-user, in-memory, no deploy.
    oauthRoutes.post("/debug/force-expire", (c) => {
      const provider = c.req.query("provider") as Provider | undefined
      if (!provider || !["anthropic", "openai"].includes(provider)) {
        return c.json(
          { status: "error", message: "Invalid provider. Use 'anthropic' or 'openai'." },
          400
        )
      }

      const result = forceExpireOAuth(provider)
      if (!result) {
        return c.json(
          {
            status: "error",
            provider,
            message: `No OAuth credential stored for ${provider}. Complete OAuth login first.`,
          },
          404
        )
      }

      return c.json({
        status: "ok",
        provider,
        before: result.before,
        after: result.after,
        message: `Forced expiry on ${provider} OAuth credential. Next chat request will trigger refresh.`,
      })
    })
    ```

    Do NOT add any NODE_ENV check, guard, or environment flag. Do NOT restrict the endpoint to openai — per D-06 it works for both providers (even though the Phase 7 UAT only needs openai, the Anthropic branch is free from the same helper). Do NOT echo the access/refresh token strings in the response body (CLAUDE.md security constraint — exposing the tokens is forbidden). The `before`/`after` expires epoch-ms values ARE safe to return (per D-06 and UI-SPEC "Debug force-expire response MAY include before/after expiry epoch numbers, but NEVER the token strings").

    After this insertion, the file's structure should be: imports → type/const declarations → helper functions → oauthRoutes = new Hono() → POST /start → GET /status → POST /debug/force-expire → export.
  </action>
  <verify>
    <automated>grep -q 'oauthRoutes.post("/debug/force-expire"' src/server/routes/oauth.ts && grep -q 'forceExpireOAuth(provider)' src/server/routes/oauth.ts && grep -q 'Forced expiry on' src/server/routes/oauth.ts && grep -q 'No OAuth credential stored for' src/server/routes/oauth.ts && grep -q 'Next chat request will trigger refresh' src/server/routes/oauth.ts && ! grep -q 'NODE_ENV' src/server/routes/oauth.ts && ! grep -q 'result.access' src/server/routes/oauth.ts && ! grep -q 'result.refresh' src/server/routes/oauth.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | (! grep -E "src/server/routes/oauth\.ts")</automated>
  </verify>
  <acceptance_criteria>
    - Route handler registered: `grep -c 'oauthRoutes.post("/debug/force-expire"' src/server/routes/oauth.ts` returns 1
    - forceExpireOAuth called: `grep -q 'forceExpireOAuth(provider)' src/server/routes/oauth.ts`
    - Invalid provider → 400: `grep -q "Invalid provider. Use 'anthropic' or 'openai'." src/server/routes/oauth.ts` (this line appears twice — in /start and /debug/force-expire)
    - Success message verbatim: `grep -q 'Forced expiry on ${provider} OAuth credential. Next chat request will trigger refresh.' src/server/routes/oauth.ts`
    - 404 message verbatim: `grep -q 'No OAuth credential stored for ${provider}. Complete OAuth login first.' src/server/routes/oauth.ts`
    - 404 status code used: `grep -q '404' src/server/routes/oauth.ts`
    - Response includes before/after: `grep -q 'before: result.before' src/server/routes/oauth.ts && grep -q 'after: result.after' src/server/routes/oauth.ts`
    - NO NODE_ENV gate (D-07): `grep -c 'NODE_ENV' src/server/routes/oauth.ts` returns 0
    - NO token echoes (security): `grep -c 'result.access\|result.refresh\|creds.access\|creds.refresh' src/server/routes/oauth.ts` returns 0
    - Export still present: `grep -c 'export { oauthRoutes }' src/server/routes/oauth.ts` returns 1
    - TypeScript compiles clean: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/server/routes/oauth\.ts"` returns nothing (exit 1)
    - Project-wide TypeScript compiles clean: `npx tsc --noEmit -p tsconfig.json` exits 0
    - Dev server starts clean and route is reachable: `curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3001/api/auth/oauth/debug/force-expire?provider=openai"` returns `404` (no credential stored yet), NOT `404 Not Found` route-level (which would be Hono's default). Practically: the response body must contain `"No OAuth credential stored for openai. Complete OAuth login first."` when the store is empty.
  </acceptance_criteria>
  <done>
    Per OAUTH-03, D-06, D-07: POST /api/auth/oauth/debug/force-expire?provider=openai mutates stored OAuth expires to Date.now()-1000 and returns { status: "ok", provider, before, after, message }. Returns 404 with clean message when no credential is stored. Always enabled (no NODE_ENV gate). Token strings NEVER echoed in response. File compiles clean; dev server boots clean; endpoint reachable at /api/auth/oauth/debug/force-expire.
  </done>
</task>

</tasks>

<verification>
**Structural verification (automated):**
- `grep -q 'loginOpenAICodex' src/server/routes/oauth.ts` — OpenAI OAuth dispatch wired
- `grep -q 'Port 1455 is already in use' src/server/routes/oauth.ts` — D-04 message present
- `grep -q '/debug/force-expire' src/server/routes/oauth.ts` — debug endpoint registered
- `grep -q 'Port 53692 is already in use' src/server/routes/oauth.ts` — Phase 6 message preserved (no regression)
- `npx tsc --noEmit -p tsconfig.json` exits 0

**Functional verification (manual smoke test):**
1. Start backend: `npm run dev:server`
2. Test OpenAI /start with port 1455 free:
   ```bash
   curl -sS -X POST http://localhost:3001/api/auth/oauth/start \
     -H "Content-Type: application/json" \
     -d '{"provider":"openai"}' | jq .
   ```
   Expected: `{"status":"started","provider":"openai","authUrl":"https://auth.openai.com/..."}` (HTTP 200)
3. Test port 1455 conflict:
   ```bash
   nc -l 1455 &
   sleep 1
   curl -sS -w "\nHTTP %{http_code}\n" -X POST http://localhost:3001/api/auth/oauth/start -H "Content-Type: application/json" -d '{"provider":"openai"}'
   pkill -f "nc -l 1455"
   ```
   Expected: HTTP 409, message contains "Port 1455" and "Codex CLI"
4. Test force-expire on empty store:
   ```bash
   curl -sS -w "\nHTTP %{http_code}\n" -X POST "http://localhost:3001/api/auth/oauth/debug/force-expire?provider=openai"
   ```
   Expected: HTTP 404, message: "No OAuth credential stored for openai. Complete OAuth login first."

**No regressions:**
- Anthropic /start still works (provider: "anthropic" → loginAnthropic → port 53692 pre-check)
- Anthropic port conflict still returns 409 with "Claude Code CLI" message
- GET /status?provider=anthropic and /status?provider=openai both work
- Phase 5 /api/auth/status and /api/auth/apikey unchanged
</verification>

<success_criteria>
- src/server/routes/oauth.ts compiles clean
- POST /api/auth/oauth/start accepts provider="openai" and returns { status: "started", authUrl } with non-empty URL
- Port 1455 EADDRINUSE returns HTTP 409 with verbatim D-04 message mentioning Codex CLI
- POST /api/auth/oauth/debug/force-expire?provider=openai returns 404 on empty store, 200 with { before, after, message } when OAuth credential is stored
- Anthropic flow (provider="anthropic") unchanged — no regression
- Project-wide TypeScript compiles clean
- Dev server boots without errors
</success_criteria>

<output>
After completion, create `.planning/phases/07-openai-oauth-flow/07-02-SUMMARY.md` documenting:
- Files modified: src/server/routes/oauth.ts
- New endpoints: POST /api/auth/oauth/start accepts provider="openai"; POST /api/auth/oauth/debug/force-expire
- Key implementation choices: provider-dispatch via loginFnForProvider + portForProvider + portConflictMessage helpers; no onManualCodeInput per D-04; debug endpoint always-on per D-07; no token strings in response bodies
- Known limitations: OpenAI OAuth scope empirical validation still pending (documented in STATE.md); next chat request must succeed to prove SC#3 (done in Plan 03 UAT)
- Follow-up for Plan 03: UAT runs end-to-end curl tests including force-expire + subsequent /api/chat to prove SC#3 + SC#4
</output>
</content>
</invoke>