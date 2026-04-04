# Feature Research: OAuth Authentication (v1.1 Milestone)

**Domain:** OAuth authentication for LLM providers (Anthropic + OpenAI) in a local-only chat web app
**Researched:** 2026-04-04
**Confidence:** MEDIUM -- OpenAI OAuth is well-documented and third-party-friendly; Anthropic OAuth is technically functional in pi-ai but legally restricted for third-party use since Feb 2026.

---

## Critical Context: Anthropic OAuth Ban

**On January 9, 2026**, Anthropic deployed server-side blocks that prevent subscription OAuth tokens from working outside their official Claude Code CLI. On **February 19, 2026**, they formalized this in updated Terms of Service:

> "Using OAuth tokens obtained through Claude Free, Pro, or Max accounts in any other product, tool, or service -- including the Agent SDK -- is not permitted and constitutes a violation of the Consumer Terms of Service."

**Enforcement is active and aggressive**: client fingerprinting, automated account bans (some within 20 minutes), no explicit personal-use exception. Developers have received contradictory answers from Anthropic support about whether personal SDK projects violate the ToS.

**OpenAI has the opposite policy**: they explicitly permit third-party tools to use Codex OAuth tokens and have officially partnered with OpenCode, RooCode, and other open-source tools.

**Implication for this milestone**: Anthropic OAuth implementation carries significant risk (account ban). OpenAI OAuth is safe. The pi-ai library provides OAuth implementations for both providers, but the Anthropic one may result in ToS violation.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any OAuth integration in an LLM chat app must have. Missing these = broken auth experience.

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| O1 | **OAuth login button per provider** | Users need a clear "Sign in with ChatGPT" / "Sign in with Claude" alternative to the API key field. Standard OAuth pattern: single click initiates the flow. | LOW | Button triggers backend OAuth initiation. Separate from existing API key form. Provider-specific branding (OpenAI green, Anthropic orange). |
| O2 | **Browser popup/redirect for provider consent** | OAuth requires the user to authenticate at the provider's site (auth.openai.com, claude.ai). Users expect a browser popup or new tab, not a terminal prompt. | MEDIUM | pi-ai's OAuth modules use `http.createServer` for callback servers (ports 1455 for OpenAI, 53692 for Anthropic). Backend starts callback server, frontend opens popup to auth URL, callback receives code, backend exchanges for tokens. |
| O3 | **Auth method selector (OAuth vs API Key)** | Both auth methods must coexist per PROJECT.md requirement. Users need to choose their preferred method per provider. | LOW | Segmented control or tab group: "API Key" / "Sign In". Remembers last selection. Both methods lead to the same `connected` state. |
| O4 | **Token-based credential storage on server** | OAuth tokens (access + refresh) must be stored server-side, never exposed to frontend. Same security model as existing API key storage. | LOW | Extend existing `credentials.ts` Map to store `OAuthCredentials` alongside API keys. Discriminated union: `{ type: "apikey", key: string }` or `{ type: "oauth", credentials: OAuthCredentials }`. |
| O5 | **Transparent token-to-apikey conversion** | pi-ai's `streamSimple`/`streamAnthropic` functions accept `apiKey: string`. OAuth access tokens must be passed as API keys seamlessly. | LOW | pi-ai's `OAuthProviderInterface.getApiKey(credentials)` returns the access token string directly. Existing `getCredentials()` function returns string regardless of source. Zero changes needed in chat/streaming code. |
| O6 | **Automatic token refresh before expiry** | OAuth access tokens expire (Anthropic: ~60 min, OpenAI: short-lived with 8h refresh interval). Users should not have to re-authenticate mid-session. | MEDIUM | Background timer or pre-request check: if `credentials.expires < Date.now() + buffer`, call `provider.refreshToken(credentials)` and update stored credentials. pi-ai provides `refreshAnthropicToken()` and `refreshOpenAICodexToken()`. |
| O7 | **OAuth failure handling with graceful fallback** | OAuth popup may be blocked, user may deny consent, token exchange may fail, callback server may not bind. Must handle all cases with clear feedback. | MEDIUM | Error states: popup blocked (instruct user to allow popups), consent denied (show "Login cancelled"), token exchange failed (generic retry), port conflict (fallback to manual code paste -- pi-ai supports this via `onPrompt`). |
| O8 | **Connection status indicator** | User must see whether they are connected via OAuth or API Key, and which provider. Visual distinction between auth methods. | LOW | Extend existing connected state to show auth method. Badge or label: "Connected via OAuth" vs "Connected via API Key". Existing `AuthState` type needs `authMethod: "apikey" | "oauth"` field. |
| O9 | **Disconnect / logout** | User must be able to disconnect and switch auth methods or providers. OAuth disconnect should clear stored tokens. | LOW | Extend existing `disconnect` to clear OAuth credentials. No need to revoke tokens at provider (local-only app, tokens expire naturally). |

