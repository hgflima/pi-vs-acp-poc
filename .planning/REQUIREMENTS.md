# Requirements: Pi AI Chat Web

**Defined:** 2026-04-04
**Core Value:** Provar que pi-ai + pi-agent-core sustentam um chat web com streaming em tempo real, tool calls visiveis e troca de agentes

## v1.1 Requirements

Requirements for milestone v1.1 OAuth Authentication. Each maps to roadmap phases.

### Credential Infrastructure

- [ ] **CRED-01**: Credential store suporta compound credentials (OAuth tokens + API Key) coexistindo por provider
- [ ] **CRED-02**: Agent factory usa async getApiKey resolver com token refresh transparente

### OAuth Authentication

- [ ] **OAUTH-01**: User pode autenticar via OAuth PKCE com Anthropic (loginAnthropic via pi-ai)
- [ ] **OAUTH-02**: User pode autenticar via OAuth PKCE com OpenAI Codex (loginOpenAICodex via pi-ai)
- [ ] **OAUTH-03**: Tokens OAuth sao refreshed automaticamente antes de expirar
- [ ] **OAUTH-04**: User pode usar API Key como alternativa ao OAuth para qualquer provider

### Connection UI

- [ ] **UI-01**: Tela de conexao mostra selector de metodo de auth (OAuth vs API Key) por provider
- [ ] **UI-02**: Botao OAuth abre browser para flow e faz polling de status ate completar
- [ ] **UI-03**: Indicador visual de status do token (connected, expiring, expired)

## Out of Scope

| Feature | Reason |
|---------|--------|
| OAuth como unico metodo (sem API Key) | API Key deve coexistir — decisao explicita do usuario |
| Persistencia de tokens em disco/DB | Local-only, in-memory — consistente com v1.0 |
| Multi-user OAuth sessions | Single-user POC |
| OAuth para providers alem de Anthropic/OpenAI | Apenas os 2 providers suportados por pi-ai |

## Future Requirements

### Extended OAuth

- **OAUTH-05**: Logout/revoke OAuth token por provider
- **OAUTH-06**: Branded callback page em vez de plain text

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CRED-01 | Phase 5 | Pending |
| CRED-02 | Phase 5 | Pending |
| OAUTH-01 | Phase 6 | Pending |
| OAUTH-02 | Phase 7 | Pending |
| OAUTH-03 | Phase 7 | Pending |
| OAUTH-04 | Phase 5 | Pending |
| UI-01 | Phase 8 | Pending |
| UI-02 | Phase 8 | Pending |
| UI-03 | Phase 8 | Pending |

**Coverage:**
- v1.1 requirements: 9 active
- Mapped to phases: 9/9
- Unmapped: 0

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after roadmap revision — OAUTH-01 re-added, Anthropic OAuth prioritized*
