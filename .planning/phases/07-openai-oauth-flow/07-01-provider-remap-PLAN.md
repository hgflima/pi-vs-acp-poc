---
phase: 07-openai-oauth-flow
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/lib/credentials.ts
  - src/server/agent/setup.ts
  - src/server/routes/models.ts
autonomous: true
requirements: [OAUTH-02, OAUTH-03]
must_haves:
  truths:
    - "credentials.ts exports resolvePiProvider(provider: Provider): PiProvider that returns 'openai-codex' when provider==='openai' AND getAuthStatus('openai').activeMethod==='oauth', otherwise returns the provider unchanged (D-01)"
    - "credentials.ts exports forceExpireOAuth(provider: Provider): { before: number, after: number } | null that mutates the stored OAuth credential's expires to Date.now() - 1000, returns null if no OAuth credential stored (D-06)"
    - "credentials.ts exports type PiProvider = 'anthropic' | 'openai' | 'openai-codex'"
    - "setup.ts calls getModel(resolvePiProvider(provider), modelId) — the 'as any' cast on modelId is removed once types align"
    - "models.ts calls getModels(resolvePiProvider(typedProvider)) before returning the list so /api/models?provider=openai returns openai-codex models when OAuth is the active method and standard openai models when API Key is active (D-02)"
    - "Project-wide TypeScript compiles clean after all three files are edited (npx tsc --noEmit -p tsconfig.json exits 0)"
  artifacts:
    - path: "src/server/lib/credentials.ts"
      provides: "resolvePiProvider helper, forceExpireOAuth helper, PiProvider type export — coexisting with existing Phase 5 exports (storeApiKey, storeOAuthTokens, getActiveCredential, getAuthStatus, clearByType, hasAnyCredential, Provider, AuthMethod, Credential, OAuthCredential, ApiKeyCredential, AuthStatus)"
      exports: ["resolvePiProvider", "forceExpireOAuth", "PiProvider"]
    - path: "src/server/agent/setup.ts"
      provides: "createAgent that routes pi-ai getModel through resolvePiProvider so OAuth credentials hit the openai-codex model registry (gpt-5.1, gpt-5.1-codex, gpt-5.2) instead of the standard openai registry (gpt-4o)"
      contains: "getModel(resolvePiProvider(provider)"
    - path: "src/server/routes/models.ts"
      provides: "GET /api/models?provider=<p> handler that returns the model list compatible with the active credential (openai-codex models when OAuth, standard openai models when API Key)"
      contains: "getModels(resolvePiProvider("
  key_links:
    - from: "src/server/lib/credentials.ts"
      to: "getAuthStatus (same file)"
      via: "resolvePiProvider reads getAuthStatus(provider).activeMethod to decide the remap"
      pattern: "getAuthStatus\\(.*activeMethod"
    - from: "src/server/agent/setup.ts"
      to: "resolvePiProvider from ../lib/credentials"
      via: "import + call inside createAgent before getModel"
      pattern: "resolvePiProvider"
    - from: "src/server/routes/models.ts"
      to: "resolvePiProvider from ../lib/credentials"
      via: "import + call before getModels"
      pattern: "resolvePiProvider"
---

<objective>
Add the `resolvePiProvider` helper and `forceExpireOAuth` helper to `src/server/lib/credentials.ts`, then wire `resolvePiProvider` into the two pi-ai call sites (`getModel` in `setup.ts`, `getModels` in `models.ts`) so OAuth credentials for OpenAI automatically route through pi-ai's `"openai-codex"` provider slug (which targets `chatgpt.com/backend-api` with Codex models) while API Key credentials continue to route through the standard `"openai"` slug (`api.openai.com/chat/completions` with GPT-4o and friends).

Purpose: Per D-01 and D-02, the frontend-facing `Provider` type stays `"anthropic" | "openai"` — the Codex remap is a backend-internal routing concern. pi-ai v0.64.0 ships two distinct provider slugs for OpenAI (`"openai"` and `"openai-codex"`) that are NOT interchangeable: passing an OAuth token to a standard `"openai"` model returns a scope error, and passing an API Key to an `"openai-codex"` model fails provider auth. Centralizing the remap in `resolvePiProvider` keeps the rule in one place for both current call sites and any future pi-ai call sites. The `forceExpireOAuth` helper is added here (not in the oauth.ts route file) because it touches the credentials store's internal state — Plan 02's debug endpoint route imports and calls it.

