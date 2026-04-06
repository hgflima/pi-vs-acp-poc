# Phase 8: OAuth Connection UI - Research

**Researched:** 2026-04-06
**Domain:** React frontend -- UI refactoring, OAuth flow integration, polling, visual state management
**Confidence:** HIGH

## Summary

Phase 8 is a purely frontend refactoring of the existing `connection-page.tsx` to support both OAuth and API Key authentication per provider. The backend infrastructure (Phases 5-7) is complete -- all OAuth routes (`POST /start`, `GET /status`), credential store (`clearByType`, `getAuthStatus`), and auth status endpoint (`GET /auth/status` with `hasApiKey`, `hasOAuth`, `activeMethod`, `oauthExpiry`) are already implemented and tested.

The work divides into three layers: (1) adding the shadcn Tabs component and restructuring the connection page layout, (2) implementing OAuth flow logic in the frontend (`startOAuth` API call, `window.open` popup, polling loop), and (3) building the connected-state summary view with token health badges. One backend gap exists: there is no HTTP endpoint for "disconnect" -- the `clearByType` function exists in `credentials.ts` but no route exposes it.

**Primary recommendation:** Refactor connection-page.tsx incrementally -- first add tabs + layout restructuring (pure visual), then OAuth flow + polling logic, then connected/disconnected state views with badges. The shadcn Tabs component (base-ui variant) must be installed via `node_modules/.bin/shadcn add tabs -y`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tabs within the existing Card -- two tabs ("OAuth" / "API Key") below the provider SegmentedControl. OAuth tab shows login button, API Key tab shows the existing input field. Reuses the existing Card component layout.
- **D-02:** OAuth tab is the default selection when opening the connection page. Aligns with Phase 5 D-01 (OAuth preferred when both exist).
- **D-03:** OAuth button labels use product names -- "Login with Claude" for Anthropic, "Login with Codex" for OpenAI.
- **D-04:** OAuth consent opens in a `window.open` popup. The connection page stays visible showing a waiting state while the user completes consent in the popup.
- **D-05:** While waiting for OAuth completion, the login button shows a spinner with "Waiting for authorization..." text and a "Cancel authorization" link below. Frontend polls `GET /api/auth/oauth/status` every 2 seconds. When status changes to done or error, the UI updates automatically (SC#3).
- **D-06:** Cancel aborts the polling and resets to the initial OAuth tab state. The orphaned backend session is left to expire naturally (consistent with Phase 6 D-03/D-04).
- **D-07:** Small badge next to connection status -- `[OAuth]` or `[API Key]` displayed as a colored badge. Satisfies SC#4 requirement for showing which auth method is active.
- **D-08:** Token health uses green/yellow/red color coding: green = connected healthy, yellow = expiring soon (<30 min to expiry), red = expired. Badge color changes automatically based on `oauthExpiry` from `GET /auth/status`.
- **D-09:** No countdown or expiry time displayed. Only the color-coded badge indicates health.
- **D-10:** API Key connections always show green badge -- no expiry concept for API Keys.
- **D-11:** When already connected, the connection page shows a summary view: status badge with auth method, "Go to Chat" button, and "Disconnect" button. No automatic redirect -- user controls navigation.
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

### Deferred Ideas (OUT OF SCOPE)
- OAuth logout/revoke per provider -- OAUTH-05 in future requirements
- Branded callback page in popup -- OAUTH-06 in future requirements
- DELETE /oauth/cancel endpoint -- carried from Phase 6 D-04; Cancel in UI just stops polling
- Popup-blocked detection and fallback UX -- Claude's discretion for basic handling; advanced fallback deferred
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Tela de conexao mostra selector de metodo de auth (OAuth vs API Key) por provider | shadcn Tabs component (base-ui variant) installed via CLI; API is Tabs/TabsList/TabsTrigger/TabsContent with value-based selection. Existing Card/SegmentedControl layout preserved. |
| UI-02 | Botao OAuth abre browser para flow e faz polling de status ate completar | Backend `POST /api/auth/oauth/start` returns `{ status: "started", authUrl }`. `GET /api/auth/oauth/status?provider=X` returns `pending`/`ok`/`error`. `window.open` for popup. `setInterval` for 2s polling. |
| UI-03 | Indicador visual de status do token (connected, expiring, expired) | `oauthExpiry` field from `GET /api/auth/status` compared to `Date.now()` + 30min threshold. shadcn Badge with semantic Tailwind colors (green/yellow/red). |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.0 | UI framework | Project standard |
| shadcn/ui (base-nova) | CLI 4.1.2 | Component primitives | Project standard, base-ui foundation |
| @base-ui/react | 1.3.0 | Underlying primitive library | Required by shadcn base-nova components |
| lucide-react | ^1.7.0 | Icons | Project standard |
| class-variance-authority | ^0.7.1 | Component variants | Used by shadcn Badge, Tabs |
| tailwind-merge + clsx | ^3.5.0 / ^2.1.1 | `cn()` utility | Project standard |

### New (must install)
| Library | Version | Purpose | How to Install |
|---------|---------|---------|--------------|
| shadcn Tabs | N/A (generated) | Auth method selector | `node_modules/.bin/shadcn add tabs -y` |

### No New npm Dependencies
The Tabs component is generated code (base-ui + cva), not a new npm package. All runtime dependencies (`@base-ui/react`, `cva`) are already installed. The `shadcn add` command only creates `src/client/components/ui/tabs.tsx`.

## Architecture Patterns

### Component Structure (after refactor)

```
src/client/
├── components/
│   ├── connection/
│   │   ├── connection-page.tsx     # REFACTOR: orchestrates layout + state
│   │   ├── segmented-control.tsx   # UNCHANGED: provider selector
│   │   ├── oauth-tab.tsx           # NEW: OAuth login button + polling UI
│   │   ├── api-key-tab.tsx         # NEW: extracted from current connection-page
│   │   └── connected-summary.tsx   # NEW: connected state with badges + actions
│   └── ui/
│       ├── tabs.tsx                # NEW: shadcn Tabs (generated)
│       └── badge.tsx               # EXISTING: auth method + health badges
├── hooks/
│   └── use-auth.ts                 # EXTEND: add startOAuth, pollOAuthStatus
└── lib/
    ├── api.ts                      # EXTEND: add startOAuth, fetchOAuthStatus API calls
    └── types.ts                    # MINOR: may need AuthStatus extension if needed
```

### Pattern 1: shadcn Tabs with Controlled State

**What:** Use the shadcn Tabs component (built on `@base-ui/react/tabs`) with controlled `value` prop for the auth method selector.

**When to use:** When the active tab must be programmatically set (D-02: OAuth default, D-12: switch while connected).

**Example:**
```typescript
// Source: shadcn add tabs --view (verified locally)
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/client/components/ui/tabs"

// Controlled tabs -- value driven by state
<Tabs value={authMethod} onValueChange={setAuthMethod}>
  <TabsList className="w-full">
    <TabsTrigger value="oauth" disabled={isPolling}>OAuth</TabsTrigger>
    <TabsTrigger value="apiKey" disabled={isPolling}>API Key</TabsTrigger>
  </TabsList>
  <TabsContent value="oauth">
    {/* OAuth login button or polling state */}
  </TabsContent>
  <TabsContent value="apiKey">
    {/* API Key input form */}
  </TabsContent>
</Tabs>
```

**Note on base-ui Tabs API:** The base-ui `TabsPrimitive.Root` uses `value` (controlled) or `defaultValue` (uncontrolled). The `onValueChange` callback provides the new value. The shadcn wrapper passes props through to the primitive. Verified from the `--view` output: `TabsPrimitive.Root.Props` is the prop type.

### Pattern 2: OAuth Popup + Polling Loop

**What:** Open provider consent page in a popup window, then poll the backend `/api/auth/oauth/status` endpoint every 2 seconds until completion or cancellation.

**When to use:** When user clicks "Login with Claude" or "Login with Codex".

**Example:**
```typescript
// Step 1: Start OAuth flow
const res = await startOAuth(provider)
// res = { status: "started", provider, authUrl }

// Step 2: Open popup
const popup = window.open(res.authUrl, '_blank', 'width=600,height=700,popup=yes')
if (!popup) {
  // Popup blocked -- show inline error
  setError("Pop-up blocked. Please allow pop-ups for this site and try again.")
  return
}

// Step 3: Poll for completion
const intervalId = setInterval(async () => {
  const status = await fetchOAuthStatus(provider)
  if (status.status === "ok") {
    clearInterval(intervalId)
    await refreshStatus(provider) // Update auth state from /auth/status
  } else if (status.status === "error") {
    clearInterval(intervalId)
    setError(status.message)
  }
  // "pending" or "none" -- keep polling
}, 2000)
```

### Pattern 3: Token Health Calculation

**What:** Derive token health state from `oauthExpiry` timestamp.

**When to use:** Every time auth state updates (after `refreshStatus` or periodic check).

**Example:**
```typescript
type TokenHealth = "healthy" | "expiring" | "expired"

function getTokenHealth(authState: ProviderAuthState): TokenHealth {
  if (authState.authMethod !== "oauth") return "healthy" // D-10: API Keys always green
  if (!authState.oauthExpiry) return "healthy"
  
  const now = Date.now()
  const expiresAt = authState.oauthExpiry
  const thirtyMinMs = 30 * 60 * 1000
  
  if (expiresAt <= now) return "expired"
  if (expiresAt - now <= thirtyMinMs) return "expiring"
  return "healthy"
}
```

### Pattern 4: Disconnect via Backend API

**What:** Clear credentials on the backend by calling a disconnect endpoint.

**Gap identified:** No HTTP route currently exposes `clearByType(provider, type)` from `credentials.ts`. A new route must be added.

**Recommended approach:** Add a `POST /api/auth/disconnect` endpoint to `auth.ts` that calls `clearByType`:
```typescript
// New endpoint in src/server/routes/auth.ts
authRoutes.post("/disconnect", async (c) => {
  const { provider } = await c.req.json<{ provider: Provider }>()
  // Clear all credentials for this provider (both apiKey and oauth)
  clearByType(provider, "apiKey")
  clearByType(provider, "oauth")
  return c.json({ status: "ok", provider })
})
```

**Frontend:** Add `disconnectProvider(provider)` to `api.ts`, then call it from `useAuth.disconnect()` before resetting local state.

### Anti-Patterns to Avoid
- **Shared state without context:** `useAuth()` is a standalone hook (NOT a context provider). Each component that calls it gets independent state. The connection page is currently the sole consumer, so this is fine for Phase 8. Do NOT create a second `useAuth()` call in another component expecting shared state.
- **Uncontrolled polling cleanup:** Always clear the interval on unmount and on cancel. Use `useEffect` cleanup or `useRef` for interval IDs.
- **Auto-redirect on connect:** The current code has `useEffect` that auto-redirects to `/chat` after 1.5s. D-11 explicitly replaces this with manual "Go to Chat" navigation. Remove the auto-redirect.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab selection UI | Custom div-based tabs | shadcn Tabs (base-ui) | ARIA roles, keyboard nav, focus management built-in |
| Badge variants | Custom styled spans | shadcn Badge + Tailwind semantic colors | Consistent with design system, already in project |
| Button loading states | Custom spinner logic | Existing Button + Loader2 pattern | Already established in connection-page.tsx |
| Popup window management | Custom iframe/modal | `window.open()` native API | D-04 specifies popup; native API handles cross-origin consent pages |

## Common Pitfalls

### Pitfall 1: Polling Not Cleaned Up on Unmount
**What goes wrong:** User navigates away from connection page while polling is active. The interval keeps firing, making API calls to a component that no longer exists, potentially causing React state-update-on-unmounted-component warnings.
**Why it happens:** `setInterval` persists beyond component lifecycle.
**How to avoid:** Store interval ID in a `useRef`, clear it in `useEffect` cleanup. Also clear on cancel and on success/error.
**Warning signs:** Console warnings about state updates on unmounted components.

### Pitfall 2: Stale Closure in Polling Callback
**What goes wrong:** The polling callback captures stale state values because `setInterval` uses the closure from when it was created.
**Why it happens:** JavaScript closure semantics -- `setInterval` callback captures variables at creation time.
**How to avoid:** Use `useRef` for mutable values the polling callback needs to read (like whether cancel was requested), or use a fresh `setTimeout` chain instead of `setInterval`.
**Warning signs:** Polling continues after cancel, or state doesn't update correctly.

### Pitfall 3: Popup Blocked by Browser
**What goes wrong:** `window.open()` returns `null` when the browser blocks popups, but the code proceeds to polling state.
**Why it happens:** Modern browsers block popups not triggered by direct user interaction, or if popup blocker is enabled.
**How to avoid:** Check `window.open()` return value immediately. If `null`, show the inline error message ("Pop-up blocked...") and do NOT enter polling state.
**Warning signs:** UI stuck in "Waiting for authorization..." with no popup visible.

### Pitfall 4: OAuth Status Auto-Clear on Read
**What goes wrong:** Backend `GET /api/auth/oauth/status` auto-deletes the session on first read after `done` or `error`. If the frontend reads it twice (e.g., race condition), the second read returns `{ status: "none" }`.
**Why it happens:** Designed behavior in `oauth.ts` line 150-156 -- session is deleted after returning `ok` or `error`.
**How to avoid:** Stop polling immediately on `ok` or `error`. Do not retry the status endpoint after receiving a terminal state. Call `refreshStatus(provider)` (which hits `GET /api/auth/status`, not `/oauth/status`) to update local auth state.
**Warning signs:** After successful OAuth, a second poll returns "none" and the UI flickers between states.

### Pitfall 5: 30-Minute Expiry Threshold Without Periodic Refresh
**What goes wrong:** Token health badge shows "Connected" (green) but the token is actually expiring -- because the frontend only checks `oauthExpiry` when it last fetched status.
**Why it happens:** `oauthExpiry` is a fixed timestamp from the last `refreshStatus` call. Without periodic re-evaluation, the badge color won't update as time passes.
**How to avoid:** Either (a) use a periodic timer (e.g., every 60s) that re-evaluates `getTokenHealth()` from the existing `oauthExpiry`, or (b) periodically call `refreshStatus()` to get a fresh expiry value.
**Warning signs:** Badge stays green past the 30-minute threshold.

### Pitfall 6: base-ui Tabs `onValueChange` vs Radix `onValueChange`
**What goes wrong:** Assuming the Tabs API is identical to the Radix-based version.
**Why it happens:** The project uses base-nova (base-ui) not Radix. The shadcn Tabs wrapper passes through to `TabsPrimitive.Root` from `@base-ui/react/tabs`.
**How to avoid:** The base-ui Tabs Root uses `onValueChange` with signature `(value: any, event: Event) => void`. The shadcn wrapper normalizes this. Use the controlled pattern: `<Tabs value={x} onValueChange={(v) => setX(v)}>`.
**Warning signs:** Unexpected arguments in the change handler callback.

## Code Examples

### Backend API Calls (new in api.ts)

```typescript
// Source: Derived from existing oauth.ts route handlers (verified in codebase)

export async function startOAuth(provider: Provider): Promise<{
  status: "started" | "error"
  provider: Provider
  authUrl?: string
  message?: string
}> {
  const res = await fetch(`${API_BASE}/auth/oauth/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  })
  return res.json()
}

