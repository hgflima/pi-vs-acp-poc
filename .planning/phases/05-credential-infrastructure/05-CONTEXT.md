# Phase 5: Credential Infrastructure - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor the credential store for compound credentials (OAuth tokens + API Key coexistence) and async token resolution. Existing API Key auth continues working unchanged. No OAuth flows are implemented here — only the infrastructure that Phases 6-8 will build on.

</domain>

<decisions>
## Implementation Decisions

### Active credential priority
- **D-01:** OAuth preferred — when both API Key and OAuth exist for a provider, the resolver returns the OAuth access token
- **D-02:** No silent fallback — if OAuth token expires and refresh fails, the system returns an error requiring re-auth. It does NOT silently fall back to API Key even if one exists

### Agent factory contract
- **D-03:** Factory resolves credentials internally — `createAgent(provider, modelId)` consults the credential store. Callers don't need to know about credential types
- **D-04:** Proactive refresh strategy — a timer/check before requests ensures the token is fresh. `getApiKey` remains synchronous, returning the current token from the store. No async wrapper needed since pi-agent-core expects `() => string`

### Frontend auth awareness
- **D-05:** AuthState exposes active auth method — includes `authMethod: 'apiKey' | 'oauth' | null` so the UI can show badges and token status indicators (prepares for UI-03)
- **D-06:** Per-provider auth state — `Map<Provider, ProviderAuthState>` where each provider has independent connection status. User can have Anthropic connected via OAuth and OpenAI via API Key simultaneously

### Credential store surface
- **D-07:** Granular API per credential type — `storeApiKey(provider, key)`, `storeOAuthTokens(provider, tokens)`, `clearByType(provider, type)`, `getActiveCredential(provider)`. Type-safe, explicit operations
- **D-08:** Status query endpoint — `getAuthStatus(provider)` returns `{ hasApiKey, hasOAuth, activeMethod, oauthExpiry? }`. Frontend consults via GET route. Foundation for UI-03 token health indicators

### Claude's Discretion
- Internal data structure for compound credentials (discriminated union, separate maps, etc.)
- TypeScript type definitions for OAuthCredential shape
- Proactive refresh timer implementation details
- Error types and messages for credential resolution failures
- How the GET /auth/status route is structured

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Credential system (current)
- `src/server/lib/credentials.ts` — Current credential store (Map<Provider, string>), the file being refactored
- `src/server/agent/setup.ts` — Current agent factory with sync `getApiKey: () => apiKey`, contract changing per D-03/D-04
- `src/server/routes/auth.ts` — Current API key validation route, needs to coexist with new OAuth storage

### Types and state
- `src/client/lib/types.ts` — AuthState, Provider, AppState types that need updating per D-05/D-06
- `src/client/hooks/use-auth.ts` — Current auth hook (connect/disconnect), needs per-provider refactor

### Architecture decisions
- `.harn/docs/adr/0005-api-key-first-oauth-stretch.md` — Original ADR on API Key vs OAuth; v1.1 adds OAuth as alternative while keeping API Key
- `.planning/REQUIREMENTS.md` — CRED-01, CRED-02, OAUTH-04 requirements for this phase

### pi-agent-core interface
- `@mariozechner/pi-agent-core` Agent constructor — `getApiKey: () => string` is sync; constrains D-04 proactive refresh approach

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `credentials.ts` store pattern (Map-based, in-memory) — same approach scales to compound storage
- `createAgent()` factory pattern — refactor in place, maintain same call sites
- `useAuth` hook — extend with per-provider state rather than replace

### Established Patterns
- Provider type: `"anthropic" | "openai"` — consistent across backend and frontend
- In-memory only storage — no persistence (project constraint)
- API key validation via test request to provider — pattern stays for API Key method

### Integration Points
- `src/server/routes/chat.ts` — calls `createAgent()`, needs to pass only provider+model after D-03
- `src/client/components/connection/connection-page.tsx` — consumes AuthState, will need per-provider rendering
- `src/client/components/config/inline-auth.tsx` — uses auth state for inline connection

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-credential-infrastructure*
*Context gathered: 2026-04-04*
