---
phase: 08-oauth-connection-ui
verified: 2026-04-06T10:00:00Z
status: human_needed
score: 16/16 must-haves verified
human_verification:
  - test: "OAuth tab is the default selection on page load"
    expected: "The OAuth tab appears selected/active when ConnectionPage first renders — no API Key tab highlighted"
    why_human: "Default tab (authMethod state initialized to 'oauth') requires visual inspection to confirm TabsTrigger active styling"
  - test: "Clicking 'Login with Claude' opens a popup and shows polling spinner"
    expected: "A browser popup opens to the Anthropic consent URL; the connection page immediately shows Loader2 spinner and 'Waiting for authorization...' text with a 'Cancel authorization' link"
    why_human: "window.open popup behavior and real-time UI transition require a running browser"
  - test: "OAuth success updates the page to connected summary"
    expected: "After completing OAuth in popup, connection page shows ConnectedSummary with [OAuth] badge and green 'Connected' badge, plus 'Go to Chat' and 'Disconnect' buttons"
    why_human: "End-to-end OAuth callback flow requires backend OAuth infrastructure (Phases 6-7) and a live browser session"
  - test: "Token health badge transitions (green -> yellow -> red)"
    expected: "A healthy OAuth connection shows green badge; a connection <30 min from expiry shows yellow; an expired token shows red with 'Re-authenticate' button replacing 'Go to Chat'"
    why_human: "Requires triggering force-expire via POST /api/auth/oauth/debug/force-expire to observe real-time color transitions"
  - test: "D-12: Tabs remain visible and functional when connected"
    expected: "After connecting, the OAuth and API Key tabs remain visible below the ConnectedSummary component; user can click API Key tab and re-authenticate without disconnecting first"
    why_human: "Tab persistence during connected state requires visual confirmation in a running browser"
  - test: "Popup-blocked error message"
    expected: "If browser blocks the popup, the page shows the error 'Pop-up blocked. Please allow pop-ups for this site and try again.' below the login button"
    why_human: "Requires configuring browser to block popups for localhost to trigger the error path"
---

# Phase 08: OAuth Connection UI Verification Report

**Phase Goal:** Connection page lets the user choose between OAuth and API Key per provider, with visual feedback throughout the OAuth flow and token lifecycle
**Verified:** 2026-04-06T10:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Plan 01)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Frontend can call startOAuth(provider) and receive an authUrl | ✓ VERIFIED | `startOAuth` in `api.ts:29-41` POSTs to `${API_BASE}/auth/oauth/start` with typed response |
| 2   | Frontend can poll fetchOAuthStatus(provider) and receive pending/ok/error/none | ✓ VERIFIED | `fetchOAuthStatus` in `api.ts:43-51` GETs `${API_BASE}/auth/oauth/status?provider=${provider}` |
| 3   | Frontend can call disconnectProvider(provider) and get credentials cleared on backend | ✓ VERIFIED | `disconnectProvider` in `api.ts:53-63` POSTs to `${API_BASE}/auth/disconnect`; backend `auth.ts:86-94` calls `clearByType(provider, "apiKey")` and `clearByType(provider, "oauth")` |
| 4   | useAuth exposes startOAuth, cancelOAuth, and enhanced disconnect for connection page | ✓ VERIFIED | `use-auth.ts:186` returns `{ getProviderAuth, connect, disconnect, refreshStatus, startOAuth, cancelOAuth }` |
| 5   | shadcn Tabs component is available for auth method selector | ✓ VERIFIED | `tabs.tsx:80` exports `{ Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }` |

