# Roadmap: Pi AI Chat Web

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-04-04)
- 🚧 **v1.1 OAuth Authentication** — Phases 5-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-04-04</summary>

- [x] Phase 1: Foundation + Connection (5/5 plans) — completed 2026-04-03
- [x] Phase 2: Streaming Chat (4/4 plans) — completed 2026-04-03
- [x] Phase 3: Tool Visualization (4/4 plans) — completed 2026-04-03
- [x] Phase 4: Configuration (5/5 plans) — completed 2026-04-04

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v1.1 OAuth Authentication (In Progress)

**Milestone Goal:** Add OAuth authentication as an alternative to API Key for OpenAI Codex, with full coexistence of both auth methods and updated connection UI.

- [x] **Phase 5: Credential Infrastructure** - Refactor credential store for compound credentials (OAuth + API Key coexistence) and async token resolution (completed 2026-04-04)
- [ ] **Phase 6: Anthropic OAuth Flow** - Backend OAuth routes for Anthropic with PKCE via pi-ai loginAnthropic, token storage, and credential resolution
- [x] **Phase 7: OpenAI OAuth Flow** - Backend OAuth routes for OpenAI Codex with PKCE, token storage, and automatic refresh (completed 2026-04-06)
- [ ] **Phase 8: OAuth Connection UI** - Auth method selector, OAuth login button with popup flow, and token status indicators

## Phase Details

### Phase 5: Credential Infrastructure
**Goal**: Existing API Key auth continues working while the credential system gains the ability to store and resolve compound OAuth credentials per provider
**Depends on**: Phase 4 (v1.0 complete)
**Requirements**: CRED-01, CRED-02, OAUTH-04
**Success Criteria** (what must be TRUE):
  1. User can still connect with API Key for both Anthropic and OpenAI exactly as in v1.0 (zero regression)
  2. Credential store accepts both API Key (string) and OAuth credentials (access token, refresh token, expiry) per provider without collision
  3. Agent factory resolves credentials via async getApiKey that transparently returns the active credential (API Key or OAuth access token) for the current provider
  4. Credential store supports both Anthropic and OpenAI providers with either auth method
**Plans**: 3 plans
  - [x] 05-01-PLAN.md — Refactor credential store to compound API Key + OAuth per provider; add GET /auth/status route
  - [x] 05-02-PLAN.md — Async getApiKey resolver in agent factory with per-provider refresh mutex
  - [x] 05-03-PLAN.md — Per-provider frontend auth state (ProviderAuthState, refactored useAuth, connection page)

### Phase 6: Anthropic OAuth Flow
**Goal**: User can authenticate with Anthropic via OAuth PKCE and use the resulting token for chat
**Depends on**: Phase 5
**Requirements**: OAUTH-01
**Success Criteria** (what must be TRUE):
  1. Backend endpoint initiates Anthropic OAuth PKCE flow via pi-ai loginAnthropic and returns the auth URL to the frontend
  2. After user completes OAuth consent, backend stores the OAuth credentials and a status polling endpoint reports success
  3. User can send chat messages using the Anthropic OAuth token (verified with real API call)
  4. If port 53692 is occupied, the user gets a clear error message explaining the conflict