export async function fetchOAuthStatus(provider: Provider): Promise<{
  status: "pending" | "ok" | "error" | "none"
  provider: Provider
  authUrl?: string
  message?: string
}> {
  const res = await fetch(`${API_BASE}/auth/oauth/status?provider=${provider}`)
  return res.json()
}

export async function disconnectProvider(provider: Provider): Promise<{
  status: "ok" | "error"
}> {
  const res = await fetch(`${API_BASE}/auth/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  })
  return res.json()
}
```

### Token Health Badge

```typescript
// Source: UI-SPEC.md badge color contract
import { Badge } from "@/client/components/ui/badge"

const healthConfig = {
  healthy:  { label: "Connected", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  expiring: { label: "Expiring",  className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  expired:  { label: "Expired",   className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
} as const

function TokenHealthBadge({ health }: { health: TokenHealth }) {
  const { label, className } = healthConfig[health]
  return <Badge className={className}>{label}</Badge>
}
```

### Connected Summary Layout

```typescript
// Source: UI-SPEC.md layout contract
<div className="space-y-4">
  <div className="text-center">
    <p className="text-sm font-semibold">
      {health === "expired" ? "Session Expired" : "Connected"}
    </p>
    <div className="flex items-center justify-center gap-2 mt-2">
      <Badge variant="secondary">{authMethod === "oauth" ? "OAuth" : "API Key"}</Badge>
      <TokenHealthBadge health={health} />
    </div>
  </div>
  {health === "expired" ? (
    <Button className="w-full" onClick={handleReAuth}>Re-authenticate</Button>
  ) : (
    <Button className="w-full" onClick={() => navigate("/chat")}>
      Go to Chat <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  )}
  <Button variant="outline" className="w-full text-destructive" onClick={handleDisconnect}>
    <LogOut className="mr-2 h-4 w-4" /> Disconnect
  </Button>
</div>
```

## Key Integration Points

### Backend Routes (already implemented, consumed by frontend)

| Route | Method | Request | Response | Used For |
|-------|--------|---------|----------|----------|
| `/api/auth/oauth/start` | POST | `{ provider }` | `{ status: "started", provider, authUrl }` | Start OAuth flow |
| `/api/auth/oauth/status` | GET | `?provider=X` | `{ status: "pending"/"ok"/"error"/"none", ... }` | Poll OAuth completion |
| `/api/auth/status` | GET | `?provider=X` | `{ hasApiKey, hasOAuth, activeMethod, oauthExpiry }` | Post-OAuth auth state |
| `/api/auth/apikey` | POST | `{ provider, key }` | `{ status: "ok"/"error", message? }` | API Key validation (existing) |
| `/api/auth/disconnect` | POST | `{ provider }` | `{ status: "ok" }` | **NEW -- must be created** |

### Backend Gap: Disconnect Endpoint

The `clearByType(provider, type)` function exists in `credentials.ts` but no HTTP route exposes it. The connection page D-11 "Disconnect" button needs a backend endpoint to clear credentials. This is a small addition (~10 lines) to `auth.ts`.

### Frontend Hook Extensions Needed

| Function | In | Purpose |
|----------|----|---------|
| `startOAuth(provider)` | `use-auth.ts` | Calls `startOAuth` API, opens popup, starts polling |
| `pollOAuthStatus(provider)` | internal to `use-auth.ts` | Polling loop with cleanup |
| `cancelOAuth()` | `use-auth.ts` | Stops polling, resets state |
| `disconnect(provider)` | `use-auth.ts` (EXTEND existing) | Calls backend disconnect endpoint, then resets local state |

### Existing `useAuth` Hook -- Important Limitation

`useAuth()` is a standalone `useState`-based hook, NOT a React Context provider. Each call creates independent state. Currently only `connection-page.tsx` uses it, so this is safe. However, D-13 mentions "Chat page shows inline error if user tries to send a message" when OAuth expires -- this is NOT implemented via `useAuth` but through the existing `useAgent` hook's error handling (the backend returns an error when the expired credential fails). No changes needed to the chat page for D-13.

## State of the Art

| Old Approach (current) | New Approach (Phase 8) | Impact |
|------------------------|------------------------|--------|
| API Key only, auto-redirect on connect | Tabbed auth selector, manual navigation | More control for user |
| No token health display | Green/yellow/red badge system | Visual feedback on OAuth status |
| Single auth flow | OAuth popup + polling alongside API Key | Dual auth method support |
| `useEffect` auto-redirect to `/chat` | "Go to Chat" button | D-11 explicit user action |

## Open Questions

1. **Periodic token health re-evaluation**
   - What we know: `oauthExpiry` is fetched once from `refreshStatus`. The 30-min threshold comparison is a point-in-time check.
   - What's unclear: Whether to use a timer that re-runs `getTokenHealth()` from cached expiry, or periodically re-fetch `refreshStatus`.
   - Recommendation: Use a simple `setTimeout` chain that re-evaluates health from the cached `oauthExpiry` every 60 seconds. This is purely local computation (no API calls) and ensures the badge transitions from green to yellow to red as time passes. A `refreshStatus` call on page mount is sufficient for getting the initial expiry value.

2. **Disconnect scope: clear both credential types or just active?**
   - What we know: `clearByType` clears one type at a time. D-11 says "Disconnect" clears credentials.
   - What's unclear: Whether disconnect should clear only the active method or both.
   - Recommendation: Clear both types for the selected provider. This gives a clean disconnect experience. The user can re-authenticate with either method afterward. This matches the mental model of "disconnecting from a provider."

## Sources

### Primary (HIGH confidence)
- **Codebase audit (direct file reads):**
  - `src/client/components/connection/connection-page.tsx` -- current connection page (106 lines)
  - `src/client/hooks/use-auth.ts` -- auth hook with `connect`, `disconnect`, `refreshStatus` (87 lines)
  - `src/client/lib/api.ts` -- API functions `connectProvider`, `fetchAuthStatus` (57 lines)
  - `src/client/lib/types.ts` -- `ProviderAuthState`, `AuthMethod`, `AuthStatus` types
  - `src/server/routes/oauth.ts` -- OAuth start/status routes (194 lines)
  - `src/server/routes/auth.ts` -- Auth routes with apikey validation and status (86 lines)
  - `src/server/lib/credentials.ts` -- Credential store with `clearByType`, `getAuthStatus` (125 lines)
  - `src/client/components/ui/badge.tsx` -- shadcn Badge component (base-ui + cva)
  - `src/client/components/connection/segmented-control.tsx` -- Provider selector
  - `src/client/app.tsx` -- Router config
  - `components.json` -- shadcn config (base-nova, base-ui, non-RSC)

- **shadcn Tabs component source:** Verified via `node_modules/.bin/shadcn add tabs --view` (81 lines, base-ui foundation, `@base-ui/react/tabs` import, `TabsPrimitive.Root.Props` API)

- **shadcn official docs:** https://ui.shadcn.com/docs/components/base/tabs -- Tabs API with `defaultValue`, `value`, `onValueChange`

### Secondary (MEDIUM confidence)
- **UI-SPEC.md:** `.planning/phases/08-oauth-connection-ui/08-UI-SPEC.md` -- Visual and interaction contract (all layout/copy/color decisions)
- **CONTEXT.md:** `.planning/phases/08-oauth-connection-ui/08-CONTEXT.md` -- 13 locked decisions (D-01 through D-13)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed; only Tabs component generation needed
- Architecture: HIGH -- all backend APIs exist and are tested; frontend patterns are straightforward React
- Pitfalls: HIGH -- derived from direct codebase analysis (auto-clear on status read, polling cleanup, standalone hook limitation)

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable -- no external dependency changes expected)
