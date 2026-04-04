# Pitfalls Research: OAuth Authentication for Local-Only Chat App

**Domain:** Adding OAuth (Anthropic + OpenAI) to existing SPA with API Key auth
**Researched:** 2026-04-04
**Confidence:** HIGH (verified against pi-ai source code, provider policies, community reports)

## Critical Pitfalls

### Pitfall 1: Anthropic Has Banned OAuth Tokens for Third-Party Apps

**What goes wrong:**
You implement the full Anthropic OAuth flow using pi-ai's `loginAnthropic()`, the user completes login, you get `sk-ant-oat01-*` tokens -- and the Anthropic Messages API rejects every request with `"OAuth authentication is currently not supported."` The flow works mechanically but the tokens are useless for API calls.

**Why it happens:**
Anthropic formally revised its terms in February 2026 to explicitly ban OAuth tokens for third-party tools. Starting April 3, 2026, subscription OAuth tokens (`sk-ant-oat*`) are reserved exclusively for Claude Code and Claude.ai. Pi-ai's `anthropicOAuthProvider` still exports the login flow (it was designed before the ban), and the library's Anthropic provider has full OAuth support (detects `sk-ant-oat` prefix, switches to Bearer auth, adds Claude Code identity headers) -- but the server-side enforcement now blocks these tokens.

**How to avoid:**
Do NOT implement Anthropic OAuth. Anthropic only supports API key authentication (`sk-ant-api03-*`) from console.anthropic.com for third-party apps. The existing API Key flow in v1.0 is the correct and only supported method.

**Warning signs:**
- The pi-ai library exports `loginAnthropic` and `anthropicOAuthProvider` -- existence of the code does NOT mean the flow works
- Any article/tutorial about Anthropic OAuth from before Feb 2026 is outdated
- The `isOAuthToken()` function in pi-ai's anthropic provider checks for `sk-ant-oat` prefix and switches behavior -- but tokens with that prefix are now rejected by Anthropic's API

**Phase to address:**
Phase 0 (Planning/Architecture). This is a scope-eliminating finding. Anthropic OAuth should be removed from the milestone requirements entirely.