### Observable Truths (Plan 02)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 6   | Connection page shows auth method tabs (OAuth / API Key) below the provider selector | ✓ VERIFIED | `connection-page.tsx:81-103` renders `<Tabs>` with TabsTrigger for "oauth" and "apiKey" below the SegmentedControl |
| 7   | OAuth tab is the default selection when opening the page (D-02) | ? NEEDS HUMAN | `connection-page.tsx:13` initializes `authMethod` to `"oauth"`, but visual tab active state requires browser confirmation |
| 8   | Clicking the OAuth login button opens provider consent page in a popup window | ? NEEDS HUMAN | `use-auth.ts:105` calls `window.open(res.authUrl, "_blank", "width=600,height=700,popup=yes")` — runtime behavior |
| 9   | While waiting for OAuth, UI shows spinner with "Waiting for authorization..." and a "Cancel authorization" link | ✓ VERIFIED | `oauth-tab.tsx:18-40` renders Loader2 + "Waiting for authorization..." + cancel link when `status === "connecting"` |
| 10  | After OAuth completes, connected summary shows auth method badge and health badge | ? NEEDS HUMAN | `connected-summary.tsx:51-58` renders `<Badge variant="secondary">` + colored health badge — requires live OAuth flow to verify |
| 11  | API Key tab preserves the existing input + connect flow from v1.0 | ✓ VERIFIED | `api-key-tab.tsx` has Input, Eye/EyeOff toggle, "Connect API Key" button — full form extraction confirmed |
| 12  | Connected state shows "Go to Chat" and "Disconnect" buttons — no auto-redirect | ✓ VERIFIED | `connected-summary.tsx:66-76` shows `navigate("/chat")` button and Disconnect button; no `useEffect` auto-redirect in `connection-page.tsx` |
| 13  | Token health badge is green for healthy, yellow for expiring, red for expired | ✓ VERIFIED | `connected-summary.tsx:24-28` defines `healthConfig` with exact tailwind classes per UI-SPEC; `getTokenHealth` logic at lines 9-22 uses 30-min threshold |
| 14  | API Key connections always show green badge (D-10) | ✓ VERIFIED | `connected-summary.tsx:11` — `getTokenHealth` returns `"healthy"` immediately when `authMethod !== "oauth"` |
| 15  | Expired OAuth shows "Re-authenticate" button instead of "Go to Chat" (D-13) | ✓ VERIFIED | `connected-summary.tsx:62-70` — `isExpired` branches to `<Button onClick={onReAuth}>Re-authenticate</Button>` |
| 16  | User can switch auth method while connected without disconnecting first (D-12) | ✓ VERIFIED | `connection-page.tsx:78-103` — Tabs are always rendered (not conditionally removed when connected); ConnectedSummary renders above tabs, not replacing them |

**Score:** 16/16 truths have code support. 6 require human verification for runtime/visual confirmation.

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/server/routes/auth.ts` | POST /api/auth/disconnect endpoint | ✓ VERIFIED | Lines 86-94: full handler with validation, clearByType calls, and response |
| `src/client/components/ui/tabs.tsx` | shadcn Tabs component | ✓ VERIFIED | Exports Tabs, TabsList, TabsTrigger, TabsContent (line 80); uses `@base-ui/react/tabs` |
| `src/client/lib/api.ts` | OAuth + disconnect API client functions | ✓ VERIFIED | 3 exported functions: startOAuth (29), fetchOAuthStatus (43), disconnectProvider (53) |
| `src/client/hooks/use-auth.ts` | OAuth flow management + enhanced disconnect | ✓ VERIFIED | startOAuth (88), cancelOAuth (155), enhanced disconnect (164), pollingRef (23), cleanup useEffect (179) |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/client/components/connection/oauth-tab.tsx` | OAuth login button + polling state UI | ✓ VERIFIED | Exports OAuthTab; 3 render states (initial/polling/error); correct button labels ("Login with Claude"/"Login with Codex") |
| `src/client/components/connection/api-key-tab.tsx` | API Key input form extracted from connection-page | ✓ VERIFIED | Exports ApiKeyTab; Input + Eye/EyeOff + "Connect API Key" button; aria-labels on toggle |
| `src/client/components/connection/connected-summary.tsx` | Connected state with badges, Go to Chat, Disconnect | ✓ VERIFIED | Exports ConnectedSummary + getTokenHealth; dual badges; Re-authenticate branch; useNavigate wired |
| `src/client/components/connection/connection-page.tsx` | Refactored with tabs and state routing | ✓ VERIFIED | Imports Tabs + all 3 sub-components + useAuth; ConnectedSummary above Tabs; tabs always rendered |

---

## Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `api.ts` | `/api/auth/oauth/start` | fetch POST | ✓ WIRED | `api.ts:35` `fetch(\`${API_BASE}/auth/oauth/start\`, { method: "POST" })` |
| `api.ts` | `/api/auth/oauth/status` | fetch GET | ✓ WIRED | `api.ts:49` `fetch(\`${API_BASE}/auth/oauth/status?provider=${provider}\`)` |
| `api.ts` | `/api/auth/disconnect` | fetch POST | ✓ WIRED | `api.ts:57` `fetch(\`${API_BASE}/auth/disconnect\`, { method: "POST" })` |
| `use-auth.ts` | `api.ts` | import startOAuth, fetchOAuthStatus, disconnectProvider | ✓ WIRED | `use-auth.ts:3` imports all three; used in startOAuth (93), polling callback (124), disconnect (167) |
| `connection-page.tsx` | `use-auth.ts` | useAuth hook | ✓ WIRED | `connection-page.tsx:8` imports useAuth; line 14 destructures all 6 hook returns |
| `oauth-tab.tsx` | `use-auth.ts` | startOAuth, cancelOAuth props | ✓ WIRED | Props flow: `connection-page.tsx:44-45` creates handlers; `connection-page.tsx:91-92` passes as `onStartOAuth`/`onCancelOAuth` |
| `connected-summary.tsx` | `use-auth.ts` | disconnect prop | ✓ WIRED | `connection-page.tsx:47` creates `handleDisconnect`; `connection-page.tsx:73` passes as `onDisconnect` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `connected-summary.tsx` | `authMethod`, `oauthExpiry` | `auth` from `getProviderAuth(provider)` via `use-auth.ts` → `refreshStatus` → `fetchAuthStatus` → `GET /api/auth/status` | Yes — `credentials.ts:87-90` populates `activeMethod` and `status.oauthExpiry` from in-memory store | ✓ FLOWING |
| `connected-summary.tsx` | `health` (TokenHealth) | `getTokenHealth(authMethod, oauthExpiry)` — pure computation from real state | Yes — derives from real expiry timestamp from backend | ✓ FLOWING |
| `oauth-tab.tsx` | `status`, `error` | `auth.status`, `auth.error` passed from `connection-page.tsx` which gets from `getProviderAuth(provider)` | Yes — state updated by `setProviderState` in hook during OAuth flow | ✓ FLOWING |
| `api-key-tab.tsx` | `status`, `error` | Same as oauth-tab — `auth` from `getProviderAuth(provider)` | Yes — `connect()` in use-auth updates state with real backend response | ✓ FLOWING |
| `connection-page.tsx` | `isConnected`, `isPolling` | Derived from `auth.status` (live hook state) | Yes — hook state reflects real backend auth responses | ✓ FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Check | Result | Status |
| -------- | ----- | ------ | ------ |
| TypeScript compiles with zero errors | `npx tsc --noEmit` | Exit 0, no output | ✓ PASS |
| `startOAuth` exported from api.ts | `grep 'export async function startOAuth' src/client/lib/api.ts` | Match found (line 29) | ✓ PASS |
| `fetchOAuthStatus` exported from api.ts | `grep 'export async function fetchOAuthStatus' src/client/lib/api.ts` | Match found (line 43) | ✓ PASS |
| `disconnectProvider` exported from api.ts | `grep 'export async function disconnectProvider' src/client/lib/api.ts` | Match found (line 53) | ✓ PASS |
| POST /disconnect handler clears both types | `grep 'clearByType.*apiKey\|clearByType.*oauth' auth.ts` | Both calls at lines 91-92 | ✓ PASS |
| Tabs exports all 4 primitives | `grep 'export.*Tabs' tabs.tsx` | Line 80 exports Tabs, TabsList, TabsTrigger, TabsContent | ✓ PASS |
| useAuth returns startOAuth + cancelOAuth | `grep 'startOAuth.*cancelOAuth' use-auth.ts` (return statement) | Line 186 confirmed | ✓ PASS |
| Polling stops on terminal state | `grep 'stopPolling.*provider' use-auth.ts` | Lines 129, 131 — stopPolling called on "ok" and "error" | ✓ PASS |
| OAuth popup opens | `grep 'window.open' use-auth.ts` | Line 105 confirmed | ✓ PASS |
| ConnectedSummary renders above Tabs (D-12) | `grep -n 'ConnectedSummary\|<Tabs' connection-page.tsx` | ConnectedSummary at line 70, Tabs at line 81 | ✓ PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| UI-01 | 08-01, 08-02 | Tela de conexao mostra selector de metodo de auth (OAuth vs API Key) por provider | ✓ SATISFIED | `connection-page.tsx:81-103` renders Tabs with OAuth and API Key options below SegmentedControl provider selector |
| UI-02 | 08-01, 08-02 | Botao OAuth abre browser para flow e faz polling de status ate completar | ✓ SATISFIED (code) / ? NEEDS HUMAN (runtime) | `use-auth.ts:105` opens popup; `use-auth.ts:118-143` polls via setInterval at 2000ms; stops on "ok"/"error" terminal states |
| UI-03 | 08-01, 08-02 | Indicador visual de status do token (connected, expiring, expired) | ✓ SATISFIED | `connected-summary.tsx:9-28` implements `getTokenHealth` with 30-min threshold; `healthConfig` maps to green/yellow/red tailwind classes |