### Differentiators (Competitive Advantage)

Features that go beyond basic OAuth and add value specific to this project's context.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **Dual-provider simultaneous auth** | Users can authenticate with both Anthropic (API key) and OpenAI (OAuth) simultaneously, enabling seamless agent switching without re-authentication. Most chat UIs support only one provider at a time. | MEDIUM | Credential store must support multiple providers concurrently (already does for API keys). Agent switcher (D2 from v1.0) checks credentials for target provider before switching. Prompt to authenticate if missing. |
| D2 | **Mixed auth methods per provider** | User connects Anthropic via API Key and OpenAI via OAuth (or vice versa). Each provider independently chooses its auth method. | LOW | Auth method is per-provider, not global. UI shows auth method per provider in connection status. Credential store already keyed by provider. |
| D3 | **Proactive token expiry warning** | Show a non-intrusive warning when OAuth token is approaching expiry (e.g., 5 min before). Auto-refresh happens silently, but warning provides transparency if refresh fails. | LOW | Check `credentials.expires` periodically. Show subtle toast/badge if expiry is near and refresh hasn't succeeded. Prevents surprise disconnection during long conversations. |
| D4 | **OAuth callback status page** | After completing OAuth in the browser, show a branded success/error page (pi-ai already provides `oauthSuccessHtml`/`oauthErrorHtml`). Better than a blank page or raw text. | LOW | pi-ai's `oauth-page.js` module provides HTML templates. Already used by the callback servers. Just ensure the callback port is accessible and the HTML renders correctly. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems in this specific context.

| # | Anti-Feature | Why Requested | Why Problematic | Alternative |
|---|--------------|---------------|-----------------|-------------|
| A1 | **Anthropic OAuth as first-class feature** | Anthropic has the best models; OAuth means no API key needed. | Anthropic explicitly bans third-party OAuth (Feb 2026 policy). Server-side fingerprinting detects non-Claude-Code clients. Account bans are automated and fast. Even personal use has no explicit exception. | **Implement but mark as experimental/risky**. Show clear warning in UI: "Anthropic OAuth may violate ToS. Use API Key for safe access." Implement the code (pi-ai supports it), but default to API Key and make OAuth opt-in with warning. |
| A2 | **Persistent OAuth sessions across restarts** | Users don't want to re-authenticate after server restart. | Project constraint: no database, in-memory only. Adding file persistence for tokens changes the infrastructure model. Also, refresh tokens have limited lifetime. | In-memory storage (current model). User re-authenticates after server restart. For API keys this is already accepted; OAuth is the same. Stretch: write to `~/.pi-chat/auth.json` (like pi-coding-agent does), but this is out of scope for v1.1. |
| A3 | **Browser-side OAuth flow** | Skip the backend, do OAuth directly from React SPA. Simpler architecture. | OAuth PKCE with callback servers requires Node.js `http.createServer`. pi-ai's OAuth modules explicitly throw "only available in Node.js environments" in browsers. The callback redirect URI is `http://localhost:{port}` which means the backend must listen. | Backend-initiated OAuth is the only viable path. Frontend triggers, backend orchestrates, frontend polls/waits for result. |
| A4 | **Token revocation on disconnect** | Security best practice: revoke tokens at the provider when user disconnects. | Neither Anthropic nor OpenAI expose public token revocation endpoints for these OAuth flows. Tokens expire naturally (Anthropic ~60 min, OpenAI varies). Local-only app with single user -- no security benefit from revocation. | Simply clear tokens from in-memory store. Let them expire naturally at the provider. |
| A5 | **OAuth as the default/recommended auth method** | OAuth is "easier" -- no need to find/copy API keys. | For Anthropic: violates ToS. For OpenAI: subscription-based billing (rate-limited by plan) vs API key usage-based billing -- different cost models that user should consciously choose. | Default to API Key. Show OAuth as an alternative with clear labeling of billing differences. |
| A6 | **Storing OAuth tokens in browser cookies/localStorage** | Persistence across page refreshes without server roundtrip. | Security violation: tokens are sensitive credentials. Project constraint says "API keys nao podem ser expostas no frontend." OAuth tokens are equally sensitive. | Tokens stay server-side only. Frontend knows `{ status: "connected", authMethod: "oauth" }` but never sees the actual tokens. |

