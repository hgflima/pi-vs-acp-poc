# Phase 8: OAuth Connection UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 08-oauth-connection-ui
**Areas discussed:** Auth method selector, OAuth flow UX, Token status display, Connected state

---

## Auth Method Selector

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs within the card | Two tabs ("OAuth" / "API Key") below provider selector | ✓ |
| Radio buttons inline | Radio group that swaps content below | |
| Two side-by-side cards | OAuth card and API Key card side by side | |

**User's choice:** Tabs within the card
**Notes:** Clean and familiar pattern

| Option | Description | Selected |
|--------|-------------|----------|
| "Login with {Provider}" | "Login with Anthropic" / "Login with OpenAI" | |
| "Login with {Product}" | "Login with Claude" / "Login with Codex" | ✓ |
| "Connect via OAuth" | Generic label | |

**User's choice:** "Login with {Product}" — uses product names

| Option | Description | Selected |
|--------|-------------|----------|
| OAuth first | OAuth tab selected by default | ✓ |
| API Key first | Keeps current flow as default | |
| You decide | Claude's discretion | |

**User's choice:** OAuth first — aligns with Phase 5 D-01

---

## OAuth Flow UX

| Option | Description | Selected |
|--------|-------------|----------|
| window.open popup | Popup window, connection page stays visible | ✓ |
| Same-tab redirect | Navigate to provider URL in same tab | |

**User's choice:** window.open popup

| Option | Description | Selected |
|--------|-------------|----------|
| Spinner + text + cancel | Button shows spinner, "Waiting for authorization...", Cancel link, 2s polling | ✓ |
| Full overlay state | Card changes entirely to waiting state | |
| Minimal — just disable button | Button disabled with spinner only | |

**User's choice:** Spinner + text + cancel

| Option | Description | Selected |
|--------|-------------|----------|
| 2 seconds | Good balance of responsiveness and load | ✓ |
| 1 second | More responsive, more requests | |
| You decide | Claude's discretion | |

**User's choice:** 2 seconds polling interval

---

## Token Status Display

| Option | Description | Selected |
|--------|-------------|----------|
| Small badge next to status | Colored badge [OAuth] or [API Key] | ✓ |
| Icon differentiation | Lock icon for OAuth, key icon for API Key | |
| Text only | "Connected via OAuth" text | |

**User's choice:** Small badge next to status

| Option | Description | Selected |
|--------|-------------|----------|
| Green/Yellow/Red badges | Green=healthy, Yellow=expiring (<30min), Red=expired | ✓ |
| Single color + text change | Same color badge, only text changes | |
| You decide | Claude's discretion | |

**User's choice:** Green/Yellow/Red badges

| Option | Description | Selected |
|--------|-------------|----------|
| Show relative time | "Expires in 5h 42m" below badge | |
| Only show when expiring | Text only in yellow/red states | |
| Never show expiry | Only colors/states, no countdown | ✓ |

**User's choice:** Never show expiry — only color-coded badge

---

## Connected State

| Option | Description | Selected |
|--------|-------------|----------|
| Connected summary + actions | Status badge, "Go to Chat", "Disconnect" buttons. No auto-redirect | ✓ |
| Keep auto-redirect | Redirect to /chat after 1.5s (current behavior) | |
| Auto-redirect + back button | Redirect with chat header link back | |

**User's choice:** Connected summary + actions — no auto-redirect

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, switch replaces | Can authenticate with other method, replaces current | ✓ |
| Disconnect first | Must disconnect before switching | |
| You decide | Claude's discretion | |

**User's choice:** Yes, switch replaces — no disconnect needed

| Option | Description | Selected |
|--------|-------------|----------|
| Red badge + re-auth prompt | Red "Expired" badge, "Re-authenticate" button, chat shows inline error | ✓ |
| Auto-redirect to connection | Redirect to connection page on refresh failure | |
| You decide | Claude's discretion | |

**User's choice:** Red badge + re-auth prompt — aligns with Phase 5 D-02

---

## Claude's Discretion

- Tab component implementation
- Badge component styling
- Polling lifecycle management
- Popup window dimensions
- Expiry threshold integration with refreshStatus
- Disconnect API implementation
- Popup-blocked handling

## Deferred Ideas

- OAuth logout/revoke per provider (OAUTH-05)
- Branded callback page (OAUTH-06)
- DELETE /oauth/cancel endpoint
- Advanced popup-blocked fallback UX
