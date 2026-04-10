# Discover — PI vs ACP para Multi-Coding-Agent Transparente

**POC**: pi-ai-poc · **Data**: 2026-04-10 · **Fase**: 1/4 Discover
**Pergunta central**: O que é melhor para rodar múltiplos coding agents de forma transparente — `@mariozechner/pi-agent-core` (atual) ou ACP (Agent Client Protocol da Zed)?

## TL;DR

**Eles não são concorrentes — são camadas diferentes.** PI (pi-agent-core) é um *framework para construir* um agent in-process. ACP é um *protocolo JSON-RPC* para *falar com* coding agents externos (Claude, Codex, Gemini CLI, Cursor, pi-cli etc.). Para o objetivo "rodar múltiplos coding agents transparentemente", **ACP é a resposta natural**: já existe um registry oficial com 27 agents, incluindo Claude, Codex, Gemini, Cursor, goose, Copilot e inclusive `pi-acp`. PI continua útil como runtime "custom agent com tools próprias", e pode coexistir como segunda opção do toggle.

## 1. O que é cada coisa (arquitetura real)

### PI stack (`@mariozechner/pi-*`, github.com/badlogic/pi-mono, v0.66.1)

Monorepo com 4 packages relevantes:

| Package | Papel | Relação com o POC |
|---|---|---|
| `@mariozechner/pi-ai` | API LLM unificada (Anthropic, OpenAI, Google, Mistral, Bedrock, Vertex, Gemini CLI, Codex Responses). Só transporte HTTP + normalização de tipos. | Dependência direta |
| `@mariozechner/pi-agent-core` | Agent runtime stateful com tool loop, state management e event streaming. Construído sobre pi-ai. **Não orquestra agents externos — ele próprio é o agent.** | **É o runtime atual do POC** (`src/server/agent/setup.ts`) |
| `@mariozechner/pi-coding-agent` (`pi` CLI) | Produto final: CLI coding agent com tools `read/bash/edit/write`. Usa pi-agent-core por baixo. | Não usado no POC |
| `@mariozechner/pi-tui` | TUI library para CLIs. | Não usado |

**Conclusão PI**: `pi-agent-core` é o motor pra construir *um* agent (loop LLM + tools), não pra *orquestrar vários*. É a base do `pi` CLI, não um switchboard.

### ACP (Agent Client Protocol, Zed Industries)

- **Spec**: https://agentclientprotocol.com — protocolo JSON-RPC, transport padrão é stdio (newline-delimited JSON).
- **Analogia**: "LSP para coding agents". Editor/client fala JSON-RPC com um agent subprocess.
- **Métodos principais**: `initialize`, `session/new`, `session/load`, `session/resume`, `session/fork`, `session/prompt`.
- **Notificações de streaming (`session/update`)**: `agent_message_chunk`, `agent_thought_chunk`, `user_message_chunk`, `tool_call`, `tool_call_update` (com `status: pending|in_progress|completed|failed`, `kind: read|edit|delete|move|search|execute|think|fetch|switch_mode|other`), `plan`, `available_commands_update`, `current_mode_update`.
- **SDK oficial TS**: `@agentclientprotocol/sdk` (NPM). Classes `ClientSideConnection` (pra quem fala com agent) e `AgentSideConnection` (pra quem é o agent). Função `ndJsonStream(out, in)` plumba stdio → stream.
- **Registry oficial** (https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json): **27 agents ACP-nativos em abril/2026** — veja §3.
- **Maturidade**: v1.0 adotada (RFD rust-sdk-v1 migrou do sacp project). Spec e SDK TS estáveis, múltiplos implementadores.

## 2. Comparativo lado a lado

