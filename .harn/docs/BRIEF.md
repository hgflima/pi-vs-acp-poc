# POC: Pi AI Chat Web

> **Tipo:** Proof of Concept
> **Autor:** Henrique Lima
> **Data:** 2026-04-03
> **Prazo:** 2026-04-03 (2 horas)
> **Status:** Draft

---

## Hipótese

Acreditamos que o **pi-ai** (`@mariozechner/pi-ai`) + **pi-agent-core** (`@mariozechner/pi-agent-core`) são capazes de sustentar um **chat web com streaming em tempo real**, troca de agentes (Claude Code / Codex), troca de modelos, carregamento de harness e **visualização de tool calls** — de forma similar ao Claude.ai / ChatGPT.

---

## O Que Está Sendo Testado

**Tecnologia.** Especificamente, se a stack pi-ai + pi-agent-core consegue:

1. **Autenticação** — usar OAuth (subscription) ou API Key para se conectar ao Claude e/ou Codex
2. **Chat interativo** — conversar com o LLM em tempo real via streaming
3. **Agent switcher** — trocar entre Claude Code e Codex em runtime
4. **Model switcher** — trocar de modelo de acordo com o agente selecionado e a disponibilidade de modelos do provider
5. **Carregamento de harness** — carregar CLAUDE.md / AGENTS.md, skills, subagents, hooks e demais configurações
6. **Streaming em tempo real** — exibir tokens conforme chegam, com baixa latência
7. **Visualização de tools** — destacar visualmente tool calls (subagent, skill, bash, read, write, glob, grep, toolsearch, etc.) com UI diferenciada

---

## Escopo do POC

### Dentro do escopo

- App web com TypeScript + Tailwind CSS
- Integração com `@mariozechner/pi-ai` para autenticação (OAuth e API Key) e streaming
- Integração com `@mariozechner/pi-agent-core` para loop de agente e execução de tools
- UI de chat com streaming em tempo real (`stream()` / `AgentEvent`)
- Componente de agent switcher (Claude Code ↔ Codex)
- Componente de model switcher (modelos disponíveis por provider)
- Renderização visual diferenciada para cada tipo de tool call:
  - `bash` — bloco de terminal
  - `read` / `write` — bloco de arquivo com path
  - `glob` / `grep` — resultado de busca
  - `subagent` / `skill` — card expandível com status
  - `toolsearch` — lista de ferramentas
  - Demais tools — card genérico com nome + parâmetros + resultado
- Carregamento de harness (CLAUDE.md, AGENTS.md, skills, hooks)

### Fora do escopo

- Persistência de conversas (banco de dados, histórico)
- Autenticação de usuário (login do app em si)
- Deploy em produção
- Testes automatizados
- Suporte mobile / responsividade refinada
- Edição de arquivos inline ou terminal integrado
- Gerenciamento de múltiplas conversas simultâneas

---

## Critérios de Sucesso

| Critério | Como Medir | Alvo |
|----------|-----------|------|
| Autenticação funciona | Conectar via OAuth ou API Key no Claude/Codex | Login bem-sucedido em ambos |
| Chat com streaming | Enviar mensagem e ver tokens chegando em tempo real | Latência < 500ms para primeiro token |
| Agent switcher | Trocar entre Claude Code e Codex no meio da sessão | Troca funcional sem perda de contexto |
| Model switcher | Listar e trocar modelos disponíveis por provider | Modelos corretos por agente |
| Harness carregado | System prompt reflete CLAUDE.md / AGENTS.md | Harness visível no comportamento do LLM |
| Visualização de tools | Tool calls renderizadas com UI diferenciada | Pelo menos 5 tipos de tool com visual próprio |

---

## Audiência

Uso pessoal — o próprio autor. Validação técnica para decidir se a stack é viável para um produto futuro.

---

## Destino do Código

- [ ] Totalmente descartável
- [x] Pode servir de base para o MVP
- [ ] A definir após resultados

---

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | TypeScript + Tailwind CSS |
| LLM API | `@mariozechner/pi-ai` (stream, OAuth, model registry) |
| Agent framework | `@mariozechner/pi-agent-core` (Agent, agentLoop, tools, events) |
| Auth (LLM) | pi-ai OAuth (`loginAnthropic`, `loginOpenAICodex`) + API Key (`getEnvApiKey`) |
| Build | [a definir — Vite recomendado] |

### Conceitos-chave do pi-ai

- `stream(model, context)` → `AssistantMessageEventStream` com eventos: `text_delta`, `toolcall_start/delta/end`, `thinking_delta`, `done`
- `getModel(provider, modelId)` / `getModels(provider)` / `getProviders()` — registry de modelos
- OAuth: `loginAnthropic()`, `loginOpenAICodex()` → `OAuthCredentials`
- API Key: `getEnvApiKey(provider)` → string

### Conceitos-chave do pi-agent-core

- `Agent` class — loop de agente stateful com event subscriptions
- `AgentTool<TParams, TDetails>` — definição de tools com `execute()`, `beforeToolCall`, `afterToolCall`
- `AgentEvent` — eventos do ciclo: `agent_start/end`, `turn_start/end`, `tool_execution_start/update/end`
- `streamProxy` — proxy para apps browser rotearem chamadas LLM via backend

---

## Próximos Passos

| Cenário | Ação |
|---------|------|
| POC bem-sucedido | Evoluir para MVP — adicionar persistência, múltiplas conversas, auth de usuário, responsividade |
| POC falhou | Avaliar se o problema é na stack (pi-ai/pi-agent-core) ou na abordagem; considerar alternativas (Vercel AI SDK, LangChain.js) |
| Resultado inconclusivo | Isolar o ponto de falha — testar streaming, tools e auth separadamente |
