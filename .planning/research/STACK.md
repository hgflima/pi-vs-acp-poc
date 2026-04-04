# Stack Research: v1.1 OAuth Authentication

**Domain:** OAuth authentication for LLM providers (Anthropic + OpenAI Codex)
**Researched:** 2026-04-04
**Confidence:** HIGH

## Executive Summary

The single most important finding is that **pi-ai already ships built-in OAuth providers** for both Anthropic and OpenAI Codex (`@mariozechner/pi-ai/oauth`). The library includes complete PKCE flows, local callback servers, token exchange, token refresh, and credential management. This eliminates the need for any external OAuth library.

The second critical finding concerns **Anthropic's policy shift**: as of April 4, 2026, Anthropic requires Extra Usage (pay-as-you-go) billing for third-party OAuth traffic. The OAuth flow itself works, but subscription credits no longer cover third-party usage. OpenAI has no such restriction -- Codex OAuth works freely in third-party tools.

**Zero new npm dependencies are needed.** The implementation is entirely about wiring pi-ai's existing OAuth utilities into the Hono backend.

## Recommended Stack Additions

### New Dependencies: NONE

No new packages need to be installed. Everything required exists in `@mariozechner/pi-ai ^0.64.0`.

### pi-ai OAuth Modules (Already Installed)

| Module | Import Path | Purpose | Why |
|--------|-------------|---------|-----|
| `openaiCodexOAuthProvider` | `@mariozechner/pi-ai/oauth` | Complete OpenAI Codex OAuth PKCE flow | Built-in provider with local callback server on port 1455, PKCE S256, token refresh |
| `anthropicOAuthProvider` | `@mariozechner/pi-ai/oauth` | Complete Anthropic OAuth PKCE flow | Built-in provider with local callback server on port 53692, PKCE S256, token refresh |
| `getOAuthProvider` | `@mariozechner/pi-ai/oauth` | Provider registry lookup | Fetch provider by ID for login/refresh |
| `getOAuthApiKey` | `@mariozechner/pi-ai/oauth` | API key extraction with auto-refresh | Handles expired token refresh transparently, returns fresh API key |
| `OAuthCredentials` | `@mariozechner/pi-ai/oauth` | Type: `{ refresh, access, expires, [key]: unknown }` | Credential storage type shared by all providers |
| `OAuthLoginCallbacks` | `@mariozechner/pi-ai/oauth` | Type: callbacks for OAuth flow | `onAuth` (URL), `onPrompt` (fallback), `onProgress`, `onManualCodeInput` |
| `OAuthProviderInterface` | `@mariozechner/pi-ai/oauth` | Type: provider contract | `login()`, `refreshToken()`, `getApiKey()`, `modifyModels()` |

## How pi-ai OAuth Works (Architecture)

### OpenAI Codex Flow

1. **Client ID:** `app_EMoamEEZ73f0CkXaXp7hrann` (hardcoded in pi-ai)
2. **Authorization URL:** `https://auth.openai.com/oauth/authorize`
3. **Token URL:** `https://auth.openai.com/oauth/token`
4. **Redirect URI:** `http://localhost:1455/auth/callback`
5. **Scopes:** `openid profile email offline_access`
6. **PKCE:** S256 code challenge
7. **Local callback server:** `node:http.createServer` on port 1455
8. **Token refresh:** POST to token URL with `grant_type=refresh_token`
9. **Extra field:** `accountId` extracted from JWT claim `https://api.openai.com/auth`

### Anthropic Flow

1. **Client ID:** Base64-encoded in pi-ai source (obfuscated)
2. **Authorization URL:** `https://claude.ai/oauth/authorize`
3. **Token URL:** `https://platform.claude.com/v1/oauth/token`
4. **Redirect URI:** `http://localhost:53692/callback`
5. **Scopes:** `org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload`
6. **PKCE:** S256 code challenge
7. **Local callback server:** `node:http.createServer` on port 53692
8. **Token refresh:** POST to token URL with `grant_type=refresh_token`

### Integration Point with Existing Code

The existing `createAgent()` in `src/server/agent/setup.ts` already uses `getApiKey: () => apiKey`. For OAuth, the change is:

```typescript
// Current (API Key)
getApiKey: () => apiKey

// OAuth (with auto-refresh)
getApiKey: async () => {
  const result = await getOAuthApiKey(providerId, oauthCredentials)
  if (!result) throw new Error("OAuth credentials expired")
  // Update stored credentials with refreshed tokens
  updateOAuthCredentials(providerId, result.newCredentials)
  return result.apiKey
}
```

## Backend Integration Points

### Credentials Store Extension

The existing `src/server/lib/credentials.ts` stores API keys as `Map<Provider, string>`. For OAuth, extend to:

```typescript
type AuthMethod = "apikey" | "oauth"
type Credentials = {
  method: AuthMethod
  apiKey?: string
  oauth?: OAuthCredentials
}
```

### New OAuth Routes (in existing Hono backend)

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/auth/oauth/start` | POST | Start OAuth flow, return auth URL to frontend |
| `GET /api/auth/oauth/status/:provider` | GET | Poll OAuth completion status |
| `POST /api/auth/oauth/refresh` | POST | Force token refresh |

The OAuth callback is handled by pi-ai's built-in `node:http` server (ports 1455/53692), NOT by Hono. The Hono backend orchestrates the flow but the callback happens on a separate port.

### Flow Sequence

```
Frontend                    Hono Backend              pi-ai OAuth            Browser
   |                            |                         |                     |
   |-- POST /oauth/start ------>|                         |                     |
   |                            |-- loginOpenAICodex() -->|                     |
   |                            |   (starts http server)  |                     |
   |<-- { authUrl } -----------|<-- onAuth({ url }) ------|                     |
   |                            |                         |                     |
   |-- window.open(authUrl) ------------------------------------------>|        |
   |                            |                         |            |        |
   |                            |                         |<-- callback on :1455|
   |                            |<-- resolves credentials |                     |
   |                            |                         |                     |
   |-- GET /oauth/status ------>|                         |                     |
   |<-- { status: "ok" } ------|                         |                     |