| Dimensão | **PI (pi-agent-core)** | **ACP (@agentclientprotocol/sdk)** |
|---|---|---|
| **Categoria** | Framework de agent in-process | Protocolo JSON-RPC entre client e agent externo |
| **Papel no POC** | Runtime embutido: o backend *é* o agent | Transport: backend spawn subprocess e fala JSON-RPC |
| **Modelo de execução** | Loop `prompt → LLM call → tool exec → loop` no próprio Node.js | Agent roda como processo separado (qualquer linguagem), comunica via stdin/stdout |
| **Multi-agent (vários coding agents)** | **Não** — pi-agent-core é um agent único. Switching = nova instância, mesma classe | **Sim, nativo** — um `ClientSideConnection` por agent subprocess. Troca = spawn de outro binário |
| **Adapters para Claude Code / Codex / Gemini / Cursor / Copilot / pi** | Inexistente. Você integra via `pi-ai` (API key do provider) mas *não* é o coding agent deles, é o seu agent usando o LLM deles | **Registry oficial com 27 agents**: `claude-acp`, `codex-acp`, `gemini`, `cursor`, `github-copilot-cli`, `goose`, `opencode`, `pi-acp`, etc. |
| **Transparência de tool calls** | Eventos `tool_execution_start/update/end` via `agent.subscribe()` (já mapeado em `src/server/lib/stream-adapter.ts`) | `session/update` com `sessionUpdate: "tool_call"` + updates incrementais com `kind` semântico (read/edit/execute/…) e `status` |
| **Streaming de texto** | `message_update` com `assistantMessageEvent.type = "text_delta" \| "thinking_delta"` | `agent_message_chunk` e `agent_thought_chunk` (ContentBlock) |
| **Session lifecycle** | Implícito no ciclo de vida da instância `Agent` | Explícito: `initialize → session/new → session/prompt`, + `session/load`, `session/resume`, `session/fork` |
| **Capabilities negotiation** | Não aplicável | `InitializeResponse.agentCapabilities` declara `loadSession`, `promptCapabilities` (image/audio/embeddedContext), `mcpCapabilities` |
| **Plan visualization** | Não nativo | `sessionUpdate: "plan"` com entries (content/priority/status) |
| **Auth** | O POC já faz: API key via backend proxy + OAuth refresh (`src/server/lib/credentials.ts`) | Agent subprocess herda credenciais do seu próprio setup (cada binário tem seu fluxo) |
| **MCP tools** | Não expõe MCP; as tools são custom (`src/server/agent/tools.ts`) | `mcpCapabilities` e `mcp-over-acp` RFD permitem rodar MCP servers transport=acp |
| **Maturidade** | v0.66.1 — ativo, único maintainer (Mario Zechner), repo com 33.9k stars | v1.0 (Rust SDK), SDK TS publicado, registry CDN oficial, múltiplos implementadores grandes (Zed, Google Gemini CLI, Cursor, JetBrains, Anthropic) |
| **Lock-in** | Alto no API de `Agent` e tipos `pi-ai` | Baixo — protocolo é aberto, qualquer agent que fale JSON-RPC stdio serve |
| **DX no POC atual** | Já integrado, streaming adapter existente, funcionando em `src/server/routes/chat.ts` | Precisa adicionar: nova rota, nova classe Runtime, subprocess manager, mapeamento de `session/update` → SSE |
| **Risco** | Single-maintainer, versão 0.x | Protocolo novo; spec pode evoluir (mas SDK é versionado) |

## 3. Agents já ACP-compatíveis (registry oficial, abril/2026)

27 entries em `cdn.agentclientprotocol.com/registry/v1/latest/registry.json`. Os mais relevantes pra esta POC:

| Agent | id | versão | Repo |
|---|---|---|---|
| **Claude Agent** (Anthropic) | `claude-acp` | 0.26.0 | `agentclientprotocol/claude-agent-acp` |
| **Codex CLI** (OpenAI) | `codex-acp` | 0.11.1 | `zed-industries/codex-acp` |
| **Gemini CLI** (Google) | `gemini` | 0.37.0 | `google-gemini/gemini-cli` |
| **Cursor** | `cursor` | 2026.03.30 | `cursor.com/docs/cli/acp` |
| **GitHub Copilot** | `github-copilot-cli` | 1.0.21 | `github/copilot-cli` |
| **goose** (Block) | `goose` | 1.30.0 | `block/goose` |
| **OpenCode** | `opencode` | 1.4.1 | `anomalyco/opencode` |
| **pi ACP** (!) | `pi-acp` | 0.0.25 | `svkozak/pi-acp` |
| **Junie** (JetBrains) | `junie` | 1321.57.0 | `JetBrains/junie` |
| **Mistral Vibe** | `mistral-vibe` | 2.7.3 | `mistralai/mistral-vibe` |
| **Qwen Code** | `qwen-code` | 0.14.2 | `QwenLM/qwen-code` |
| **Kimi CLI** (Moonshot) | `kimi` | 1.30.0 | `MoonshotAI/kimi-cli` |
| **Amp** | `amp-acp` | 0.7.0 | `tao12345666333/amp-acp` |
| **Cline** | `cline` | 2.13.0 | `cline/cline` |
| **Factory Droid** | `factory-droid` | 0.97.0 | `factory.ai` |
| **DeepAgents** (LangChain) | `deepagents` | 0.1.7 | `langchain-ai/deepagentsjs` |