---

## Feature Dependencies

```
O3 (Auth method selector)
    |
    +--[API Key path]--> Existing API Key flow (already built)
    |
    +--[OAuth path]----> O2 (Browser popup for consent)
                              |
                              +--> O4 (Server-side token storage)
                              |        |
                              |        +--> O5 (Token-to-apikey conversion)
                              |        |        |
                              |        |        +--> Existing chat/streaming (no changes)
                              |        |
                              |        +--> O6 (Automatic token refresh)
                              |                 |
                              |                 +--> D3 (Proactive expiry warning)
                              |
                              +--> O7 (OAuth failure handling)
                              |
                              +--> D4 (OAuth callback status page)

O1 (OAuth login button) -----> O2 (triggers the flow)

O8 (Connection status) depends on O4 (needs to know auth method)
O9 (Disconnect) depends on O4 (needs to clear the right credential type)

D1 (Dual-provider auth) depends on O4 + existing API Key flow
D2 (Mixed auth methods) depends on O3 + O4

A1 (Anthropic OAuth) ~~conflicts with~~ ToS compliance
    --> Implement with prominent warning, not as default
```

### Dependency Notes

- **O2 requires backend callback server**: pi-ai OAuth modules use `node:http` to create local callback servers (port 53692 for Anthropic, port 1455 for OpenAI). The backend must start these servers, not the frontend.
- **O5 is near-zero effort**: pi-ai's `getApiKey(credentials)` simply returns `credentials.access`. The existing `getCredentials()` function can return this string, and all downstream code (chat routes, streaming) works unchanged.
- **O6 is critical for session stability**: Without token refresh, OAuth sessions die after ~60 minutes (Anthropic) or a few hours (OpenAI). This is not optional for a usable experience.
- **D1 enables the existing agent switcher**: v1.0's agent switcher already checks for provider credentials. If both providers are authenticated (one via OAuth, one via API key), switching works seamlessly.

---

## Provider-Specific Differences

