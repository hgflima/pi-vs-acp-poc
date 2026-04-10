# SCR-01: Connection

## 1. Meta
- **Route:** `/`
- **Requirements:** BRIEF (Autenticacao), JOURNEY Phase 1
- **Status:** Draft
- **Last Updated:** 2026-04-03

## 2. Purpose

Tela de entrada da aplicacao. Permite ao usuario conectar-se a um provider de LLM (Anthropic ou OpenAI Codex) via OAuth ou API Key. Funciona como gate — o usuario so acessa o chat apos autenticacao bem-sucedida no provider.

## 3. Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                     background.subtle (#FAFAF8)                 │
│                                                                 │
│                                                                 │
│                                                                 │
│               ┌───────────────────────────────┐                 │
│               │                               │                 │
│               │         Pi AI Chat            │                 │
│               │    Connect to a provider       │                 │
│               │                               │                 │
│               ├───────────────────────────────┤                 │
│               │                               │                 │
│               │  Provider:                    │                 │
│               │  ┌─────────────┬────────────┐ │                 │
│               │  │ ● Anthropic │  ○ Codex   │ │                 │
│               │  └─────────────┴────────────┘ │                 │
│               │                               │                 │
│               │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │                 │
│               │                               │                 │
│               │  Auth method:                 │                 │
│               │  ┌─────────────┬────────────┐ │                 │
│               │  │ ● OAuth     │  ○ API Key │ │                 │
│               │  └─────────────┴────────────┘ │                 │
│               │                               │                 │
│               │  ┌───────────────────────────┐│                 │
│               │  │  Connect with Anthropic   ││                 │
│               │  └───────────────────────────┘│                 │
│               │                               │                 │
│               └───────────────────────────────┘                 │
│                                                                 │
│                                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Variante: API Key selecionado**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│               ┌───────────────────────────────┐                 │
│               │         Pi AI Chat            │                 │
│               │    Connect to a provider       │                 │
│               ├───────────────────────────────┤                 │
│               │                               │                 │
│               │  Provider:                    │                 │
│               │  ┌─────────────┬────────────┐ │                 │
│               │  │ ● Anthropic │  ○ Codex   │ │                 │
│               │  └─────────────┴────────────┘ │                 │
│               │                               │                 │
│               │  Auth method:                 │                 │
│               │  ┌─────────────┬────────────┐ │                 │
│               │  │  ○ OAuth    │ ● API Key  │ │                 │
│               │  └─────────────┴────────────┘ │                 │
│               │                               │                 │
│               │  ┌───────────────────────────┐│                 │
│               │  │ sk-ant-...                ││                 │
│               │  └───────────────────────────┘│                 │
│               │  Enter your Anthropic API key  │                 │
│               │                               │                 │
│               │  ┌───────────────────────────┐│                 │
│               │  │        Connect            ││                 │
│               │  └───────────────────────────┘│                 │
│               │                               │                 │
│               └───────────────────────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Layout Structure
- **Container:** Centered vertical + horizontal, max-width: 420px
- **Background:** color.background.subtle (`#FAFAF8`)
- **Card:** Background `#FFFFFF`, border `color.border.default`, border-radius `border.radius.xl` (16px), shadow `shadow.lg`
- **Card padding:** spacing.8 (32px)
- **Card internal gap:** spacing.6 (24px)
- **Alignment:** Center both axes (flexbox)

## 5. Components

| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| Card | elevated | padding=8, radius=xl | Main container |
| Heading | h1 | size=2xl, weight=semibold | "Pi AI Chat" |
| Text | muted | size=sm | "Connect to a provider" |
| SegmentedControl | default | options=["Anthropic", "Codex"] | Provider selector |
| Separator | subtle | - | Visual divider |
| SegmentedControl | default | options=["OAuth", "API Key"] | Auth method selector |
| Input | default | type=password, placeholder="sk-ant-..." | Only visible when API Key selected |
| Text | muted | size=xs | Helper text below input |
| Button | primary | fullWidth, size=lg | "Connect with {provider}" or "Connect" |
| Alert | error | - | Error feedback, hidden by default |

## 6. States

### Default State
- Provider: Anthropic selecionado
- Auth method: OAuth selecionado
- Button: "Connect with Anthropic"

### API Key Input State
- Campo de API Key visivel
- Helper text abaixo do input
- Button: "Connect"

### Loading State
- Button com spinner + texto "Connecting..."
- Inputs e selectors desabilitados
- Para OAuth: popup/redirect aberto

### Error State
- Alert de erro no topo do card (abaixo do titulo)
- Mensagem contextual:
  - OAuth: "Authentication failed. Please try again."
  - API Key: "Invalid API key. Please check and try again."
  - Network: "Connection failed. Please check your network."
- Inputs habilitados para retry

### Success State
- Breve flash de feedback (checkmark no button)
- Redirect automatico para `/chat` apos 300ms

## 7. Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| Provider change | Update provider state | Button label updates, API key placeholder updates |
| Auth method change | Toggle OAuth/API Key UI | Input field appears/disappears with transition.fast |
| Connect (OAuth) | `loginAnthropic()` or `loginOpenAICodex()` | Loading state -> popup -> Success/Error |
| Connect (API Key) | Validate key via test request | Loading state -> Success/Error |
| Connect success | Navigate to `/chat` | Brief success feedback, redirect |
| Connect error | Show error alert | Error state, re-enable inputs |

## 8. Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| Desktop (all) | Card centered, max-width 420px — POC is desktop-only |

## 9. Accessibility

- Focus: First interactive element (provider selector) on load
- Tab order: Provider -> Auth method -> API Key input (if visible) -> Connect button
- Error announcements via `aria-live="polite"`
- Button loading state announced to screen readers
- API Key input: `type="password"` para ocultar valor

## 10. Content

| Element | Text | Notes |
|---------|------|-------|
| Title | "Pi AI Chat" | App name |
| Subtitle | "Connect to a provider" | Below title |
| Provider label | "Provider" | Above segmented control |
| Provider opt 1 | "Anthropic" | Default selected |
| Provider opt 2 | "Codex" | OpenAI Codex |
| Auth label | "Authentication" | Above segmented control |
| Auth opt 1 | "OAuth" | Default selected |
| Auth opt 2 | "API Key" | Manual key entry |
| API Key placeholder | "sk-ant-..." / "sk-..." | Changes per provider |
| API Key helper | "Enter your {provider} API key" | Below input |
| Button (OAuth) | "Connect with {provider}" | Dynamic per provider |
| Button (API Key) | "Connect" | Static |
| Button (loading) | "Connecting..." | With spinner |
| Error (OAuth) | "Authentication failed. Please try again." | OAuth failure |
| Error (API Key) | "Invalid API key. Please check and try again." | Key validation |
| Error (network) | "Connection failed. Please check your network." | Network error |
