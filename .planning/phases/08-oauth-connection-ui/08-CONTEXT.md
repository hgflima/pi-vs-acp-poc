# Phase 8: OAuth Connection UI - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the connection page to support both OAuth and API Key authentication per provider. Users choose their auth method via tabs, initiate OAuth via popup window with polling status, and see visual indicators of connection health (connected, expiring, expired). All backend OAuth infrastructure (Phases 5-7) is complete — this phase is purely frontend.

</domain>

<decisions>
## Implementation Decisions

### Auth method selector
- **D-01:** Tabs within the existing Card — two tabs ("OAuth" / "API Key") below the provider SegmentedControl. OAuth tab shows login button, API Key tab shows the existing input field. Reuses the existing Card component layout.
- **D-02:** OAuth tab is the default selection when opening the connection page. Aligns with Phase 5 D-01 (OAuth preferred when both exist).
- **D-03:** OAuth button labels use product names — "Login with Claude" for Anthropic, "Login with Codex" for OpenAI.

### OAuth flow UX
- **D-04:** OAuth consent opens in a `window.open` popup. The connection page stays visible showing a waiting state while the user completes consent in the popup.
- **D-05:** While waiting for OAuth completion, the login button shows a spinner with "Waiting for authorization..." text and a "Cancel" link below. Frontend polls `GET /api/auth/oauth/status` every 2 seconds. When status changes to done or error, the UI updates automatically (SC#3).
- **D-06:** Cancel aborts the polling and resets to the initial OAuth tab state. The orphaned backend session is left to expire naturally (consistent with Phase 6 D-03/D-04).

### Token status display
- **D-07:** Small badge next to connection status — `[OAuth]` or `[API Key]` displayed as a colored badge. Satisfies SC#4 requirement for showing which auth method is active.
- **D-08:** Token health uses green/yellow/red color coding: green = connected healthy, yellow = expiring soon (<30 min to expiry), red = expired. Badge color changes automatically based on `oauthExpiry` from `GET /auth/status`.
- **D-09:** No countdown or expiry time displayed. Only the color-coded badge indicates health. Token expiry information stays internal to the polling logic.
- **D-10:** API Key connections always show green badge — no expiry concept for API Keys.

### Connected state
- **D-11:** When already connected, the connection page shows a summary view: status badge with auth method, "Go to Chat" button, and "Disconnect" button. No automatic redirect — user controls navigation.
- **D-12:** User can switch auth method while connected. Clicking the other tab and authenticating replaces the current credential. No need to disconnect first. Phase 5 D-01 (OAuth preferred) applies when both exist.
- **D-13:** When OAuth token expires and auto-refresh fails: red badge "Expired" shown on connection page with "Re-authenticate" button. Chat page shows inline error if user tries to send a message. Aligns with Phase 5 D-02 (no silent fallback to API Key).

### Claude's Discretion
- Tab component implementation (reuse SegmentedControl, shadcn Tabs, or custom)
- Exact badge component styling (shadcn Badge component available)
- Polling start/stop lifecycle details
- Popup window dimensions and positioning
- How `refreshStatus` integrates with the 30-min expiry threshold check
- Disconnect API call (clear credentials on backend via existing or new endpoint)
- Error states for popup blocked by browser

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Connection page (the component being refactored)
- `src/client/components/connection/connection-page.tsx` — Current API-Key-only connection page; refactor target
- `src/client/components/connection/segmented-control.tsx` — Provider selector; stays as-is, auth method tabs go below it

### Auth hooks and API
- `src/client/hooks/use-auth.ts` — `useAuth` hook with per-provider state, `connect`, `disconnect`, `refreshStatus`; needs OAuth flow additions
- `src/client/lib/api.ts` — `connectProvider` (API Key), `fetchAuthStatus` (polling); needs OAuth start/status API functions
- `src/client/lib/types.ts` — `ProviderAuthState` (has `authMethod`, `oauthExpiry`), `AuthMethod`, `AuthStatus`

### Backend OAuth routes (already complete — frontend consumes these)
- `src/server/routes/oauth.ts` — `POST /start` (returns `authUrl`), `GET /status` (returns session state), `POST /debug/force-expire`
- `src/server/routes/auth.ts` — `GET /status` (returns `hasApiKey`, `hasOAuth`, `activeMethod`, `oauthExpiry`)

### UI primitives
- `src/client/components/ui/badge.tsx` — shadcn Badge component for auth method badges
- `src/client/components/ui/button.tsx` — Button with loading states (Loader2 icon pattern already used)
- `src/client/components/ui/card.tsx` — Card/CardHeader/CardContent for layout

### Prior phase decisions
- `.planning/phases/05-credential-infrastructure/05-CONTEXT.md` — D-01 (OAuth preferred), D-02 (no silent fallback), D-05 (authMethod on state), D-06 (per-provider state), D-08 (status endpoint)
- `.planning/phases/07-openai-oauth-flow/07-CONTEXT.md` — D-01 (Provider type stays "anthropic" | "openai"), D-02 (models per active credential)

### Requirements
- `.planning/REQUIREMENTS.md` — UI-01 (auth method selector), UI-02 (OAuth button + polling), UI-03 (token status indicators)
- `.planning/ROADMAP.md` §Phase 8 — Goal, SC#1-SC#4

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SegmentedControl` component — already handles provider selection; same visual pattern can inform auth method tabs
- `useAuth` hook — per-provider state with `authMethod` and `oauthExpiry` already in the type; `refreshStatus` polls `GET /auth/status`
- `fetchAuthStatus` in `api.ts` — returns `AuthStatusResponse` with `hasApiKey`, `hasOAuth`, `activeMethod`, `oauthExpiry`
- shadcn `Badge` component — available for auth method badges
- `Loader2` icon + Button disabled pattern — already used for API Key connecting state

### Established Patterns
- Provider type: `"anthropic" | "openai"` — consistent across all layers
- Per-provider state via `Map<Provider, ProviderAuthState>` — already in use-auth.ts
- JSON envelope: `{ status: "ok" | "error" | "started" | "pending" | "none", ... }` — consistent across backend routes
- In-memory only — no persistence needed for frontend state
- Auto-redirect after connect — currently 1.5s delay with `useEffect`; D-11 replaces this with manual navigation

### Integration Points
- `connection-page.tsx` — main refactor target; currently handles API Key only
- `use-auth.ts` — needs new `startOAuth(provider)` and `pollOAuthStatus(provider)` functions
- `api.ts` — needs `startOAuth(provider)` and `fetchOAuthStatus(provider)` API calls
- OAuth routes already mounted at `/api/auth/oauth/*` — no backend changes needed

</code_context>

<specifics>
## Specific Ideas

- Button labels use product names ("Login with Claude" / "Login with Codex") because the user associates with the product, not the company
- No countdown timer — the user only needs to know if the connection is healthy, expiring, or expired; exact minutes are noise
- Connected state shows actions rather than auto-redirecting — gives the user control to manage connections or switch methods

</specifics>

<deferred>
## Deferred Ideas

- OAuth logout/revoke per provider — OAUTH-05 in future requirements
- Branded callback page in popup — OAUTH-06 in future requirements
- DELETE /oauth/cancel endpoint — carried from Phase 6 D-04; Cancel in UI just stops polling
- Popup-blocked detection and fallback UX — Claude's discretion for basic handling; advanced fallback deferred

</deferred>

---

*Phase: 08-oauth-connection-ui*
*Context gathered: 2026-04-06*