Output: Three files modified. No new files. Exports: `resolvePiProvider`, `forceExpireOAuth`, type `PiProvider` added to credentials.ts; `setup.ts` and `models.ts` updated to call `resolvePiProvider` before handing off to pi-ai.
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

@src/server/lib/credentials.ts
@src/server/agent/setup.ts
@src/server/routes/models.ts

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->
<!-- Executor should use these directly — no codebase exploration needed. -->

From src/server/lib/credentials.ts (existing exports to keep):
```typescript
export type Provider = "anthropic" | "openai"
export type AuthMethod = "apiKey" | "oauth"

export interface ApiKeyCredential { type: "apiKey"; key: string }
export interface OAuthCredential { type: "oauth"; access: string; refresh: string; expires: number }
export type Credential = ApiKeyCredential | OAuthCredential

export interface AuthStatus {
  hasApiKey: boolean
  hasOAuth: boolean
  activeMethod: AuthMethod | null
  oauthExpiry?: number
}

export function storeApiKey(provider: Provider, key: string): void
export function storeOAuthTokens(provider: Provider, tokens: OAuthCredentials): void
export function getActiveCredential(provider: Provider): Credential | null
export function clearByType(provider: Provider, type: AuthMethod): void
export function getAuthStatus(provider: Provider): AuthStatus
export function hasAnyCredential(provider: Provider): boolean
```

Internal store shape (do NOT change):
```typescript
interface ProviderCredentials {
  apiKey: ApiKeyCredential | null
  oauth: OAuthCredential | null
}
const store = new Map<Provider, ProviderCredentials>()
```

