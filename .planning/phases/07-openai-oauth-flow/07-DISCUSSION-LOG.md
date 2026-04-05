# Phase 7: OpenAI OAuth Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 07-openai-oauth-flow
**Areas discussed:** Provider/model routing OAuth, Validate-before-store OAuth, SC#4 refresh UAT, Port 1455 fallback

---

## Provider/model routing OAuth

### Q1: Como mapeamos 'openai' + OAuth para openai-codex da pi-ai?

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic remap no backend | Provider='openai' fica. getModels/createAgent detectam authMethod e chamam pi-ai com 'openai-codex' quando OAuth. Frontend vê único 'openai', lista de modelos muda sozinha. | ✓ |
| Expor openai-codex como 3º provider | Provider = 'anthropic' \| 'openai' \| 'openai-codex'. User escolhe explicitamente. Quebra UI que pensa em 2 providers. | |
| Flag 'flavor' na requisição de chat | Provider fica 'openai', flag openaiFlavor='standard'\|'codex' inferido do authMethod. Frontend controla. | |

**User's choice:** Dynamic remap no backend

### Q2: Onde o remap 'openai' → 'openai-codex' acontece?

| Option | Description | Selected |
|--------|-------------|----------|
| Helper resolvePiProvider() | Nova função em credentials.ts, usada em createAgent e /api/models. Centraliza a regra. | ✓ |
| Inline em createAgent/models.ts | Código duplicado mas explícito em cada call-site. | |
| Encapsular no getActiveCredential | Retorna {credential, piProvider} juntos. Afeta Phase 5 contract. | |

**User's choice:** Helper resolvePiProvider()

### Q3: Quando user tem AMBOS API Key e OAuth, que modelos /api/models retorna?

| Option | Description | Selected |
|--------|-------------|----------|
| Só os ativos via D-01 | OAuth preferred (D-01 Phase 5) → só openai-codex models. Consistente. | ✓ |
| União dos dois | Retorna standard + codex models marcados com authMethod. Phase 8 UI filtra. | |
| Query param auth no /api/models | Caller especifica. Move complexidade para frontend. | |

**User's choice:** Só os ativos via D-01

**Notes:** Dynamic remap centralizado em resolvePiProvider() mantém Provider type estável ('anthropic' | 'openai') e preserva o modelo mental do user na UI. A seleção de modelos segue D-01 Phase 5 (OAuth preferred).

---

## Validate-before-store OAuth

### Q: Testar access token contra API do OpenAI Codex antes de armazenar?

| Option | Description | Selected |
|--------|-------------|----------|
| Não validar — espelhar Phase 6 | Armazena logo após loginOpenAICodex resolver. Falhas surgem no primeiro chat. | ✓ |
| Validar com call mínimo Codex | Request pequeno ao chatgpt.com antes de storeOAuthTokens. Custo: 1 round-trip extra. | |
| Só validar JWT claims localmente | Decodifica access token, confirma accountId. Detecção parcial. | |

**User's choice:** Não validar — espelhar Phase 6

**Notes:** Mantém simetria com D-05 Phase 6. PITFALL #2 (scope model.request) é irrelevante porque pi-ai roteia OAuth por openai-codex provider (chatgpt.com/backend-api), não por api.openai.com/chat/completions. pi-ai extrai accountId do JWT internamente.

---

## SC#4 refresh UAT

### Q1: Como validar SC#4 sem esperar 6h?

| Option | Description | Selected |
|--------|-------------|----------|
| Endpoint de debug force-expire | POST /api/auth/oauth/debug/force-expire?provider=openai muta expires para Date.now()-1s. Próximo /api/chat dispara refresh real. Comprova ciclo completo. | ✓ |
| Integration test — mockar pi-ai refresh | Teste automatizado sem bater na API real. Não comprova que refresh token é aceito pelo servidor. | |
| Manual: shrink expires e rodar curl | UAT edita credentials.ts via REPL/debugger. Sem endpoint novo, fluxo frouxo. | |
| Só validar que refreshOpenAICodexToken é chamado | Console.log em resolveCredential. Não comprova end-to-end. | |

**User's choice:** Endpoint de debug force-expire

### Q2: Como 'gatear' o endpoint debug/force-expire?

| Option | Description | Selected |
|--------|-------------|----------|
| Sempre habilitado | POC local-only, single-user, no deploy. Gate é overhead desnecessário. | ✓ |
| Atrás de env var NODE_ENV !== production | Overhead baixo mas prematuro para este projeto. | |
| Remover após UAT | Codebase mais limpo, mas custoso se SC#4 precisar re-verificação. | |

**User's choice:** Sempre habilitado

**Notes:** Debug endpoint comprova o ciclo end-to-end (mutex, refreshOpenAICodexToken real, store update, novo access token no chat stream) sem esperar natural expiry. Sempre-habilitado é consistente com "local-only, in-memory" philosophy do POC.

---

## Port 1455 fallback

### Q: Quando porta 1455 está ocupada (Codex CLI), qual comportamento?

| Option | Description | Selected |
|--------|-------------|----------|
| 409 espelho de Phase 6 | Pre-check bind, EADDRINUSE → 409 com mensagem citando Codex CLI. Consistente com Phase 6 D-02. SC#5 pede exatamente isso. | ✓ |
| Fallback: paste manual via onManualCodeInput | Retorna authUrl + instruções para colar código. Nova rota /oauth/paste-code. Mais código. | |

**User's choice:** 409 espelho de Phase 6

**Notes:** ensurePortFree já é port-agnostic e pode ser reutilizado para 1455. Mensagem específica cita Codex CLI (parallel à Phase 6 citando Claude Code CLI para 53692).

---

## Claude's Discretion

Áreas onde o user deferiu para Claude:
- Exata signature de resolvePiProvider e estrutura do dispatch (switch vs Map)
- Placement de ensurePortFree se refatorado para util compartilhado
- Shape JSON exato do POST /debug/force-expire
- Implementação de onPrompt / onManualCodeInput callbacks para loginOpenAICodex
- Logging de onProgress messages (console.log)
- Se /oauth/status expõe expires para TTL da UI

## Deferred Ideas

- Expor 'openai-codex' como terceiro provider na UI (rejeitado em favor de dynamic remap)
- onManualCodeInput paste fallback (rejeitado; reconsiderar em Phase 8 se UI precisar)
- Validate-before-store via Codex API call (rejeitado; reconsiderar se UAT surfacing scope failures)
- União de model list no /api/models (rejeitado; reconsiderar se Phase 8 quiser preview)
- Logout/revoke (OAUTH-05 future)
- Branded callback page (OAUTH-06 future)
- DELETE /oauth/cancel (carried from Phase 6 D-04)
- 5-min session timeout (carried from Phase 6 D-04)