| Aspect | Anthropic | OpenAI (Codex) |
|--------|-----------|----------------|
| **Third-party OAuth policy** | BANNED since Jan 2026. ToS violation. Active enforcement with account bans. | PERMITTED. Explicitly supports third-party tools. Official partnerships with OpenCode, RooCode. |
| **Auth URL** | `https://claude.ai/oauth/authorize` | `https://auth.openai.com/oauth/authorize` |
| **Token URL** | `https://platform.claude.com/v1/oauth/token` | `https://auth.openai.com/oauth/token` |
| **Callback port** | 53692 (`http://localhost:53692/callback`) | 1455 (`http://localhost:1455/auth/callback`) |
| **Client ID** | Hardcoded in pi-ai (base64 encoded) | `app_EMoamEEZ73f0CkXaXp7hrann` |
| **Scopes** | `org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload` | `openid profile email offline_access` |
| **PKCE** | Yes (S256) | Yes (S256) |
| **Access token lifetime** | ~60 minutes | Short-lived (varies) |
| **Refresh mechanism** | `refreshAnthropicToken(refreshToken)` | `refreshOpenAICodexToken(refreshToken)` |
| **Token prefix** | `sk-ant-oat01-*` | JWT (decodable, contains `chatgpt_account_id`) |
| **Extra credential data** | None | `accountId` extracted from JWT |
| **Billing model** | Subscription (Pro $20/Max $200/month) with rate limits | Subscription (Plus/Pro/Team) with rate limits |
| **pi-ai provider ID** | `"anthropic"` | `"openai-codex"` |
| **Risk level** | HIGH (account ban risk) | LOW (explicitly permitted) |

---

## MVP Definition

### Launch With (v1.1 Core)

Minimum features to validate OAuth coexistence with API Key auth.

- [ ] **O3 (Auth method selector)** -- Users must choose between OAuth and API Key per provider
- [ ] **O1 (OAuth login button)** -- Clear CTA to initiate OAuth flow
- [ ] **O2 (Browser popup for consent)** -- Backend-orchestrated OAuth with popup window
- [ ] **O4 (Server-side token storage)** -- Extend credential store for OAuth tokens
- [ ] **O5 (Token-to-apikey conversion)** -- Transparent credential passthrough to existing streaming
- [ ] **O6 (Automatic token refresh)** -- Silent background refresh before expiry
- [ ] **O7 (OAuth failure handling)** -- Graceful errors for all failure modes
- [ ] **O8 (Connection status indicator)** -- Show auth method in connected state
- [ ] **O9 (Disconnect)** -- Clean logout clearing OAuth credentials

### Add After Core Works (v1.1 Polish)

- [ ] **D1 (Dual-provider auth)** -- Authenticate both providers with different methods simultaneously
- [ ] **D2 (Mixed auth methods)** -- Per-provider auth method independence
- [ ] **D3 (Proactive expiry warning)** -- Toast notification before token expires
- [ ] **D4 (OAuth callback page)** -- Branded success/error pages in callback browser tab

### Explicit Deferral (v2+)

- [ ] **Persistent OAuth sessions** -- Requires file-based credential storage, out of scope
- [ ] **Token revocation** -- No provider endpoints available, tokens expire naturally
- [ ] **Browser-side OAuth** -- pi-ai OAuth requires Node.js, not viable in browser

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Risk | Priority |
|---------|------------|---------------------|------|----------|
| O3 Auth method selector | HIGH | LOW | LOW | P1 |
| O1 OAuth login button | HIGH | LOW | LOW | P1 |
| O2 Browser popup flow | HIGH | MEDIUM | MEDIUM | P1 |
| O4 Token storage | HIGH | LOW | LOW | P1 |
| O5 Token-to-apikey | HIGH | LOW | LOW | P1 |
| O6 Token refresh | HIGH | MEDIUM | MEDIUM | P1 |
| O7 Failure handling | HIGH | MEDIUM | LOW | P1 |
| O8 Connection status | MEDIUM | LOW | LOW | P1 |
| O9 Disconnect | MEDIUM | LOW | LOW | P1 |
| D1 Dual-provider auth | MEDIUM | MEDIUM | LOW | P2 |
| D2 Mixed auth methods | LOW | LOW | LOW | P2 |
| D3 Expiry warning | LOW | LOW | LOW | P3 |
| D4 Callback page | LOW | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for v1.1 launch -- core OAuth functionality
- P2: Should have -- enhances multi-provider experience
- P3: Nice to have -- polish features

---

## Existing Code Impact Analysis

### Files That Need Changes

