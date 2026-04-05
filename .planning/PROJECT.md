# Pi AI Chat Web

## What This Is

Um chat web (SPA + Backend Proxy) que validou com sucesso que a stack `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core` sustenta uma experiencia de chat similar ao Claude.ai/ChatGPT — com streaming em tempo real, troca de agentes (Claude Code / Codex), troca de modelos, carregamento de harness e visualizacao diferenciada de tool calls. POC completo, validacao tecnica positiva.

## Core Value

Provar que pi-ai + pi-agent-core sustentam um chat web com streaming em tempo real, tool calls visiveis e troca de agentes — a validacao tecnica que decide se a stack segue para MVP.

**Status: VALIDADO** — a stack sustenta o caso de uso. Decisao de prosseguir para MVP e viavel.

## Requirements

### Validated

- ✓ Projeto scaffolded com Vite + React 19 + Tailwind 4 + shadcn/ui + TypeScript — v1.0
- ✓ Backend Hono com endpoints e proxy config do Vite — v1.0
- ✓ Tipos compartilhados (Message, SSEEvent, ToolCardVariant, AppState) — v1.0
- ✓ Spike de validacao da API pi-agent-core (event types, subscribe, stream lifecycle) — v1.0
- ✓ Autenticacao via API Key para conectar ao Claude e/ou Codex — v1.0
- ✓ Backend valida a API Key com request de teste ao provider — v1.0
- ✓ Credenciais armazenadas in-memory no servidor (nunca expostas ao frontend) — v1.0
- ✓ Feedback visual de conexao (conectando, conectado, erro) — v1.0
- ✓ Tela de conexao com selecao de provider e campo de API Key — v1.0
- ✓ Chat interativo com streaming em tempo real (latencia < 500ms para primeiro token) — v1.0
- ✓ SSE streaming de AgentEvent do backend para o frontend — v1.0
- ✓ Visualizacao diferenciada de tool calls (8 tipos com UI propria) — v1.0
- ✓ Troca de agente (Claude Code / Codex) em runtime sem perda de contexto — v1.0
- ✓ Troca de modelo por provider via registry de modelos — v1.0
- ✓ Carregamento de harness (CLAUDE.md, AGENTS.md, skills, hooks) aplicado ao system prompt — v1.0
- ✓ OAuth flow para Anthropic (Claude Code) — v1.1 (validado em Phase 6: auth URL exposto, credenciais persistidas, token OAuth aceito em /api/chat, conflito de porta 53692 tratado)

### Active

- [ ] OAuth flow para OpenAI (Codex)
- [ ] Coexistencia: usuario escolhe entre OAuth ou API Key por provider
- [ ] UI de conexao atualizada para suportar ambos os metodos

### Out of Scope

- Persistencia de conversas (banco de dados, historico) — POC in-memory only
- Autenticacao de usuario (login do app em si) — single-user, uso pessoal
- Deploy em producao — local-only
- Testes automatizados — POC de validacao tecnica
- Suporte mobile / responsividade refinada — desktop browser only
- Edicao de arquivos inline ou terminal integrado — fora do escopo do POC
- Gerenciamento de multiplas conversas simultaneas — uma conversa por vez
- OAuth flow completo como unico metodo — API Key deve coexistir (ADR-005 atualizado v1.1)
- Extended thinking display — v2 requirement
- Tool card expand/collapse — v2 requirement
- Tool execution timing — v2 requirement

## Current Milestone: v1.1 OAuth Authentication

**Goal:** Adicionar autenticacao OAuth como alternativa ao API Key para ambos os providers (Anthropic/Claude Code e OpenAI/Codex), mantendo coexistencia total com o fluxo existente.

**Target features:**
- OAuth flow para Anthropic (Claude Code)
- OAuth flow para OpenAI (Codex)
- Coexistencia: usuario escolhe entre OAuth ou API Key por provider
- UI de conexao atualizada para suportar ambos os metodos

## Context

**Shipped v1.0 MVP** com ~4,000 LOC TypeScript/React em 2 dias (50 commits).

**Tech stack validada:**
- Frontend: React 19 + Vite 6 + Tailwind 4 + shadcn/ui
- Backend: Hono 4 + @hono/node-server
- Core: @mariozechner/pi-ai + @mariozechner/pi-agent-core
- Streaming: SSE via fetch + ReadableStream (async generator pattern)
- Markdown: react-markdown + remark-gfm + react-shiki

**Conclusao tecnica:** A stack pi-ai + pi-agent-core e viavel para um produto de chat web. O streaming funciona bem, tool events fluem end-to-end, e o model/agent switching opera corretamente. Principais gaps para MVP: persistencia, multi-conversas, OAuth.

## Constraints

- **Stack:** pi-ai + pi-agent-core obrigatorios — sao o objeto de validacao
- **Infraestrutura:** Sem banco de dados, sem deploy, local-only
- **Usuarios:** Single-user (o proprio autor)
- **Seguranca:** API keys nao podem ser expostas no frontend (proxy obrigatorio)
- **Agent switching:** Nova instancia de Agent a cada troca (ADR-006), contexto via history

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SPA + Backend Proxy | APIs LLM nao permitem chamadas do browser; streamProxy existe para isso | ✓ Good |
| Hono como backend | Leve, TypeScript-first, streaming nativo, alinhado com pi-agent-core | ✓ Good |
| React local state (useReducer + Context) | POC simples, 1 usuario, sem persistencia, 3 telas | ✓ Good |
| SSE para streaming | Unidirecional server→client, nativo do browser, alinhado com AgentEvent | ✓ Good |
| API Key first, OAuth stretch | OAuth complexo demais para POC; API Key valida a stack igualmente | ✓ Good |
| Recreate Agent on switch | pi-agent-core nao suporta troca mid-session; nova instancia com history | ✓ Good |
| Segment-based message model | Permite tool cards inline interleaved com texto no mesmo AssistantMessage | ✓ Good |
| Promise anchor pattern para SSE | Evita que Hono feche stream prematuramente antes de agent_end | ✓ Good |
| subscribe() before prompt() | Garante que nenhum event e perdido durante o agent loop | ✓ Good |
| HarnessContext acima do Router | Harness state sobrevive navegacao entre /chat e /settings | ✓ Good |

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
*Last updated: 2026-04-05 after Phase 6 (Anthropic OAuth Flow) complete — PKCE flow working end-to-end, OAuth token validates against Anthropic API, Feb 2026 `sk-ant-oat*` ban risk did not materialise*
