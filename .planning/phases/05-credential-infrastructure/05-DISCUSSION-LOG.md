# Phase 5: Credential Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 05-credential-infrastructure
**Areas discussed:** Active credential priority, Agent factory contract, Frontend auth awareness, Credential store surface

---

## Active Credential Priority

| Option | Description | Selected |
|--------|-------------|----------|
| OAuth preferred | Se OAuth está válido, usa OAuth. Só cai pra API Key se OAuth expirou/falhou | ✓ |
| User escolhe explicitamente | Toggle na UI para selecionar método ativo | |
| Último usado | O método mais recente vira o ativo | |

**User's choice:** OAuth preferred
**Notes:** —

### Fallback behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback automático | Se OAuth falha e API Key existe, usa API Key silenciosamente | |
| Erro e re-auth | OAuth falhou = erro. User precisa re-autenticar manualmente | ✓ |

**User's choice:** Erro e re-auth
**Notes:** Sem fallback silencioso — comportamento explícito

---

## Agent Factory Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Factory resolve | createAgent(provider, modelId) consulta credential store internamente | ✓ |
| Caller resolve antes | Rota de chat busca o token e passa como string | |
| Injetar resolver | createAgent recebe função getApiKey genérica | |

**User's choice:** Factory resolve
**Notes:** —

### Async handling

| Option | Description | Selected |
|--------|-------------|----------|
| Refresh proativo | Timer/check antes do request garante token fresh. getApiKey continua sync | ✓ |
| Wrapper async | Wrap getApiKey com lógica de refresh inline | |
| Você decide | Claude escolhe baseado no que pi-agent-core suporta | |

**User's choice:** Refresh proativo
**Notes:** —

---

## Frontend Auth Awareness

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, expor método ativo | AuthState inclui authMethod: 'apiKey' \| 'oauth' \| null | ✓ |
| Não, só connected/disconnected | Frontend não sabe se é OAuth ou API Key | |
| Adiar pra Phase 8 | Manter o tipo atual e deixar Phase 8 decidir | |

**User's choice:** Sim, expor método ativo
**Notes:** —

### Per-provider state

| Option | Description | Selected |
|--------|-------------|----------|
| Per-provider | Map<Provider, ProviderAuthState> — status independente por provider | ✓ |
| Um provider ativo | Manter modelo atual — só um provider conectado por vez | |

**User's choice:** Per-provider
**Notes:** —

---

## Credential Store Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Granular por tipo | storeApiKey(), storeOAuthTokens(), clearByType(), getActiveCredential() | ✓ |
| Store genérico | store(provider, credential: union), get(provider) | |
| Você decide | Claude escolhe a API surface | |

**User's choice:** Granular por tipo
**Notes:** —

### Status query

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, endpoint de status | getAuthStatus(provider) retorna { hasApiKey, hasOAuth, activeMethod, oauthExpiry? } | ✓ |
| Não, frontend infere | Frontend só sabe o que configurou na sessão | |
| Você decide | Claude implementa o que fizer sentido | |

**User's choice:** Sim, endpoint de status
**Notes:** —

---

## Claude's Discretion

- Internal data structure for compound credentials
- TypeScript type definitions for OAuthCredential shape
- Proactive refresh timer implementation details
- Error types and messages
- GET /auth/status route structure

## Deferred Ideas

None — discussion stayed within phase scope