```

## Provider Policy Status

### OpenAI Codex -- SAFE for Third-Party OAuth

| Aspect | Status |
|--------|--------|
| OAuth in third-party tools | **Allowed** -- OpenAI officially partners with OpenCode, RooCode, etc. |
| Subscription billing | Subscription credits cover third-party usage |
| Terms of service risk | **LOW** -- OpenAI actively encourages third-party integration |
| Token lifetime | Short-lived JWTs (~1 hour), auto-refresh via refresh token |

**Confidence:** HIGH -- Multiple official sources confirm OpenAI's permissive stance.

### Anthropic -- WORKS WITH CAVEATS

| Aspect | Status |
|--------|--------|
| OAuth in third-party tools | **Works** but requires Extra Usage billing (pay-as-you-go) |
| Subscription billing | Subscription credits NO LONGER cover third-party usage (changed April 4, 2026) |
| Terms of service risk | **MEDIUM** -- OAuth technically works but Anthropic discourages third-party use |
| Recommended alternative | API Key authentication (clearer billing path) |
| Token lifetime | Short-lived (~1 hour), auto-refresh via refresh token |

**Confidence:** HIGH -- Verified via OpenClaw docs, VentureBeat, The Register, multiple sources.

**Recommendation for Anthropic:** Implement OAuth but prominently warn users that Extra Usage billing applies. API Key remains the recommended auth method for Anthropic. The UI should default to API Key for Anthropic and OAuth for OpenAI.

## Frontend Changes (No New Libraries)

The frontend needs no new npm dependencies. Changes are React state + fetch calls:

| Change | What | Why |
|--------|------|-----|
| Auth method toggle | `"apikey" | "oauth"` in connection UI | User chooses auth method per provider |
| OAuth start button | Calls `POST /api/auth/oauth/start` | Initiates flow |
| OAuth status polling | Polls `GET /api/auth/oauth/status/:provider` | Detects when OAuth completes |
| `window.open()` | Opens provider auth URL | Standard browser popup for OAuth |
| Billing warning | Anthropic-specific notice | Warns about Extra Usage requirement |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| OAuth library | pi-ai built-in OAuth | `oauth4webapi` (v3.8.5) | pi-ai already implements the complete flow; adding a generic library duplicates effort and loses provider-specific handling (accountId extraction, scope config, obfuscated client IDs) |
| OAuth library | pi-ai built-in OAuth | `arctic` (v3) | Arctic supports 50+ providers but NOT OpenAI Codex or Anthropic specifically; pi-ai's implementations are purpose-built |
| OAuth library | pi-ai built-in OAuth | `@hono/oauth-providers` | Only supports predefined social providers (Google, GitHub, etc.); no OpenAI or Anthropic support |
| OAuth framework | None (no auth framework) | `better-auth` | Full auth framework is massive overkill for single-user POC that needs 2 specific OAuth flows |
| OAuth framework | None (no auth framework) | `lucia-auth` / `auth.js` | Same reasoning -- these solve user authentication, not provider OAuth |
| Token storage | In-memory `Map` (extended) | `~/.pi/agent/auth.json` | POC is local-only, in-memory is sufficient, consistent with existing API key storage pattern |
| Token storage | In-memory `Map` (extended) | IndexedDB / localStorage | Credentials must stay server-side (security constraint); browser storage would expose tokens |
| Callback handling | pi-ai's built-in `node:http` server | Hono route on same port | pi-ai hardcodes callback ports (1455 for OpenAI, 53692 for Anthropic) and handles the full HTTP exchange; reimplementing in Hono would duplicate and likely break the flow |

## What NOT to Add

| Avoid | Why | Impact if Added |
|-------|-----|-----------------|
| `passport` / `passport-oauth2` | Express middleware, not Hono-compatible; designed for user auth, not provider auth | Adds Express dependency, fundamentally wrong abstraction |
| `oauth4webapi` | Duplicates what pi-ai already provides with provider-specific knowledge baked in | Unnecessary dependency, must re-implement provider specifics |
| `openid-client` | OpenID Connect client, overkill -- we need raw OAuth 2.0 PKCE, which pi-ai handles | Heavy library, complex API, unnecessary discovery/metadata |
| `better-auth` / `lucia-auth` | Full auth frameworks for user sessions; this POC has no user authentication | Massive scope creep, irrelevant to the problem |
| `jsonwebtoken` / `jose` | JWT verification -- pi-ai's `getApiKey()` handles token extraction; we don't need to verify JWTs ourselves | Unnecessary; tokens are verified by the provider on API calls |
| Any database ORM | Token storage is in-memory; no persistence needed for single-user local-only POC | Violates constraint: "no database" |
| `cookie-parser` / session middleware | No user sessions; OAuth state is managed server-side in memory during the flow | Wrong abstraction for provider OAuth |

## Installation

```bash
# Nothing to install. All OAuth functionality comes from existing dependencies:
# @mariozechner/pi-ai ^0.64.0 (already installed)
# @mariozechner/pi-agent-core ^0.64.0 (already installed)
```

## Version Compatibility

| Package | Required Version | Verified | Notes |
|---------|-----------------|----------|-------|
| `@mariozechner/pi-ai` | `^0.64.0` | YES (installed) | OAuth module available since this version |
| `@mariozechner/pi-agent-core` | `^0.64.0` | YES (installed) | `getApiKey` supports async (Promise return) |
| Node.js | 20+ | YES | Required for `node:http` and `node:crypto` used by OAuth |
| Hono | `^4.12.0` | YES (installed) | No changes needed; new routes use same patterns |

## Port Allocation

| Port | Owner | Purpose |
|------|-------|---------|
| 5173 | Vite dev server | Frontend |
| 3001 | Hono backend | API routes |
| 1455 | pi-ai OAuth (OpenAI) | OAuth callback server (temporary, during login only) |
| 53692 | pi-ai OAuth (Anthropic) | OAuth callback server (temporary, during login only) |

The callback servers are ephemeral -- they start when `loginOpenAICodex()` or `loginAnthropic()` is called and shut down after the callback is received or the flow times out.

## Sources

### Verified with Source Code (HIGH confidence)
- `@mariozechner/pi-ai/dist/utils/oauth/openai-codex.js` -- Full OpenAI Codex PKCE implementation
- `@mariozechner/pi-ai/dist/utils/oauth/anthropic.js` -- Full Anthropic PKCE implementation
- `@mariozechner/pi-ai/dist/utils/oauth/index.js` -- Provider registry, `getOAuthApiKey()` with auto-refresh
- `@mariozechner/pi-ai/dist/utils/oauth/types.d.ts` -- `OAuthCredentials`, `OAuthLoginCallbacks`, `OAuthProviderInterface`
- `@mariozechner/pi-agent-core/dist/agent.d.ts` -- `getApiKey` option supports async `Promise<string | undefined>`

### Official Documentation (HIGH confidence)
- [OpenAI Codex Authentication](https://developers.openai.com/codex/auth) -- OAuth and API key methods
- [Claude Code Authentication](https://code.claude.com/docs/en/authentication) -- OAuth credential management
- [pi-mono providers docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md) -- OAuth provider configuration
- [pi-mono custom providers](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/custom-provider.md) -- OAuthLoginCallbacks interface

### Policy / Terms (HIGH confidence)
- [Anthropic bans third-party OAuth](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access) -- February 2026
- [Anthropic Extra Usage billing change](https://docs.openclaw.ai/providers/anthropic) -- April 4, 2026
- [OpenAI supports third-party OAuth](https://www.zbuild.io/resources/news/opencode-blocked-anthropic-2026) -- OpenAI partners with third-party tools

### Community / Ecosystem (MEDIUM confidence)
- [OpenAI Codex OAuth client_id discussion](https://community.openai.com/t/best-practice-for-clientid-when-using-codex-oauth/1371778)
- [OpenCode Codex OAuth implementation](https://github.com/anomalyco/opencode/issues/3281) -- Third-party OAuth flow details
- [openai-oauth package](https://github.com/EvanZhouDev/openai-oauth) -- Confirms Codex OAuth endpoints

---
*Stack research for: v1.1 OAuth Authentication*
*Researched: 2026-04-04*