All 3 requirements are satisfied at the code level. UI-02 has a runtime/browser component (actual popup and OAuth callback) that requires human verification.

No orphaned requirements found — all 3 Phase 8 requirements (UI-01, UI-02, UI-03) are claimed by both plans and implemented.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `connection-page.tsx` | 42 | `void getTokenHealth(auth.authMethod, auth.oauthExpiry)` — called but result discarded | ℹ️ Info | No functional impact: getTokenHealth is pure/no side effects; this is a dead call. The actual health calculation is in ConnectedSummary itself. The void call serves no purpose but causes no harm. |
| `api-key-tab.tsx` | 34 | `placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}` — contains literal "placeholder" text | ℹ️ Info | This is a legitimate HTML input placeholder attribute value (instructional hint text for the user), not a code stub. Not a concern. |

No blocker or warning-level anti-patterns found. All components have substantive implementations with real data flows.

---

## Human Verification Required

### 1. OAuth Tab Default Selection (D-02)

**Test:** Load the connection page at `/` (or navigate to `/`) in a browser with no credentials set.
**Expected:** The "OAuth" tab should appear active/selected by default. The "API Key" tab should be inactive.
**Why human:** The `authMethod` state is initialized to `"oauth"`, but the visual active state of `TabsTrigger` using base-ui data attributes requires browser rendering to confirm.

### 2. OAuth Popup Flow and Polling State

**Test:** Click "Login with Claude" on the connection page with Anthropic selected.
**Expected:** A browser popup opens to the Anthropic OAuth consent URL. The connection page immediately transitions to show the Loader2 spinner with "Waiting for authorization..." and a "Cancel authorization" link below it. The tabs become disabled (greyed out).
**Why human:** `window.open` popup behavior, browser security controls, and UI state transitions all require a running browser session. The backend OAuth infrastructure (Phase 6) must be functional.

### 3. Full OAuth Success Flow

**Test:** Complete the OAuth flow in the popup for Anthropic. After consenting, close or let the popup close automatically.
**Expected:** The connection page detects the success via polling within ~2 seconds, transitions to the ConnectedSummary view showing the [OAuth] badge and green "Connected" badge, with "Go to Chat" and "Disconnect" buttons. No automatic redirect to chat.
**Why human:** End-to-end OAuth callback handling (Phase 6/7 infrastructure) plus real-time UI update via polling.

### 4. Token Health Color Transitions

**Test:** After connecting via OAuth, use `curl -X POST http://localhost:3001/api/auth/oauth/debug/force-expire?provider=anthropic` (or via the debug endpoint) to force token expiry.
**Expected:** Wait up to 60 seconds for the health timer to tick. The badge transitions from green "Connected" to red "Expired", and "Re-authenticate" replaces "Go to Chat".
**Why human:** Requires triggering the force-expire debug endpoint and observing the 60-second timer-driven re-render in a live browser.

### 5. D-12: Tab Switching While Connected

**Test:** After connecting via API Key, verify the Tabs component remains visible below the ConnectedSummary. Click the "OAuth" tab. Confirm the OAuth login button appears and is functional.
**Expected:** Tabs are always present. Clicking OAuth tab while already connected via API Key shows the OAuth login button. User can initiate a second OAuth connection without disconnecting first.
**Why human:** Tab visibility and interactivity after connection state change requires visual browser confirmation.

### 6. Popup Blocked Error Path

**Test:** Configure the browser to block popups for `localhost`, then click "Login with Claude".
**Expected:** Instead of a popup, the page shows the error message "Pop-up blocked. Please allow pop-ups for this site and try again." below the login button with destructive text color.
**Why human:** Requires browser-level popup blocking configuration to trigger the `window.open` returning null path in `use-auth.ts:106-113`.

---

## Gaps Summary

No gaps found. All code artifacts exist, are substantive, and are fully wired with real data flows. TypeScript compiles clean with zero errors. All 6 phase commits are verified in git history.

The phase goal is achieved at the code level: the connection page provides OAuth and API Key tab selection per provider (UI-01), OAuth initiates a popup with polling-based status feedback (UI-02), and token health indicators with green/yellow/red semantic badges are implemented (UI-03).

6 items require human browser verification for runtime behavior confirmation (visual state, popup mechanics, end-to-end OAuth callback, health badge transitions).

---

_Verified: 2026-04-06T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