**Sources:**
- [Anthropic disabled OAuth for third-party apps (Issue #28091)](https://github.com/anthropics/claude-code/issues/28091) -- HIGH confidence
- [Anthropic Bans Third-Party OAuth (WinBuzzer, Feb 2026)](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/) -- HIGH confidence
- [Feature request for OAuth API access (Issue #37205)](https://github.com/anthropics/claude-code/issues/37205) -- confirms still blocked
- Verified in pi-ai source: `anthropic.js` line 408-453, `isOAuthToken()` detects prefix, switches auth mode -- but server rejects

---

### Pitfall 2: OpenAI OAuth Tokens May Lack Required API Scopes

**What goes wrong:**
You implement OpenAI Codex OAuth using pi-ai's `loginOpenAICodex()`, the user completes login successfully, you get an access token -- but API calls to `chat/completions` fail with `"Missing scopes: model.request"`. The OAuth token from ChatGPT subscription login contains only identity scopes (`openid`, `profile`, `email`, `offline_access`) and lacks the `model.request` scope needed for API calls.

**Why it happens:**
OpenAI's Codex OAuth flow (client ID `app_EMoamEEZ73f0CkXaXp7hrann`) was designed for the Codex CLI/IDE tools. When used by third-party apps, the tokens may not include API-level scopes. OpenAI has been progressively tightening scope enforcement since early 2026. The pi-ai library requests `"openid profile email offline_access"` scopes -- notably missing `model.request`.

**How to avoid:**
1. Test the full flow end-to-end EARLY -- don't assume token acquisition means API access works
2. After getting a token, immediately try a cheap API call (like the existing validation pattern with `gpt-4o-mini`) before storing credentials
3. Be prepared for this to fail entirely -- have API Key as the primary fallback
4. Monitor the pi-ai library for scope updates (the library maintainer may add `model.request` to the scope request)

**Warning signs:**
- Token exchange succeeds but first API call fails with scope error
- The `accountId` extraction from JWT works fine (identity claim present) but API calls don't
- Works in Codex CLI but not in your app -- Codex CLI may have special scope handling

**Phase to address:**
Phase 1 (OpenAI OAuth Implementation). Build the validation check BEFORE storing OAuth credentials, mirroring the existing API Key validation pattern.

**Sources:**
- [OpenAI OAuth tokens missing model.request scope (OpenClaw Issue #24720)](https://github.com/openclaw/openclaw/issues/24720) -- HIGH confidence
- [OAuth only works with GPT-4o (OpenClaw Issue #27055)](https://github.com/openclaw/openclaw/issues/27055) -- MEDIUM confidence
- Verified in pi-ai source: `openai-codex.js` line 24, SCOPE = `"openid profile email offline_access"` -- missing `model.request`

---

### Pitfall 3: pi-ai OAuth Functions Are CLI-Only (Node.js http.createServer)

**What goes wrong:**
You try to call `loginAnthropic()` or `loginOpenAICodex()` from browser-side code and get `"Anthropic OAuth is only available in Node.js environments"` or `"OpenAI Codex OAuth is only available in Node.js environments"`. Even if called server-side, the functions spin up their own HTTP servers on hardcoded ports (53692 for Anthropic, 1455 for OpenAI) -- these port-specific callback servers may conflict with your existing Hono server or Vite dev server.

**Why it happens:**
Both OAuth modules explicitly check for Node.js environment and import `node:http` and `node:crypto` dynamically. They create standalone HTTP servers to receive OAuth callbacks. The comment in source is explicit: "NOTE: This module uses Node.js http.createServer for the OAuth callback server. It is only intended for CLI use, not browser environments."

**How to avoid:**
Call `loginOpenAICodex()` (and any OAuth login) from the BACKEND (Hono server), not the frontend. The flow becomes:
1. Frontend calls backend API endpoint to initiate OAuth
2. Backend calls pi-ai's `loginOpenAICodex()` which starts the callback server
3. Backend returns the auth URL to frontend
4. Frontend opens the URL in a new browser tab/popup
5. User completes login, callback hits the pi-ai callback server
6. Backend receives credentials, stores them, signals frontend

**Warning signs:**
- Vite build errors about `node:http` or `node:crypto` in browser bundle
- Port conflicts at runtime (Hono on 3001, Vite on 5173, OAuth callbacks on 53692/1455)
- The OAuth callback server from pi-ai runs independently from your Hono server

**Phase to address:**
Phase 1 (Architecture). Design the backend-mediated OAuth flow before writing any code. The sequence of "frontend initiates -> backend manages OAuth -> frontend polls for completion" must be the foundation.

---

### Pitfall 4: OAuth Callback Port Conflicts and Hardcoded Redirect URIs

**What goes wrong:**
The OAuth callback servers in pi-ai listen on HARDCODED ports: `127.0.0.1:53692` (Anthropic) and `127.0.0.1:1455` (OpenAI). If another process (another instance of the app, Codex CLI, another dev tool) is using those ports, the server fails to bind. The Anthropic callback server hard-rejects with an error; the OpenAI one falls back to manual paste mode but the UX degrades significantly.

**Why it happens:**
OAuth redirect URIs must be pre-registered with the provider. The pi-ai library uses the same client IDs and redirect URIs as the Codex CLI tools. The ports cannot be changed without also changing the registered redirect URI at the provider, which requires registering your own OAuth application.

**How to avoid:**
1. Document the port requirements (53692, 1455) and check for conflicts before starting OAuth
2. The OpenAI implementation has a graceful degradation: if port 1455 fails, it falls back to manual code paste via `onManualCodeInput` -- implement this fallback UX
3. Kill any other Codex CLI or dev tool instances before starting OAuth
4. Consider adding a pre-check endpoint that tries to bind the port before starting the flow

**Warning signs:**
- `EADDRINUSE` error when starting OAuth flow
- OAuth browser login completes but callback never arrives (port occupied by wrong server)
- User sees "Hmm, can't reach this page" in browser after auth completes

**Phase to address:**
Phase 1 (OAuth Implementation). Implement port availability check and manual-paste fallback from day one.

**Sources:**
- [Codex OAuth localhost:1455 callback issues (Issue #8112)](https://github.com/openai/codex/issues/8112) -- HIGH confidence
- [Add Device Code flow for localhost callback issues (Issue #12263)](https://github.com/openai/codex/issues/12263) -- MEDIUM confidence
- Verified in pi-ai source: `anthropic.js` line 16-17, `openai-codex.js` line 23, hardcoded ports

---

### Pitfall 5: Token Refresh Race Condition Under Concurrent Requests

**What goes wrong:**
User sends a chat message, the token is about to expire, the backend starts refreshing. Meanwhile the SSE stream is still going and a tool call needs to make another LLM call. Both the ongoing stream and the tool call attempt to use the token. If the refresh happens mid-stream, the old token becomes invalid, breaking the active stream. If two refreshes happen simultaneously, the second refresh may use an already-invalidated refresh token (one-time-use) and fail.

**Why it happens:**
The current credentials store is a simple `Map<Provider, string>` with no concurrency control. pi-agent-core's `getApiKey` is called on every LLM request (it can be async, designed for exactly this). But without a mutex/lock around refresh, parallel requests can all detect expiry and all try to refresh simultaneously.

**How to avoid:**
1. Implement a refresh mutex: when a refresh is in-progress, other callers wait for it to complete rather than starting their own refresh
2. Refresh proactively -- when token is within 5 minutes of expiry (pi-ai already subtracts 5 minutes from `expires_in` for Anthropic), refresh BEFORE it's needed
3. The `getApiKey` callback on the Agent is the right hook -- implement it as an async function that checks expiry and refreshes with a lock:

```typescript
// Pattern: single-flight refresh
let refreshPromise: Promise<string> | null = null;

async function getApiKeyWithRefresh(provider: string): Promise<string> {
  const creds = getOAuthCredentials(provider);
  if (!creds) return getApiKeyCredentials(provider); // fallback to API key
  
  if (Date.now() < creds.expires) return creds.access;
  
  // Single-flight: reuse in-progress refresh
  if (!refreshPromise) {
    refreshPromise = doRefresh(provider, creds)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}
```

**Warning signs:**
- Intermittent `401` errors during active chat sessions
- Token refresh works in testing (sequential) but fails under load (concurrent tool calls)
- `refresh_token_reused` errors from the provider

**Phase to address:**
Phase 1 (Credential Store Refactor). The current `Map<Provider, string>` must be replaced with a credential store that handles both API keys and OAuth tokens with refresh logic.

**Sources:**
- [OAuth refresh race condition (Nango Blog)](https://nango.dev/blog/concurrency-with-oauth-token-refreshes) -- HIGH confidence
- [Anthropic OAuth refresh race condition (Issue #24317)](https://github.com/anthropics/claude-code/issues/24317) -- HIGH confidence
- [OpenAI Codex refresh token reuse error (Issue #10332)](https://github.com/openai/codex/issues/10332) -- HIGH confidence

---

### Pitfall 6: Credential Store Assumes Single Auth Method Per Provider

**What goes wrong:**
The existing `credentials.ts` stores `Map<Provider, string>` -- one credential per provider. When adding OAuth, you need to store BOTH an API key AND OAuth tokens for the same provider (user may have both configured). Overwriting the API key with an OAuth token (or vice versa) loses the other credential. Worse: the `createAgent` setup passes `apiKey` as a plain string to pi-agent-core's `getApiKey`, which doesn't distinguish between API key strings and OAuth access tokens.

**Why it happens:**
v1.0 was designed for API keys only. The credential store, the auth routes, and the agent setup all assume "one string per provider." OAuth introduces a compound credential (access token + refresh token + expiry timestamp) that doesn't fit in a `string`.

**How to avoid:**
Refactor the credential store to support multiple auth methods:

```typescript
type AuthMethod = 
  | { type: 'apikey'; key: string }
  | { type: 'oauth'; access: string; refresh: string; expires: number; accountId?: string };

type ProviderAuth = {
  active: 'apikey' | 'oauth';  // which method is currently in use
  apikey?: AuthMethod & { type: 'apikey' };
  oauth?: AuthMethod & { type: 'oauth' };
};

const credentials = new Map<Provider, ProviderAuth>();
```

The `getApiKey` callback for the Agent should resolve the active method and return the appropriate string (API key or current access token).

**Warning signs:**
- Setting up OAuth clears the existing API key
- Switching auth methods requires re-entering credentials
- The backend doesn't know if it's holding an API key or an OAuth token

**Phase to address:**
Phase 0 (Credential Store Refactor). This MUST happen before implementing any OAuth flow. The store redesign is a prerequisite.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store OAuth tokens in-memory only (no persistence) | No disk I/O, no file security concerns | User must re-authenticate every server restart | **Acceptable for POC** -- single-user, local-only. User restarts are rare. |
| Share pi-ai's hardcoded OAuth client ID | No need to register own OAuth app | If provider blocks the shared client ID, all users affected | **Acceptable** -- pi-ai's client ID is what the library provides. Registering own is not an option for Anthropic/OpenAI subscription OAuth. |
| Skip Anthropic OAuth entirely | Saves implementation time, avoids dead code | No subscription-based access for Anthropic | **Correct decision** -- Anthropic has explicitly banned this for third-party apps. This is not debt, it's compliance. |
| No token encryption at rest | Simpler implementation | Tokens readable in memory dump | **Acceptable for single-user local-only** -- the entire machine is trusted. |
| Hardcoded callback ports | Works with pi-ai's pre-registered redirect URIs | Port conflicts with other tools | **Acceptable** -- cannot change without registering own OAuth app. Mitigate with port-check and fallback UX. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| pi-ai `loginOpenAICodex()` | Calling from browser/frontend code | Call from backend (Node.js), relay auth URL to frontend |
| pi-ai `getOAuthApiKey()` | Not handling the credential update after refresh (function returns `newCredentials` that MUST be persisted) | Always persist the `newCredentials` returned -- the refresh token rotates on each use |
| pi-agent-core `getApiKey` | Returning a static string for OAuth tokens | Return an async function that checks expiry and refreshes |
| Anthropic provider detection | Assuming `isOAuthToken()` (checks `sk-ant-oat` prefix) means the token will work | The detection works but Anthropic's API rejects the token server-side |
| OpenAI `accountId` extraction | Not checking the JWT payload for the `chatgpt_account_id` claim | This claim is required for Codex API calls; missing claim means the token won't work |
| Vite dev proxy | Not forwarding OAuth-related routes to the backend | Add OAuth callback routes to Vite's proxy config if frontend initiates the flow |
| Browser popup for OAuth | Using `window.open()` without handling popup blockers | Use a redirect-based flow or handle popup blocker with a fallback link |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing OAuth tokens to frontend | Token theft via XSS, browser extensions | Keep ALL tokens server-side. Frontend only knows auth status (connected/disconnected), never the token value. Same pattern as current API key handling. |
| Storing refresh tokens in localStorage/sessionStorage | Refresh tokens grant indefinite access; XSS = full account compromise | Refresh tokens stay in backend memory ONLY. Frontend never sees them. |
| Not validating OAuth `state` parameter | CSRF attacks could inject attacker's auth code | Pi-ai's implementations validate state -- don't bypass this. If implementing manual code paste, still verify state. |
| Logging OAuth tokens | Tokens in server logs are a leak vector | Sanitize log output. Never log the full access or refresh token. Log only `token type + last 4 chars`. |
| Not revoking tokens on disconnect | User clicks "disconnect" but token remains valid | Implement token revocation on disconnect (if provider supports it). At minimum, clear from memory. |
| Using `localhost` instead of `127.0.0.1` in redirect URI | RFC 8252 Section 7.3 requires IP literal for loopback. DNS-based `localhost` can be spoofed. | Pi-ai uses `127.0.0.1` for the server bind but `localhost` in the redirect URI string -- this is intentional (matches provider registration). Don't change it. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| OAuth flow opens in same tab | User loses the chat app context, has to navigate back | Open OAuth in a popup or new tab. Frontend polls backend for completion. |
| No feedback during OAuth wait | User completes login in browser but doesn't know if it worked | Show a "Waiting for authentication..." state with a spinner. Poll backend endpoint or use SSE to get notified when OAuth completes. |
| Connection page doesn't explain auth method differences | User doesn't know when to use API Key vs OAuth | Show clear descriptions: "API Key: Use your own API credits" vs "OAuth: Use your ChatGPT subscription" |
| Silent OAuth failure | Token exchange fails but UI shows generic error | Map specific OAuth errors to actionable messages: "Port 1455 in use" -> "Close Codex CLI and try again" |
| No way to switch from OAuth back to API Key | User is stuck if OAuth stops working | The UI must always allow switching between auth methods per provider. Never hide the API Key option after OAuth setup. |
| Manual code paste UX is confusing | User doesn't know what to paste when callback fails | Provide clear instructions: "If the browser didn't redirect automatically, copy the URL from your browser's address bar and paste it here" |

## "Looks Done But Isn't" Checklist

- [ ] **OAuth flow completes:** Token acquisition works but API calls fail (scope issues, provider ban) -- verify with an actual API call before declaring success
- [ ] **Token refresh:** Access token works on first use but fails after expiry -- test by setting token expiry to 30 seconds in dev
- [ ] **Port availability:** Works on clean machine but fails when Codex CLI is running -- test with port 1455 occupied
- [ ] **Credential persistence:** OAuth works during session but lost on server restart -- acceptable for POC but must be documented
- [ ] **Agent switching:** OAuth credentials for one provider don't interfere with API Key credentials for another -- test Anthropic API Key + OpenAI OAuth simultaneously
- [ ] **Concurrent requests:** Single request works but tool calls during streaming fail -- test with tool-heavy conversations
- [ ] **Popup blockers:** OAuth popup opens in dev but blocked in production browser settings -- test with strict popup blocking
- [ ] **Frontend state sync:** Backend has OAuth credentials but frontend still shows "disconnected" -- verify the status polling/notification works end-to-end

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Anthropic OAuth tokens rejected | LOW | Remove Anthropic OAuth code, keep API Key only. No user impact since it never worked. |
| OpenAI OAuth scope issues | MEDIUM | Fall back to API Key for OpenAI. If pi-ai updates scopes, retry OAuth. Keep dual-auth UI so switching is seamless. |
| Port conflict during OAuth | LOW | Implement manual code paste fallback. Instruct user to close conflicting app. |
| Refresh token race condition | MEDIUM | Implement refresh mutex. If data corrupted, clear OAuth credentials and re-authenticate. |
| Credential store migration breaks existing API keys | HIGH | Test migration with existing credentials before deploying. Keep old store format as fallback. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Anthropic OAuth ban | Phase 0 (Planning) | Remove Anthropic OAuth from milestone scope; confirm only API Key path exists for Anthropic |
| OpenAI OAuth scope issues | Phase 1 (OAuth Implementation) | End-to-end test: login -> token -> actual API call -> streaming response |
| CLI-only OAuth functions | Phase 1 (Architecture) | Verify OAuth flow runs on backend, frontend only receives auth URL and status updates |
| Hardcoded callback ports | Phase 1 (OAuth Implementation) | Test with port 1455 occupied; verify manual paste fallback works |
| Token refresh race condition | Phase 1 (Credential Store) | Simulate concurrent requests with near-expired token; verify single refresh occurs |
| Single auth method per provider | Phase 0 (Credential Store Refactor) | Verify API Key and OAuth credentials can coexist for the same provider |
| OAuth tokens in frontend | Phase 1 (Security Review) | Audit all frontend API calls; confirm no token/credential data in responses |
| Browser popup blockers | Phase 1 (UX) | Test OAuth flow with popup blocker enabled; verify fallback works |

## Provider-Specific Reference

### Anthropic OAuth (BLOCKED -- Do Not Implement)

| Detail | Value |
|--------|-------|
| Status | **BANNED for third-party apps** as of Feb 2026 |
| Client ID | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` (in pi-ai, base64-encoded) |
| Authorize URL | `https://claude.ai/oauth/authorize` |
| Token URL | `https://platform.claude.com/v1/oauth/token` |
| Callback Port | `127.0.0.1:53692` |
| Token Prefix | `sk-ant-oat01-*` |
| pi-ai Function | `loginAnthropic()` -- exists but tokens are rejected by API |
| Recommendation | **API Key only** (`sk-ant-api03-*` from console.anthropic.com) |

### OpenAI Codex OAuth (PROCEED WITH CAUTION)

| Detail | Value |
|--------|-------|
| Status | **Partially working** -- token acquisition works, API access has scope issues |
| Client ID | `app_EMoamEEZ73f0CkXaXp7hrann` (public, same as Codex CLI) |
| Authorize URL | `https://auth.openai.com/oauth/authorize` |
| Token URL | `https://auth.openai.com/oauth/token` |
| Callback Port | `127.0.0.1:1455` |
| Scopes Requested | `openid profile email offline_access` (missing `model.request`) |
| Token Format | JWT with `https://api.openai.com/auth` claim containing `chatgpt_account_id` |
| pi-ai Function | `loginOpenAICodex()` |
| Refresh | `refreshOpenAICodexToken()` -- rotates refresh token on each use |
| Key Risk | Scope enforcement may block API calls; test immediately after token acquisition |
| Recommendation | Implement with API Key as mandatory fallback |

## Sources

### Official / Authoritative
- [Anthropic OAuth ban for third-party apps (Claude Code Issue #28091)](https://github.com/anthropics/claude-code/issues/28091) -- HIGH confidence
- [OpenAI Codex Authentication Docs](https://developers.openai.com/codex/auth) -- HIGH confidence
- [RFC 8252 Section 7.3 - OAuth for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252#section-7.3) -- HIGH confidence (localhost vs 127.0.0.1)
- [OAuth redirect URI for Claude Code (Issue #42765)](https://github.com/anthropics/claude-code/issues/42765) -- HIGH confidence

### Verified Against Source Code
- pi-ai `anthropic.js`: OAuth token detection, Bearer auth, Claude Code headers -- line 408-466
- pi-ai `openai-codex.js`: PKCE flow, callback server on 1455, JWT parsing -- full file
- pi-ai `types.d.ts`: `OAuthCredentials`, `OAuthProviderInterface` -- credential shape
- pi-agent-core `agent.d.ts`: `getApiKey` supports async, designed for expiring tokens -- line 37-40
- Existing app `credentials.ts`: Simple `Map<Provider, string>` -- inadequate for OAuth

### Community / Post-Mortems
- [Anthropic Bans Third-Party OAuth (WinBuzzer)](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/) -- HIGH confidence
- [OpenAI OAuth tokens missing scopes (OpenClaw Issue #24720)](https://github.com/openclaw/openclaw/issues/24720) -- HIGH confidence
- [OAuth token refresh race conditions (Nango Blog)](https://nango.dev/blog/concurrency-with-oauth-token-refreshes) -- HIGH confidence
- [OAuth redirect pitfalls on localhost (Nango Blog)](https://nango.dev/blog/oauth-redirects-on-localhost-with-https/) -- MEDIUM confidence
- [The Missing Piece: Anthropic Third-Party OAuth (Medium)](https://medium.com/@em.mcconnell/the-missing-piece-in-anthropics-ecosystem-third-party-oauth-ccb5addb8810) -- MEDIUM confidence
- [Localhost OAuth port conflicts (Codex Issue #8112)](https://github.com/openai/codex/issues/8112) -- HIGH confidence

---
*Pitfalls research for: OAuth authentication in local-only SPA with existing API Key auth*
*Researched: 2026-04-04*