**Notável**:
- **Não encontrados no registry oficial**: Aider (projeto próprio, sem adapter ACP ativo).
- **`pi-acp` já existe** (v0.0.25) — o próprio pi do Mario tem adapter ACP mantido por terceiro (svkozak). Significa que, via ACP, você pode *até rodar o mesmo pi* como agent externo.

## 4. Transparência para a UI React (o critério do usuário)

O POC tem UI em React mostrando stream de texto + cards de tool calls. O que cada runtime expõe:

### PI expõe (via `agent.subscribe()` + `stream-adapter.ts`)
- `message_update` → `text_delta`, `thinking_delta`
- `tool_execution_start/update/end` com `toolName`, `args`, `result`, `isError`
- `agent_end` → SSE `done`

### ACP expõe (via `session/update` notification)
- `agent_message_chunk` → texto
- `agent_thought_chunk` → raciocínio (sem precisar habilitar; vem se o agent emite)
- `tool_call` → `{toolCallId, title, kind, status, locations, content, rawInput, rawOutput}`
- `tool_call_update` → delta do mesmo call (status progressivo)
- `plan` → array de `PlanEntry {content, priority, status}` — **feature que PI não tem nativa**
- `available_commands_update` → agent anuncia comandos disponíveis dinamicamente
- `current_mode_update` → modo atual (edit/read-only/…)

**ACP é estritamente mais rico** para uma UI de coding agent: planos, modos, comandos, location pointers em tool calls, content blocks (image/audio/embedded).

## 5. Padrão de integração (Hono + toggle no frontend)

Arquitetura alvo para coexistência:

```
┌─ React (Vite 5173) ──────────────────────────┐
│  toggle: runtime = "pi" | "acp"              │
│  header: X-Runtime ou body.runtime           │
└───────────────────┬──────────────────────────┘
                    │ POST /api/chat  (SSE)
┌───────────────────▼──────────────────────────┐
│  Hono backend (3001)                         │
│  src/server/routes/chat.ts                   │
│  ┌────────────────────────────────────────┐  │
│  │ interface Runtime {                    │  │
│  │   prompt(msg, stream): Promise<void>   │  │
│  │   abort(): void                        │  │
│  │ }                                      │  │
│  └───┬────────────────────────────┬───────┘  │
│      │ pi                          │ acp      │
│  ┌───▼─────────────────┐   ┌──────▼────────┐ │
│  │ PiRuntime           │   │ AcpRuntime    │ │
│  │ (existente)         │   │ (novo)        │ │
│  │ pi-agent-core       │   │ spawns:       │ │
│  │ Agent + tools       │   │  claude-acp,  │ │
│  │                     │   │  codex-acp,   │ │
│  │                     │   │  gemini, …    │ │
│  │                     │   │ via           │ │
│  │                     │   │ ClientSideCon │ │
│  │                     │   │ nection       │ │
│  └─────────────────────┘   └───────────────┘ │
└──────────────────────────────────────────────┘
```

### Decisões de design chave

1. **Interface comum (`Runtime`)**: mínima — `prompt(msg, stream, signal)` + `abort()`. Cada runtime normaliza seus eventos para o **mesmo formato SSE** que a UI já consome (`text_delta`, `thinking_delta`, `tool_start/update/end`, `error`, `done`).
2. **Onde vive o toggle**: `body.runtime: "pi" | "acp"` no request de `/api/chat` (ou header `X-Runtime`). Sem sessão — cada request é isolada (o POC já trata assim: nova instância a cada troca de agent/model).
3. **Mapeamento ACP → SSE existente**:
   - `agent_message_chunk` → `text_delta`
   - `agent_thought_chunk` → `thinking_delta` (já suportado pelo adapter)
   - `tool_call` → `tool_start`
   - `tool_call_update` → `tool_update` (usar `status` como progresso)
   - última `tool_call_update` com `status: completed|failed` → `tool_end`
   - `plan`, `available_commands_update`, `current_mode_update` → **novos eventos SSE** (`plan`, `commands`, `mode`) que a UI pode ignorar inicialmente e depois renderizar.
4. **Spawn do agent ACP**: `child_process.spawn(command, args, { stdio: 'pipe' })` + `ClientSideConnection` via `ndJsonStream(proc.stdin, proc.stdout)`. Cleanup: `stream.onAbort()` mata o subprocess.
5. **Seleção de agent ACP**: `body.acpAgent: "claude-acp" | "codex-acp" | "gemini" | "cursor" | "pi-acp" | ...`. Lê config do registry local ou hardcoded para POC.
6. **Credenciais**: cada agent ACP tem seu próprio fluxo (Claude CLI já logado, `gemini` já logado, etc). O backend só encaminha `env` apropriado no `spawn`.