| File | Change Type | Scope |
|------|-------------|-------|
| `src/server/lib/credentials.ts` | MODIFY | Extend Map to store `{ type, key }` or `{ type, credentials }` discriminated union |
| `src/server/routes/auth.ts` | MODIFY | Add OAuth initiation endpoint, callback handling, token refresh endpoint |
| `src/client/hooks/use-auth.ts` | MODIFY | Add `connectOAuth()` method, `authMethod` state |
| `src/client/lib/types.ts` | MODIFY | Add `AuthMethod`, extend `AuthState` with `authMethod` field |
| `src/client/lib/api.ts` | MODIFY | Add `initiateOAuth()`, `pollOAuthStatus()` API calls |
| `src/client/components/connection/connection-page.tsx` | MODIFY | Add auth method selector, OAuth button, popup handling |

### Files That Should NOT Change

| File | Why |
|------|-----|
| `src/server/routes/chat.ts` | OAuth tokens are converted to API key strings transparently. Chat streaming code is auth-agnostic. |
| `src/server/routes/models.ts` | Model fetching uses `getCredentials()` which returns a string regardless of auth method. |
| `src/client/hooks/use-agent.ts` | Agent management is auth-agnostic. |
| `src/client/components/chat/*` | All chat UI components are auth-agnostic. |

### New Files Needed

| File | Purpose |
|------|---------|
| `src/server/routes/oauth.ts` | OAuth-specific routes: initiate, callback, refresh, status |
| `src/server/lib/oauth-manager.ts` | OAuth session management: pending flows, token refresh scheduling |

---

## Competitor Feature Analysis

| Feature | Claude.ai | ChatGPT | OpenClaw | This Project |
|---------|-----------|---------|----------|-------------|
| OAuth login | Yes (first-party only) | Yes (first-party only) | Both providers via OAuth | OpenAI OAuth + Anthropic API Key (safe default) |
| API Key auth | Via Console separately | Via Platform separately | Yes | Yes (existing) |
| OAuth + API Key coexistence | N/A | N/A | Yes | Yes (v1.1 goal) |
| Token refresh | Automatic | Automatic | Automatic | Automatic via pi-ai |
| Multi-provider auth | N/A (Anthropic only) | N/A (OpenAI only) | Yes | Yes (existing agent switcher) |
| Auth method indicator | Implicit | Implicit | Shown | Explicit badge |

---

## Sources

### Official / Authoritative
- [Anthropic Claude Code Authentication Docs](https://code.claude.com/docs/en/authentication) -- HIGH confidence
- [OpenAI Codex Authentication Docs](https://developers.openai.com/codex/auth) -- HIGH confidence
- [OpenAI Codex Auth: CI/CD Token Management](https://developers.openai.com/codex/auth/ci-cd-auth) -- HIGH confidence
- [pi-ai OAuth module source code](node_modules/@mariozechner/pi-ai/dist/utils/oauth/) -- HIGH confidence (direct code analysis)

### Policy / Legal
- [Anthropic Bans Claude Subscription OAuth in Third-Party Apps](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/) -- HIGH confidence
- [Anthropic Clarifies Ban on Third-Party Tool Access to Claude](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access) -- HIGH confidence
- [Anthropic Halts Third-Party OAuth Access](https://opentools.ai/news/anthropic-halts-third-party-oauth-access-across-claude-subscriptions) -- HIGH confidence
- [Hacker News Discussion: Anthropic OAuth Ban](https://news.ycombinator.com/item?id=47069299) -- MEDIUM confidence (community)

### Technical Reference
- [OpenAI Codex Authentication Modes (DeepWiki)](https://deepwiki.com/openai/codex/4.5.5-authentication-modes-and-account-management) -- MEDIUM confidence
- [OpenCode Codex Auth Plugin](https://github.com/numman-ali/opencode-openai-codex-auth) -- MEDIUM confidence (reference implementation)
- [pi-mono GitHub Repository](https://github.com/badlogic/pi-mono) -- HIGH confidence

---
*Feature research for: OAuth Authentication (v1.1 Milestone)*
*Researched: 2026-04-04*