From node_modules/@mariozechner/pi-ai/dist/types.d.ts (KnownProvider — pi-ai's provider slug type):
```typescript
// pi-ai's KnownProvider includes: "anthropic" | "openai" | "openai-codex" | ...other providers
// We only use three of these slugs in this POC.
```

From src/server/agent/setup.ts (line 62 — the existing call site to update):
```typescript
export function createAgent({ provider, modelId, systemPrompt }: CreateAgentOptions): Agent {
  const model = getModel(provider, modelId as any)   // ← LINE 62: must become getModel(resolvePiProvider(provider), modelId)
  // ... rest unchanged
}
```

From src/server/routes/models.ts (line 20 — the existing call site to update):
```typescript
const typedProvider = provider as "anthropic" | "openai"
if (!hasAnyCredential(typedProvider)) { /* 401 */ }
const models = getModels(provider)   // ← LINE 20: must become getModels(resolvePiProvider(typedProvider))
```

Note: In models.ts the current `getModels(provider)` uses the raw string from the query param, NOT typedProvider. After the edit it MUST use typedProvider (which is narrowed to Provider) so resolvePiProvider can accept it.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add resolvePiProvider, forceExpireOAuth, and PiProvider type to src/server/lib/credentials.ts</name>
  <files>src/server/lib/credentials.ts</files>
  <read_first>
    - src/server/lib/credentials.ts (full current file — must see existing store, ProviderCredentials interface, OAuthCredential interface, getAuthStatus implementation so new helpers slot in without breaking other exports)
    - .planning/phases/07-openai-oauth-flow/07-CONTEXT.md (D-01 exact semantics of resolvePiProvider; D-06 force-expire semantics; D-07 always-on debug philosophy)
  </read_first>
  <action>
    Modify `src/server/lib/credentials.ts`. Do NOT touch any existing export (the file is consumed by auth.ts, oauth.ts, chat.ts, models.ts, setup.ts — all other behavior must remain identical).

    **Change 1 — Add `PiProvider` type export.** Insert AFTER the existing line `export type Provider = "anthropic" | "openai"` (line 3). Insert verbatim (one blank line before, one blank line after):

    ```typescript
    export type PiProvider = "anthropic" | "openai" | "openai-codex"
    ```

    **Change 2 — Add `resolvePiProvider` function export.** Append to the END of the file (after `hasAnyCredential`, last export in the current file). Insert verbatim:

    ```typescript
    // D-01: Remap "openai" → "openai-codex" when OAuth is the active credential for OpenAI.
    // API Key path uses the standard "openai" slug; OAuth path uses the Codex slug so pi-ai
    // routes the request to chatgpt.com/backend-api with Codex models (gpt-5.1, gpt-5.1-codex, etc.)
    // instead of api.openai.com/chat/completions with standard OpenAI models (gpt-4o, etc.).
    // Anthropic is never remapped.
    export function resolvePiProvider(provider: Provider): PiProvider {
      if (provider === "openai" && getAuthStatus("openai").activeMethod === "oauth") {
        return "openai-codex"
      }
      return provider
    }
    ```

    **Change 3 — Add `forceExpireOAuth` function export.** Append AFTER `resolvePiProvider` at the end of the file. Insert verbatim:

    ```typescript
    // D-06: Dev/UAT helper — mutate stored OAuth credential's `expires` to Date.now() - 1000
    // so the next resolveCredential() call in setup.ts (60s buffer) detects expiry and triggers
    // refreshOpenAICodexToken/refreshAnthropicToken. Returns { before, after } epoch-ms pair on
    // success, or null if no OAuth credential is stored for this provider. Consumed by Plan 02's
    // POST /api/auth/oauth/debug/force-expire endpoint (D-07: always enabled, no NODE_ENV gate).
    export function forceExpireOAuth(provider: Provider): { before: number; after: number } | null {
      const entry = store.get(provider)
      if (!entry || !entry.oauth) return null
      const before = entry.oauth.expires
      const after = Date.now() - 1000
      entry.oauth.expires = after
      return { before, after }
    }
    ```

    Do NOT remove or rename any existing export. Do NOT reorder the existing interfaces or functions. Do NOT expose `store` or `ProviderCredentials` — those stay module-private. The new helpers must be pure additions.

    After the edit, the file MUST continue to export ALL of these names (sanity check — the list is unchanged + 3 new):
    - Existing (unchanged): `Provider`, `AuthMethod`, `ApiKeyCredential`, `OAuthCredential`, `Credential`, `AuthStatus`, `storeApiKey`, `storeOAuthTokens`, `getActiveCredential`, `clearByType`, `getAuthStatus`, `hasAnyCredential`
    - New: `PiProvider`, `resolvePiProvider`, `forceExpireOAuth`
  </action>
  <verify>
    <automated>grep -q 'export type PiProvider = "anthropic" | "openai" | "openai-codex"' src/server/lib/credentials.ts && grep -q 'export function resolvePiProvider(provider: Provider): PiProvider' src/server/lib/credentials.ts && grep -q 'export function forceExpireOAuth(provider: Provider)' src/server/lib/credentials.ts && grep -q 'return "openai-codex"' src/server/lib/credentials.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | (! grep -E "credentials\.ts")</automated>
  </verify>
  <acceptance_criteria>
    - PiProvider type exported: `grep -c 'export type PiProvider = "anthropic" | "openai" | "openai-codex"' src/server/lib/credentials.ts` returns 1
    - resolvePiProvider function exported: `grep -c 'export function resolvePiProvider(provider: Provider): PiProvider' src/server/lib/credentials.ts` returns 1
    - resolvePiProvider returns "openai-codex" branch: `grep -q 'return "openai-codex"' src/server/lib/credentials.ts`
    - resolvePiProvider checks activeMethod: `grep -q 'getAuthStatus("openai").activeMethod === "oauth"' src/server/lib/credentials.ts`
    - forceExpireOAuth function exported: `grep -c 'export function forceExpireOAuth(provider: Provider)' src/server/lib/credentials.ts` returns 1
    - forceExpireOAuth returns { before, after } or null: `grep -q '{ before: number; after: number } | null' src/server/lib/credentials.ts`
    - forceExpireOAuth sets expires to Date.now() - 1000: `grep -q 'Date.now() - 1000' src/server/lib/credentials.ts`
    - Existing exports preserved (spot-check): `grep -c 'export function storeOAuthTokens' src/server/lib/credentials.ts` returns 1
    - Existing exports preserved: `grep -c 'export function getActiveCredential' src/server/lib/credentials.ts` returns 1
    - Existing exports preserved: `grep -c 'export function getAuthStatus' src/server/lib/credentials.ts` returns 1
    - Existing exports preserved: `grep -c 'export type Provider = "anthropic" | "openai"' src/server/lib/credentials.ts` returns 1
    - TypeScript compiles clean (credentials.ts has no errors): `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/server/lib/credentials\.ts"` returns nothing (exit 1)
  </acceptance_criteria>
  <done>
    Per D-01 and D-06: credentials.ts exposes resolvePiProvider (returns "openai-codex" iff provider is "openai" AND activeMethod is "oauth", else returns provider unchanged) and forceExpireOAuth (mutates stored OAuth expires to Date.now() - 1000, returns before/after epoch-ms pair, null if no OAuth stored). PiProvider type exported. All existing Phase 5 exports unchanged. File compiles clean.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Wire resolvePiProvider into getModel call in src/server/agent/setup.ts</name>
  <files>src/server/agent/setup.ts</files>
  <read_first>
    - src/server/agent/setup.ts (full current file — must see the createAgent function at line 61 and the import block at line 8 to add resolvePiProvider to the existing import from ../lib/credentials)
    - src/server/lib/credentials.ts (post-Task-1 version — confirm resolvePiProvider is exported)
    - .planning/phases/07-openai-oauth-flow/07-CONTEXT.md (D-01 semantics — remap happens at pi-ai call sites; the "as any" cast on modelId can be removed since the widened PiProvider type covers all slugs)
  </read_first>
  <action>
    Modify `src/server/agent/setup.ts` in exactly two places. Do NOT touch `resolveCredential`, the refresh mutex, the `refreshAnthropicToken`/`refreshOpenAICodexToken` imports, the `CreateAgentOptions` interface, or the `new Agent({...})` construction — only the getModel call and its import.

    **Change 1 — Extend the existing import from ../lib/credentials (line 8).** The current line 8 reads:

    ```typescript
    import { getActiveCredential, storeOAuthTokens, type Provider } from "../lib/credentials"
    ```

    Replace it verbatim with:

    ```typescript
    import { getActiveCredential, resolvePiProvider, storeOAuthTokens, type Provider } from "../lib/credentials"
    ```

    (Alphabetical within the named imports, `type Provider` stays at the end — same style as the existing line.)

    **Change 2 — Update the getModel call inside createAgent (currently line 62).** The current line 62 reads:

    ```typescript
      const model = getModel(provider, modelId as any)
    ```

    Replace it verbatim with:

    ```typescript
      const model = getModel(resolvePiProvider(provider), modelId)
    ```

    The `as any` cast is REMOVED in this change. `resolvePiProvider` returns `PiProvider` ("anthropic" | "openai" | "openai-codex") which satisfies pi-ai's `KnownProvider` parameter. `modelId` stays typed as `string`; pi-ai's `getModel` accepts `string` for the modelId parameter so the cast is no longer needed. If TypeScript still flags modelId, leave the cast in place and note it in acceptance criteria — the import change is the load-bearing edit.

    Do NOT modify any other line. Do NOT change the function signature of `createAgent`. Do NOT change `resolveCredential` (it already correctly uses the raw `Provider` type for refresh token bookkeeping — the remap is only needed at pi-ai call sites).

    After the edit, createAgent should read:

    ```typescript
    export function createAgent({ provider, modelId, systemPrompt }: CreateAgentOptions): Agent {
      const model = getModel(resolvePiProvider(provider), modelId)

      // If no explicit systemPrompt, check for active harness
      const finalPrompt = systemPrompt ?? buildSystemPrompt(getActiveHarness())

      return new Agent({
        initialState: {
          systemPrompt: finalPrompt,
          model,
          tools: pocTools,
        },
        getApiKey: (p) => resolveCredential(p as Provider),
      })
    }
    ```
  </action>
  <verify>
    <automated>grep -q 'resolvePiProvider' src/server/agent/setup.ts && grep -q 'getModel(resolvePiProvider(provider)' src/server/agent/setup.ts && ! grep -q 'getModel(provider, modelId as any)' src/server/agent/setup.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | (! grep -E "src/server/agent/setup\.ts")</automated>
  </verify>
  <acceptance_criteria>
    - Import updated (resolvePiProvider added): `grep -c 'resolvePiProvider' src/server/agent/setup.ts` returns 2 (once in import, once in call)
    - getModel call uses resolvePiProvider: `grep -q 'getModel(resolvePiProvider(provider)' src/server/agent/setup.ts`
    - Old call site removed: `grep -c 'getModel(provider, modelId as any)' src/server/agent/setup.ts` returns 0
    - Old call site removed (no raw `getModel(provider, modelId)` either): `grep -q 'getModel(provider,' src/server/agent/setup.ts` returns non-zero exit (i.e., no match)
    - resolveCredential untouched: `grep -c 'async function resolveCredential(provider: Provider)' src/server/agent/setup.ts` returns 1
    - refreshOpenAICodexToken import untouched: `grep -c 'refreshOpenAICodexToken' src/server/agent/setup.ts` returns 2 (import + call in resolveCredential)
    - refreshAnthropicToken import untouched: `grep -c 'refreshAnthropicToken' src/server/agent/setup.ts` returns 2 (import + call)
    - storeOAuthTokens import still present: `grep -q 'storeOAuthTokens' src/server/agent/setup.ts`
    - getActiveCredential import still present: `grep -q 'getActiveCredential' src/server/agent/setup.ts`
    - TypeScript compiles clean (setup.ts has no errors): `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/server/agent/setup\.ts"` returns nothing (exit 1)
  </acceptance_criteria>
  <done>
    Per D-01: setup.ts createAgent calls getModel with resolvePiProvider(provider) so OAuth-backed OpenAI requests route to pi-ai's "openai-codex" provider (chatgpt.com/backend-api) while API-Key-backed OpenAI requests stay on "openai" (api.openai.com). resolveCredential, refresh mutex, and refresh functions untouched. File compiles clean.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Wire resolvePiProvider into getModels call in src/server/routes/models.ts</name>
  <files>src/server/routes/models.ts</files>
  <read_first>
    - src/server/routes/models.ts (full current file — must see the handler's query parsing, hasAnyCredential guard, and the getModels call that must be updated)
    - src/server/lib/credentials.ts (post-Task-1 version — confirms resolvePiProvider signature)
    - .planning/phases/07-openai-oauth-flow/07-CONTEXT.md (D-02 — /api/models returns models for the ACTIVE credential: OAuth → openai-codex models, API Key → standard openai models)
  </read_first>
  <action>
    Modify `src/server/routes/models.ts` in exactly two places.

    **Change 1 — Extend the existing import from ../lib/credentials.** The current imports read:

    ```typescript
    import { Hono } from "hono"
    import { getModels } from "@mariozechner/pi-ai"
    import { hasAnyCredential } from "../lib/credentials"
    ```

    Replace the third import line verbatim with:

    ```typescript
    import { hasAnyCredential, resolvePiProvider } from "../lib/credentials"
    ```

    **Change 2 — Update the getModels call (currently line 20).** The current line 20 reads:

    ```typescript
      const models = getModels(provider)
    ```

    Replace it verbatim with:

    ```typescript
      const models = getModels(resolvePiProvider(typedProvider))
    ```

    Note two things:
    1. The argument changes from `provider` (raw query string) to `typedProvider` (narrowed to `Provider`), which is already declared on the existing line `const typedProvider = provider as "anthropic" | "openai"` (currently around line 14). resolvePiProvider requires the narrowed `Provider` type, not the raw string.
    2. The return type chain becomes: resolvePiProvider(typedProvider) → PiProvider → getModels(PiProvider). pi-ai's getModels accepts `KnownProvider` which includes all three slugs.

    Do NOT modify any other line. Do NOT change the 400 error for invalid provider. Do NOT change the 401 for `hasAnyCredential` false. Do NOT change the response shape `{ models: [{id, name, reasoning}] }`.

    After the edit, the handler body should read:

    ```typescript
    modelRoutes.get("/", (c) => {
      const provider = c.req.query("provider")

      if (!provider || !["anthropic", "openai"].includes(provider)) {
        return c.json({ error: "Invalid provider. Use 'anthropic' or 'openai'." }, 400)
      }

      const typedProvider = provider as "anthropic" | "openai"

      if (!hasAnyCredential(typedProvider)) {
        return c.json({ error: "Not authenticated", needsAuth: true }, 401)
      }

      const models = getModels(resolvePiProvider(typedProvider))
      return c.json({
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          reasoning: m.reasoning,
        })),
      })
    })
    ```
  </action>
  <verify>
    <automated>grep -q 'resolvePiProvider' src/server/routes/models.ts && grep -q 'getModels(resolvePiProvider(typedProvider))' src/server/routes/models.ts && ! grep -q 'getModels(provider)' src/server/routes/models.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | (! grep -E "src/server/routes/models\.ts")</automated>
  </verify>
  <acceptance_criteria>
    - Import updated (resolvePiProvider added): `grep -c 'resolvePiProvider' src/server/routes/models.ts` returns 2 (import + call)
    - getModels call uses resolvePiProvider: `grep -q 'getModels(resolvePiProvider(typedProvider))' src/server/routes/models.ts`
    - Old call site removed: `grep -c 'getModels(provider)' src/server/routes/models.ts` returns 0
    - hasAnyCredential import still present: `grep -q 'hasAnyCredential' src/server/routes/models.ts`
    - Existing 400 guard preserved: `grep -q "Invalid provider. Use 'anthropic' or 'openai'." src/server/routes/models.ts`
    - Existing 401 guard preserved: `grep -q '"Not authenticated"' src/server/routes/models.ts`
    - Response shape unchanged: `grep -q 'models: models.map' src/server/routes/models.ts`
    - TypeScript compiles clean (models.ts has no errors): `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/server/routes/models\.ts"` returns nothing (exit 1)
    - Project-wide TypeScript compiles clean: `npx tsc --noEmit -p tsconfig.json` exits 0
  </acceptance_criteria>
  <done>
    Per D-02: /api/models?provider=openai returns openai-codex models when OAuth is the active method and standard openai models when API Key is active. typedProvider (narrowed to Provider) is passed to resolvePiProvider, which returns the PiProvider slug for pi-ai's getModels. All existing guards (400 invalid provider, 401 not authenticated) and response shape preserved. Project-wide TypeScript compiles clean.
  </done>
</task>

</tasks>

<verification>
**Structural verification (automated):**
- `grep -q 'resolvePiProvider' src/server/lib/credentials.ts` — helper defined
- `grep -q 'resolvePiProvider' src/server/agent/setup.ts` — helper called in createAgent
- `grep -q 'resolvePiProvider' src/server/routes/models.ts` — helper called in /api/models
- `npx tsc --noEmit -p tsconfig.json` exits 0 — project-wide type safety

**Functional verification (manual smoke test, optional):**
1. Start dev server: `npm run dev:server`
2. Store an OpenAI API Key: `curl -sS -X POST http://localhost:3001/api/auth/apikey -H "Content-Type: application/json" -d '{"provider":"openai","key":"sk-..."}'`
3. Request models: `curl -sS "http://localhost:3001/api/models?provider=openai" | jq .models[].id`
   Expected: standard OpenAI models (gpt-4o, gpt-4o-mini, gpt-5, etc.) — NOT gpt-5.1-codex.
4. (OAuth model list verification happens in Plan 02/03 after OAuth tokens are stored.)

**No regressions:**
- `/api/auth/apikey` (Phase 5) still works (no credentials.ts exports removed)
- `/api/chat` still works with Anthropic API Key + standard OpenAI API Key paths (resolvePiProvider returns provider unchanged in both)
- `/api/models?provider=anthropic` still returns Anthropic model list unchanged (anthropic branch of resolvePiProvider is identity)
</verification>

<success_criteria>
- src/server/lib/credentials.ts exports resolvePiProvider, forceExpireOAuth, PiProvider type
- src/server/agent/setup.ts uses getModel(resolvePiProvider(provider), modelId) in createAgent
- src/server/routes/models.ts uses getModels(resolvePiProvider(typedProvider)) in GET handler
- All existing Phase 5 exports from credentials.ts preserved (no breaking change)
- Project-wide `npx tsc --noEmit -p tsconfig.json` exits 0
- Dev server starts clean (no runtime errors from the edit)
</success_criteria>

<output>
After completion, create `.planning/phases/07-openai-oauth-flow/07-01-SUMMARY.md` documenting:
- Files modified: src/server/lib/credentials.ts, src/server/agent/setup.ts, src/server/routes/models.ts
- New exports: resolvePiProvider, forceExpireOAuth, PiProvider type
- Key implementation choices: remap is backend-internal (Provider type stays "anthropic" | "openai"); forceExpireOAuth lives in credentials.ts because it touches the store's internal state
- Known limitations: modelId cast may still be needed depending on pi-ai's type export for getModel's second parameter — note exact resolution
- Follow-up for Plan 02: oauth.ts route handlers import forceExpireOAuth for the debug endpoint; Plan 03 UAT proves the remap end-to-end
</output>
</content>
</invoke>