**Plans**: 2 plans
  - [x] 06-01-PLAN.md — Implement Anthropic OAuth routes (POST /start, GET /status) with per-provider PendingSession Map and port 53692 pre-check; mount at /api/auth/oauth
  - [x] 06-02-PLAN.md — Manual UAT validation via curl (SC#1-SC#4) per D-05; scaffold 06-UAT.md and run end-to-end verification

### Phase 7: OpenAI OAuth Flow
**Goal**: User can authenticate with OpenAI Codex via OAuth PKCE and use the resulting token for chat, with automatic refresh before expiry
**Depends on**: Phase 5
**Requirements**: OAUTH-02, OAUTH-03
**Success Criteria** (what must be TRUE):
  1. Backend endpoint initiates OpenAI OAuth PKCE flow via pi-ai and returns the auth URL to the frontend
  2. After user completes OAuth consent, backend stores the OAuth credentials and a status polling endpoint reports success
  3. User can send chat messages using the OAuth token (the token actually works for API calls, not just token acquisition)
  4. When the OAuth token approaches expiry, it is refreshed automatically without user intervention or chat interruption
  5. If port 1455 is occupied (e.g., by Codex CLI), the user gets a clear error message explaining the conflict
**Plans**: 4 plans (includes Phase 7.1 gap closure) — COMPLETE
  - [x] 07-01-provider-remap-PLAN.md — Add resolvePiProvider + forceExpireOAuth helpers, wire remap into getModel (setup.ts) and getModels (models.ts)
  - [x] 07-02-oauth-routes-PLAN.md — Extend POST /start to dispatch loginOpenAICodex with port 1455 pre-check; add POST /debug/force-expire endpoint
  - [x] 07-03-uat-PLAN.md — Scaffold 07-UAT.md and run end-to-end curl validation (SC#1-SC#5) including auto-refresh via force-expire
  - [x] 07-04-stream-adapter-gap-closure-PLAN.md — Diagnose + fix adaptAgentEvents silent fall-through for openai-codex streams; re-verify SC#3 and SC#4 (closes UAT FAIL gap)

### Phase 07.1: solucao do problema encontrado e documentado na fase 7 (INSERTED)

**Goal:** Close SC#3 and SC#4 for Phase 7 (OAUTH-02/OAUTH-03) via D-03 error-surfacing + D-02 diagnostic-gated fix
**Requirements**: OAUTH-02, OAUTH-03
**Depends on:** Phase 7
**Plans:** 2/2 plans executed — COMPLETE

Plans:
- [x] 07.1-01-error-surfacing-PLAN.md — Add case "message_end" to stream-adapter.ts (D-03), re-run SC#3 curl, capture upstream errorMessage in diagnostic log
- [x] 07.1-02-fix-and-reverify-PLAN.md — Triage diagnostic -> apply D-02 Branch A fix (toStoreProvider in setup.ts) -> re-verify SC#3+SC#4 PASS -> propagate closure across UAT/VERIFICATION/REQUIREMENTS/ROADMAP

### Phase 8: OAuth Connection UI
**Goal**: Connection page lets the user choose between OAuth and API Key per provider, with visual feedback throughout the OAuth flow and token lifecycle
**Depends on**: Phase 7
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. Connection page shows an auth method selector (OAuth vs API Key) for both Anthropic and OpenAI
  2. Clicking the OAuth button opens the provider consent page in a new browser window and shows a "waiting for authorization" state
  3. After OAuth completes (or fails), the connection page updates automatically without manual refresh
  4. Connected state shows which auth method is active (API Key badge vs OAuth badge) and token health (connected, expiring soon, expired) for both providers
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** Phases execute in numeric order: 5 -> 6 -> 7 -> 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation + Connection | v1.0 | 5/5 | Complete | 2026-04-03 |
| 2. Streaming Chat | v1.0 | 4/4 | Complete | 2026-04-03 |
| 3. Tool Visualization | v1.0 | 4/4 | Complete | 2026-04-03 |
| 4. Configuration | v1.0 | 5/5 | Complete | 2026-04-04 |
| 5. Credential Infrastructure | v1.1 | 3/3 | Complete   | 2026-04-04 |
| 6. Anthropic OAuth Flow | v1.1 | 0/2 | Not started | - |
| 7. OpenAI OAuth Flow | v1.1 | 4/4 | Complete | 2026-04-06 |
| 7.1. Solucao do Problema (Phase 7 Gap Closure) | v1.1 | 2/2 | Complete | 2026-04-06 |
| 8. OAuth Connection UI | v1.1 | 0/0 | Not started | - |
