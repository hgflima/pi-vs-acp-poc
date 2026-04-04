# Requirements: Pi AI Chat Web

**Defined:** 2026-04-03
**Core Value:** Provar que pi-ai + pi-agent-core sustentam um chat web com streaming, tool calls e agent switching

## v1 Requirements

Requirements para a validacao tecnica. Cada um mapeia para fases do roadmap.

### Foundation

- [x] **FOUND-01**: Projeto scaffolded com Vite + React 19 + Tailwind 4 + shadcn/ui + TypeScript
- [x] **FOUND-02**: Backend Hono com endpoints skeleton e proxy config do Vite
- [x] **FOUND-03**: Tipos compartilhados (Message, SSEEvent, ToolCardVariant, AppState)
- [ ] **FOUND-04**: Spike de validacao da API pi-agent-core (event types, subscribe, stream lifecycle)

### Authentication

- [ ] **AUTH-01**: Usuario pode conectar ao provider via API Key (Anthropic ou OpenAI)
- [x] **AUTH-02**: Backend valida a API Key com request de teste ao provider
- [ ] **AUTH-03**: Credenciais armazenadas in-memory no servidor (nunca expostas ao frontend)
- [x] **AUTH-04**: Feedback visual de conexao (conectando, conectado, erro)
- [ ] **AUTH-05**: Tela de conexao com selecao de provider e campo de API Key

### Streaming Chat

- [x] **CHAT-01**: Usuario pode enviar mensagem e ver tokens chegando em tempo real via streaming
- [x] **CHAT-02**: Backend executa agent loop via pi-agent-core e emite AgentEvents como SSE
- [x] **CHAT-03**: Frontend parseia SSE stream via fetch + ReadableStream (nao EventSource)
- [x] **CHAT-04**: Respostas renderizadas em Markdown com syntax highlighting em code blocks
- [x] **CHAT-05**: Indicador de "pensando..." antes do primeiro token (latencia < 500ms)
- [x] **CHAT-06**: Botao de stop generation que aborta o stream via AbortController
- [x] **CHAT-07**: Auto-scroll para baixo durante streaming, pause quando usuario scrolla para cima
- [x] **CHAT-08**: Diferenciacao visual entre mensagens do usuario e do assistant
- [x] **CHAT-09**: Error handling inline com botao de retry
- [x] **CHAT-10**: Input de mensagem com Enter para enviar e Shift+Enter para newline

### Tool Call Visualization

- [x] **TOOL-01**: Tool calls renderizadas com UI diferenciada por tipo durante streaming
- [x] **TOOL-02**: Card de `bash` com visual de terminal (comando + output)
- [x] **TOOL-03**: Card de `read`/`write` com path destacado e conteudo com syntax highlighting
- [x] **TOOL-04**: Card de `glob`/`grep` com resultados de busca formatados
- [x] **TOOL-05**: Card de `subagent`/`skill` com nome e status (running/done/error)
- [x] **TOOL-06**: Card de `toolsearch` com lista de ferramentas encontradas
- [x] **TOOL-07**: Card generico para tools desconhecidos (nome + params JSON + resultado)
- [x] **TOOL-08**: Pelo menos 6 tipos de tool com visual proprio

### Agent Switching

- [ ] **AGENT-01**: Switcher na interface para trocar entre Claude Code e Codex
- [x] **AGENT-02**: Troca de agente cria nova instancia de Agent (ADR-006) com history como contexto
- [ ] **AGENT-03**: Indicador visual do agente ativo
- [ ] **AGENT-04**: Se o provider do agente selecionado nao estiver autenticado, solicitar auth

### Model Switching

- [x] **MODEL-01**: Dropdown com modelos disponiveis para o provider ativo (via getModels)
- [ ] **MODEL-02**: Troca de modelo atualiza proximas interacoes
- [x] **MODEL-03**: Lista de modelos atualiza ao trocar de agente/provider
- [ ] **MODEL-04**: Indicador visual do modelo ativo

### Harness Loading

- [ ] **HARN-01**: Interface para selecionar/apontar arquivos de harness (CLAUDE.md, AGENTS.md, skills, hooks)
- [x] **HARN-02**: Backend carrega e aplica harness ao system prompt do agente
- [ ] **HARN-03**: Indicador visual de que o harness esta ativo
- [x] **HARN-04**: Error handling para arquivo nao encontrado, formato invalido, harness muito grande

## v2 Requirements

Deferred para apos validacao do POC. Tracked mas nao no roadmap atual.

### Enhanced Tool UX

- **TOOLX-01**: Tool cards expansiveis com expand/collapse (resumo colapsado, detalhes expandidos)
- **TOOLX-02**: Progresso em tempo real de tools via tool_execution_start/update/end com spinner
- **TOOLX-03**: Timing de execucao por tool card

### Extended Thinking

- **THINK-01**: Display de thinking_delta em accordion colapsavel
- **THINK-02**: Auto-collapse quando thinking termina e text generation comeca

### OAuth

- **OAUTH-01**: OAuth flow para Anthropic (loginAnthropic)
- **OAUTH-02**: OAuth flow para OpenAI Codex (loginOpenAICodex)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Persistencia de conversas (DB) | POC in-memory only; nao valida a stack |
| Multi-conversas simultaneas | Complexidade de UI/routing sem valor de validacao |
| Auth de usuario (login do app) | Single-user, uso pessoal |
| Deploy em producao | Local-only |
| Testes automatizados | POC de validacao tecnica, prazo curto |
| Mobile / responsividade | Desktop browser only |
| Edicao inline de arquivos | Valida hipotese diferente (code editor UX) |
| RAG / upload de documentos | Valida retrieval pipelines, nao a stack pi-ai |
| Voice / audio / TTS | Irrelevante para POC de text-based agent |
| Conversation branching | Complexidade de state management sem valor |
| Plugin / extension system | Preocupacao de produto, nao de POC |
| Artifacts / side panel | Valida code execution UX, nao streaming/tools |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Pending |
| CHAT-01 | Phase 2 | Complete |
| CHAT-02 | Phase 2 | Complete |
| CHAT-03 | Phase 2 | Complete |
| CHAT-04 | Phase 2 | Complete |
| CHAT-05 | Phase 2 | Complete |
| CHAT-06 | Phase 2 | Complete |
| CHAT-07 | Phase 2 | Complete |
| CHAT-08 | Phase 2 | Complete |
| CHAT-09 | Phase 2 | Complete |
| CHAT-10 | Phase 2 | Complete |
| TOOL-01 | Phase 3 | Complete |
| TOOL-02 | Phase 3 | Complete |
| TOOL-03 | Phase 3 | Complete |
| TOOL-04 | Phase 3 | Complete |
| TOOL-05 | Phase 3 | Complete |
| TOOL-06 | Phase 3 | Complete |
| TOOL-07 | Phase 3 | Complete |
| TOOL-08 | Phase 3 | Complete |
| AGENT-01 | Phase 4 | Pending |
| AGENT-02 | Phase 4 | Complete |
| AGENT-03 | Phase 4 | Pending |
| AGENT-04 | Phase 4 | Pending |
| MODEL-01 | Phase 4 | Complete |
| MODEL-02 | Phase 4 | Pending |
| MODEL-03 | Phase 4 | Complete |
| MODEL-04 | Phase 4 | Pending |
| HARN-01 | Phase 4 | Pending |
| HARN-02 | Phase 4 | Complete |
| HARN-03 | Phase 4 | Pending |
| HARN-04 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after roadmap creation (4-phase coarse structure)*
