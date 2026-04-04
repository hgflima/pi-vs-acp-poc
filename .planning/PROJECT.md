# Pi AI Chat Web

## What This Is

Um chat web (SPA + Backend Proxy) que valida se a stack `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core` consegue sustentar uma experiencia de chat similar ao Claude.ai/ChatGPT — com streaming em tempo real, troca de agentes (Claude Code / Codex), troca de modelos, carregamento de harness e visualizacao diferenciada de tool calls. Uso pessoal do autor para decidir se a stack e viavel para um produto futuro.

## Core Value

Provar que pi-ai + pi-agent-core sustentam um chat web com streaming em tempo real, tool calls visiveis e troca de agentes — a validacao tecnica que decide se a stack segue para MVP.

## Requirements

### Validated

- [x] Autenticacao via API Key para conectar ao Claude e/ou Codex — Validated in Phase 1: Foundation + Connection
- [x] Backend proxy que roteia chamadas LLM e executa agent loop server-side — Validated in Phase 1: Foundation + Connection (skeleton + auth endpoint)
- [x] Chat interativo com streaming em tempo real (latencia < 500ms para primeiro token) — Validated in Phase 2: Streaming Chat
- [x] SSE streaming de AgentEvent do backend para o frontend — Validated in Phase 2: Streaming Chat
- [x] Visualizacao diferenciada de tool calls (6+ tipos com UI propria) — Validated in Phase 3: Tool Visualization

### Active

- [ ] Troca de agente (Claude Code / Codex) em runtime sem perda de contexto
- [ ] Troca de modelo por provider via registry de modelos
- [ ] Carregamento de harness (CLAUDE.md, AGENTS.md, skills, hooks) aplicado ao system prompt

### Out of Scope

- Persistencia de conversas (banco de dados, historico) — POC in-memory only
- Autenticacao de usuario (login do app em si) — single-user, uso pessoal
- Deploy em producao — local-only
- Testes automatizados — POC de validacao tecnica
- Suporte mobile / responsividade refinada — desktop browser only
- Edicao de arquivos inline ou terminal integrado — fora do escopo do POC
- Gerenciamento de multiplas conversas simultaneas — uma conversa por vez
- OAuth flow completo — API Key first, OAuth como stretch goal (ADR-005)

## Context

- **Motivacao:** Validacao tecnica para decidir se pi-ai + pi-agent-core sao viaveis como base para um produto futuro de chat com LLMs
- **Stack obrigatoria:** pi-ai e pi-agent-core sao o que esta sendo testado — nao podem ser substituidos
- **Arquitetura decidida:** SPA (React + Vite + shadcn/ui) com Backend Proxy (Hono + Node.js), conforme 6 ADRs aceitas
- **Conceitos pi-ai:** `stream(model, context)` retorna eventos (text_delta, toolcall_start/delta/end, thinking_delta, done); `getModel/getModels/getProviders` para registry; `getEnvApiKey` para auth
- **Conceitos pi-agent-core:** `Agent` class com event subscriptions; `AgentTool<TParams, TDetails>` para tools; `AgentEvent` para ciclo de vida; `streamProxy` para apps browser
- **Documentacao existente:** BRIEF, JOURNEY (6 fases), ARCHITECTURE (modulos, data flows, API surface, state shape), 6 ADRs em `.harn/docs/`
- **Destino do codigo:** Pode servir de base para MVP se POC for bem-sucedido

## Constraints

- **Stack:** pi-ai + pi-agent-core obrigatorios — sao o objeto de validacao
- **Infraestrutura:** Sem banco de dados, sem deploy, local-only
- **Usuarios:** Single-user (o proprio autor)
- **Seguranca:** API keys nao podem ser expostas no frontend (proxy obrigatorio)
- **Agent switching:** Nova instancia de Agent a cada troca (ADR-006), contexto via history

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SPA + Backend Proxy | APIs LLM nao permitem chamadas do browser; streamProxy existe para isso | Validated Phase 1 |
| Hono como backend | Leve, TypeScript-first, streaming nativo, alinhado com pi-agent-core | Validated Phase 1 |
| React local state (useReducer + Context) | POC simples, 1 usuario, sem persistencia, 3 telas | — Pending |
| SSE para streaming | Unidirecional server→client, nativo do browser, alinhado com AgentEvent | Validated Phase 2-3 |
| API Key first, OAuth stretch | OAuth complexo demais para POC; API Key valida a stack igualmente | Validated Phase 1 |
| Recreate Agent on switch | pi-agent-core nao suporta troca mid-session; nova instancia com history | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-04 after Phase 3 completion*