### Riscos específicos para o POC

- **Install burden**: pra testar 5 ACP agents o usuário precisa ter 5 CLIs instaladas e logadas. Mitigação: começar com 2 (`claude-acp` e `codex-acp`) que o usuário já tem contas.
- **Subprocess lifecycle**: agent ACP pode travar. Precisa timeout + kill + cleanup no `onAbort`.
- **Normalização de tool calls**: ACP tem `kind` semântico rico; PI tem só `toolName`. A UI pode ignorar `kind` inicialmente.
- **Plan/commands/mode**: novos conceitos. Decisão: ignorar no primeiro corte, emitir SSE mas não renderizar, até ter um agent que os emita de verdade.

## 6. Tradeoffs para POC local single-user

| Critério | PI | ACP |
|---|---|---|
| Setup overhead | Baixo (já integrado) | Médio (spawn subprocess, 1 CLI por agent) |
| Maturidade | v0.66.1, ativo, single-maintainer | Spec v1, múltiplos grandes implementadores |
| Lock-in | Alto (API do `Agent`) | Baixo (protocolo aberto) |
| Escopo coberto | "Um agent customizado que você escreve" | "Qualquer coding agent compatível no mercado" |
| Pra *comparar* coding agents | ❌ Inadequado — todos seriam "variantes do pi-agent-core com prompts diferentes" | ✅ Ideal — cada botão spawn um produto real (Claude vs Codex vs Gemini CLI vs Cursor vs pi) |
| Risco de churn de API | Médio (v0.x) | Baixo-médio (spec estabilizando) |

## 7. Recomendação

**Adicionar ACP como runtime alternativo, NÃO como substituto.**

1. **Manter PI** como runtime "custom": o backend que *é* o agent, com as tools do POC (`src/server/agent/tools.ts`). Cobre o caso "quero experimentar fluxos custom".
2. **Adicionar ACP** como runtime "pluggable": o backend que *fala com* coding agents externos. Cobre o caso real do usuário — "o que eh melhor para rodar de forma transparente multi coding agents?".
3. **Toggle** no frontend: `runtime: pi | acp` + (quando `acp`) `acpAgent: claude-acp | codex-acp | gemini | ...`.
4. **Mapeamento** dos eventos ACP para o formato SSE que a UI já consome, estendendo o `stream-adapter` com um irmão `acp-stream-adapter`.
5. **Fase 1 (POC mínimo)**: suportar 2 ACP agents — `claude-acp` e `codex-acp`. Validar que o toggle funciona, que o streaming vem limpo, que abort encerra o subprocess. Fase 2: adicionar `gemini`, `cursor`, `pi-acp`.

**Veredito direto**: para "rodar multi coding agents transparentemente", **ACP é a escolha técnica certa** — é literalmente o protocolo desenhado para isso, tem 27 agents já compatíveis, UI exposure é mais rica (plan/commands/mode/kind). PI continua valioso como runtime "custom" para comparação lado-a-lado (é o diferencial do POC: "olha como fica quando *eu escrevo* o agent vs. quando eu *plugo* o Claude/Codex/Gemini").

## Fontes

- Context7 `/agentclientprotocol/agent-client-protocol` (spec oficial, schema, RFDs, session model, session/update types)
- Context7 `/websites/zed-industries_github_io_agent-client-protocol` (TypeScript SDK API — ClientSideConnection, AgentSideConnection, ndJsonStream, SessionNotification interface)
- `cdn.agentclientprotocol.com/registry/v1/latest/registry.json` (registry oficial, 27 agents)
- `gh api repos/badlogic/pi-mono` (estrutura monorepo, versões, package.json de pi-ai / pi-agent-core / pi-coding-agent)
- Código do POC: `src/server/agent/setup.ts`, `src/server/agent/harness.ts`, `src/server/routes/chat.ts`, `src/server/lib/stream-adapter.ts`

## Notas de método

- Tentativa de dispatch via `orchestrate.sh` (plugin octo): **bug** (`mv: rename .tmp.X to :`) — ferramenta falhou.
- Tentativa de probes paralelos Codex CLI: processos terminam mid-websearch sem produzir resultado. Gemini CLI: idem (0 bytes).
- Pivot: Context7 (multi-source docs, reputation High) + WebFetch do registry oficial + `gh api` para pi-mono. Dados canônicos, sem especulação.
