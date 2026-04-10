# Define — Escopo: ACP como Runtime Alternativo no pi-ai-poc

**POC**: pi-ai-poc · **Data**: 2026-04-10 · **Fase**: 2/4 Define
**Upstream**: `.harn/docs/acp-research/01-DISCOVER.md`
**Pergunta respondida pelo Discover**: "ACP é melhor que PI pra rodar multi coding agents?" → **Sim, ACP é o protocolo desenhado pra isso**. Mas não substituir PI — coexistir como segundo runtime num toggle.

## 1. Problema (uma frase)

O pi-ai-poc hoje só sabe falar com um runtime (`pi-agent-core`, que ele mesmo implementa o agent loop). Precisa ganhar um segundo runtime — **ACP** — que spawna coding agents externos como subprocess (`claude-acp`, `codex-acp`, etc) e faz passthrough transparente dos eventos pra UI React existente, com toggle no frontend para trocar runtime por request.

## 2. Objetivo do POC (o que valida se merece ir adiante)

Ao final, um usuário consegue:
1. Abrir a UI, ver um toggle **PI ⇄ ACP**.
2. Quando ACP está ativo, escolher entre 2 coding agents externos (`claude-acp`, `codex-acp`) num segundo selector.
3. Mandar um prompt e ver, na mesma UI do POC, **streaming de texto + tool calls** vindo do agent externo.
4. Trocar de PI pra ACP mid-session (nova conversa) sem erro.
5. Abort (botão stop) mata o subprocess ACP limpo.

**Métrica de sucesso**: "consigo comparar visualmente o output do mesmo prompt em `pi-agent-core (Claude)` vs `claude-acp` vs `codex-acp` na mesma UI". Isso é o que a pergunta original do usuário pede: "compreender o que é melhor o Pi AI ou ACP".

## 3. Decisões bloqueadas (§7 do Discover virou §3 aqui)

### D1. Interface de runtime no backend

```ts
// src/server/agent/runtime.ts (novo)
export interface Runtime {
  prompt(opts: {
    message: string
    history?: AgentMessage[]
    signal: AbortSignal
  }): AsyncIterable<RuntimeEvent>
}

export type RuntimeEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; id: string; tool: string; params: unknown }
  | { type: "tool_update"; id: string; data: string }
  | { type: "tool_end"; id: string; result: string; status: "done" | "error" }
  | { type: "error"; message: string }
  | { type: "done" }
```

**Rationale**: é o **mínimo denominador comum** dos eventos que a UI já consome (via `src/server/lib/stream-adapter.ts` + `src/client/lib/stream-parser.ts`). AsyncIterable é mais simples que subscribe callback pra adapter ACP. Rotas SSE só precisam `for await … emit SSE`.

**Eventos ACP-exclusivos** (`plan`, `available_commands_update`, `current_mode_update`) **fora do escopo** do POC — serão tratados como no-op no `AcpRuntime` no primeiro corte.

### D2. Toggle — onde mora

- **Request body**, não header.
- Shape novo do body de `POST /api/chat`:
  ```ts
  {
    message: string
    history?: Message[]
    runtime: "pi" | "acp"          // novo
    // quando runtime === "pi":
    provider?: "anthropic" | "openai"
    model?: string
    // quando runtime === "acp":
    acpAgent?: "claude-acp" | "codex-acp"   // novo
  }
  ```
- Server ignora `provider`/`model` quando `runtime === "acp"` e vice-versa.
- **Rationale**: body é mais testável, sobrevive a CDN/proxy e o POC já envia JSON no body. Header só faria sentido se fosse config transversal, que não é.

### D3. Agents ACP do primeiro corte

- **`claude-acp`** (v0.26.0, `agentclientprotocol/claude-agent-acp`) — Anthropic.
- **`codex-acp`** (v0.11.1, `zed-industries/codex-acp`) — OpenAI.

**Por quê só estes dois**: (a) usuário já tem conta nos dois providers (o POC atual usa anthropic + openai); (b) são os dois maintainers oficiais/semi-oficiais; (c) cobrem os dois modelos mentais mais comuns; (d) POC ≠ production, 2 é suficiente pra validar a arquitetura.

**Fora do primeiro corte (Fase 2, se o POC valida)**: `gemini`, `cursor`, `pi-acp`, `goose`, `github-copilot-cli`.

### D4. Mapeamento ACP `session/update` → `RuntimeEvent`

| ACP `sessionUpdate` | `RuntimeEvent` | Observação |
|---|---|---|
| `agent_message_chunk` (content.type=text) | `text_delta` | delta = content.text |
| `agent_thought_chunk` | `thinking_delta` | delta = content.text |
| `tool_call` (primeira emissão) | `tool_start` | `id=toolCallId, tool=title, params=rawInput` |
| `tool_call_update` (status in_progress) | `tool_update` | `data = stringify(rawOutput \|\| content)` |
| `tool_call_update` (status completed) | `tool_end` + `status: "done"` | `result = stringify(content \|\| rawOutput)` |
| `tool_call_update` (status failed) | `tool_end` + `status: "error"` | |
| `plan` | **drop** (POC) | Logar em debug, não emitir |
| `available_commands_update` | **drop** (POC) | |
| `current_mode_update` | **drop** (POC) | |
| Erro JSON-RPC da conexão | `error` | `message = err.message` |
| `session/prompt` response recebido | `done` | Fim do turno |

**Nota**: `rawInput`/`rawOutput` são `Record<string, unknown>` na spec — precisa truncar a 10KB como o PI adapter já faz (`MAX_RESULT_LENGTH = 10240` em `stream-adapter.ts`).

### D5. Subprocess lifecycle

- **Spawn por request** (não pool persistente). POC single-user, não vale complexidade de pool.
- `child_process.spawn(binary, args, { stdio: 'pipe', env })`.
- `ClientSideConnection` via `ndJsonStream(proc.stdin, proc.stdout)` do `@agentclientprotocol/sdk`.
- Sequência: `initialize()` → `newSession({cwd: WORKSPACE_ROOT})` → `prompt()` → aguardar `PromptResponse`.
- **Abort**: `signal.addEventListener('abort', () => { proc.kill('SIGTERM'); setTimeout(()=>proc.kill('SIGKILL'), 2000); })`.
- **Timeout de hard cap**: 5 minutos por prompt. Se exceder, mesma sequência de kill.
- **stderr do subprocess**: logar em `console.error` com prefixo `[acp:${agent}]`, não propagar pra UI.
- Subprocess é descartado no fim do request. Próximo request = novo spawn. **Sem session/load, sem session/resume, sem session/fork** no primeiro corte.

### D6. Binários ACP — descoberta e auth

**Descoberta de binário**: hardcoded no `AcpRuntime` via mapa:
```ts
const ACP_AGENTS = {
  "claude-acp": { command: "claude-agent-acp", args: [] },
  "codex-acp":  { command: "codex-acp",        args: [] },
}
```
Usuário é responsável por ter o binário no PATH (`npm install -g @agentclientprotocol/claude-agent-acp` ou equivalente). Documentar no `.harn/docs/acp-research/00-SETUP.md`.

**Auth**: **não gerenciamos** — cada CLI ACP resolve do seu próprio cache (`~/.claude/` pro claude-agent-acp, `~/.codex/` pro codex-acp). O backend só passa `process.env` completo no `spawn`. Consequência: o usuário precisa já ter feito login nos dois CLIs antes de rodar o POC.

**Check de pré-requisitos**: novo endpoint `GET /api/runtime/acp/status` que faz `which` de cada binário conhecido e retorna `{ "claude-acp": true, "codex-acp": false }`. Frontend usa pra desabilitar opções no toggle.

### D7. Handling de `history`

- PI: já trata history (mantido entre requests pelo frontend, enviado no body).
- ACP: primeiro corte **não envia history** para o agent ACP — cada request é um novo `session/new` isolado. Agents ACP têm session/resume mas o POC não vai usá-lo agora.
- **Consequência**: em modo ACP, "conversa contínua" vira uma sequência de prompts isolados no primeiro corte. Documentar como limitação conhecida.

### D8. Frontend

- **Novo componente**: `<RuntimeToggle>` em `src/client/components/config/` — mesmo padrão do seletor de modelo existente.
- **Novo estado**: em `use-chat.ts`, adicionar `runtime: "pi" | "acp"` e `acpAgent` (quando ACP).
- **Disabled state**: se `GET /api/runtime/acp/status` retorna tudo `false`, toggle ACP fica disabled com tooltip "nenhum binário ACP encontrado no PATH".
- **UI dos novos eventos**: nenhuma mudança na UI de tool calls — o `stream-parser.ts` já consome `tool_start/update/end`. A UI nem sabe que a origem mudou.

## 4. Out of scope (explícito, pra não cair na tentação)

- ❌ Session/load, session/resume, session/fork ACP.
- ❌ Plan visualization, mode indicator, available commands.
- ❌ MCP servers via ACP (`mcpCapabilities`).
- ❌ Agent ACP em outra linguagem além de Node.
- ❌ Pool de subprocess / warm start.
- ❌ History passthrough para ACP.
- ❌ Integração com `gemini`, `cursor`, `pi-acp`, `goose`, `github-copilot-cli` (vira Fase 2 se POC valida).
- ❌ Testes E2E automatizados (manual smoke só).
- ❌ Métricas comparativas automáticas PI vs ACP (usuário compara visualmente).
- ❌ Persistência das sessões PI ou ACP (o POC é local-only, sem DB).

## 5. Requisitos (numerados, testáveis)

**R1** — Backend expõe `POST /api/chat` aceitando `runtime: "pi" | "acp"` no body. Request sem `runtime` cai no default `"pi"` (backwards compat).

**R2** — Quando `runtime === "pi"`, comportamento idêntico ao atual. Nenhuma regressão.

**R3** — Quando `runtime === "acp"` e `acpAgent === "claude-acp"`, backend spawn `claude-agent-acp`, chama `initialize` + `session/new` + `session/prompt`, mapeia `session/update` pra SSE, termina quando `prompt()` resolve.

**R4** — Mesma coisa de R3 pra `acpAgent === "codex-acp"`.

**R5** — Stream de texto do agent ACP chega na UI no mesmo formato que PI (`text_delta` SSE events). UI não distingue origem.

**R6** — Tool calls do agent ACP chegam na UI nos mesmos eventos `tool_start`/`tool_update`/`tool_end`, renderizados nos mesmos cards.

**R7** — Abort (botão stop) mata o subprocess ACP em até 2 segundos.

**R8** — Timeout de 5 minutos por request ACP — depois disso subprocess é morto e SSE `error` é emitido.

**R9** — Backend expõe `GET /api/runtime/acp/status` retornando `{ "claude-acp": boolean, "codex-acp": boolean }` baseado em `which`.

**R10** — Frontend tem `<RuntimeToggle>` que chama `/api/runtime/acp/status` no mount e desabilita opções indisponíveis.

**R11** — `runtime` e `acpAgent` são persistidos no localStorage (igual ao que `provider`/`model` já são hoje, se forem — senão sessão apenas).

**R12** — Erro ao spawnar subprocess ACP (binário ausente, crash) vira SSE `error` com mensagem legível na UI.

**R13** — stderr do subprocess ACP é logado no console do backend, nunca vazado pra UI.

**R14** — Subprocess é spawnado com `stdio: 'pipe'` e nunca com shell (evitar injection).

**R15** — Todos os bytes de `stdout` do subprocess passam por `ndJsonStream` antes de chegarem no `ClientSideConnection` (garantia de framing correto).

## 6. Plano de tarefas para Develop

Cada task é autônoma (pode ser um commit). Dependências entre `[]`.

| # | Task | Depende de |
|---|---|---|
| **T1** | Instalar `@agentclientprotocol/sdk` (`npm install @agentclientprotocol/sdk`). Verificar tipos. | — |
| **T2** | Criar `src/server/agent/runtime.ts` com a interface `Runtime` + tipo `RuntimeEvent` (D1). | — |
| **T3** | Refatorar rota atual `/api/chat` pra usar `Runtime.prompt()` em vez de chamar `createAgent` direto. Criar `PiRuntime` que embala o código atual (`createAgent` + `adaptAgentEvents`). Transformar o `adaptAgentEvents` em `AsyncIterable<RuntimeEvent>` internamente. **Nenhuma regressão visível no PI.** | T2 |
| **T4** | Criar `src/server/agent/acp-runtime.ts` com `AcpRuntime implements Runtime`. Spawn subprocess, `ClientSideConnection`, `initialize`/`newSession`/`prompt`, cleanup. Mapeamento `session/update` → `RuntimeEvent` conforme D4. | T1, T2 |
| **T5** | Configurar mapa `ACP_AGENTS` (D6) e exportar helper `isAcpAgentAvailable(name)` usando `which`/`fs.access`. | T4 |
| **T6** | Novo endpoint `GET /api/runtime/acp/status` em `src/server/routes/` (talvez novo arquivo `runtime.ts`). | T5 |
| **T7** | Atualizar `src/server/routes/chat.ts` pra ler `runtime` do body, selecionar `PiRuntime` ou `AcpRuntime`, passar `message` + `signal`. | T3, T4 |
| **T8** | Abort handling end-to-end: `stream.onAbort` → `controller.abort()` → `AcpRuntime` mata subprocess. Testar manualmente com prompt longo. | T7 |
| **T9** | Timeout de 5min no `AcpRuntime` usando `AbortSignal.timeout(300_000)` combinado com o signal da request. | T4 |
| **T10** | Criar `src/client/components/config/RuntimeToggle.tsx` com 2 botões (PI/ACP) + selector condicional de `acpAgent`. Fetch `/api/runtime/acp/status` no mount, disable opções indisponíveis. | T6 |
| **T11** | Atualizar `use-chat.ts` pra carregar `runtime` + `acpAgent` e enviar no body do POST. Persistência em localStorage opcional. | T10 |
| **T12** | Montar `<RuntimeToggle>` na UI, acima ou ao lado do seletor de modelo existente. | T11 |
| **T13** | Smoke test manual: (a) PI funciona idêntico ao antes; (b) ACP + claude-acp streama texto e mostra tool call; (c) ACP + codex-acp idem; (d) abort mata subprocess; (e) binário ausente mostra erro limpo na UI. Documentar no `.harn/docs/acp-research/03-SMOKE-TEST.md` durante Deliver. | T12 |
| **T14** | Doc curta `.harn/docs/acp-research/00-SETUP.md` explicando como instalar os CLIs `claude-agent-acp` e `codex-acp`, fazer login, e verificar que estão no PATH. | T6 (pelo endpoint status) |

## 7. Dependências externas / pré-requisitos do usuário

1. `claude-agent-acp` binário no PATH (instruções em `00-SETUP.md`, a ser criada na T14).
2. `codex-acp` binário no PATH.
3. Login já feito nos dois CLIs (o POC não gerencia auth deles).
4. Node 20+ (requisito do pi-agent-core já vigente).

## 8. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Binário ACP não existe ainda no NPM com esse nome | Média | Bloqueador | Verificar real na T1/T14; se nome diferir, atualizar o mapa `ACP_AGENTS` |
| Subprocess não encerra com SIGTERM | Baixa | UX ruim | SIGKILL após 2s, já em T8 |
| `session/update` emite tipos não mapeados que travam o parser | Baixa | Silent failure | `default` no switch loga warning e faz no-op, igual ao que o PI adapter faz |
| Nenhuma tool é chamada no claude-acp porque o POC não expõe tools ACP-side | Alta | UX degradada (só texto) | Primeiro corte aceita. Claude Code tem tools próprias built-in; ele usa as dele. Documentar. |
| 5min timeout curto pra tarefas reais de coding | Média | Interrupção incorreta | Aceitar pro POC; configurable depois |
| Latência do spawn por request degrada UX | Média | 200-500ms extra | Aceitar pro POC; pool vira Fase 2 |
| Tools do agent ACP (ex: `edit_file`) mexem no workspace real | **Alta** | **Dados** | `newSession({cwd: WORKSPACE_ROOT})` escopa mas o agent pode ter perms amplas. **Recomendação: spawn com `cwd` = um tempdir dedicado até entender perms de cada agent.** Adicionar a T4. |

## 9. Pergunta técnica aberta (pra debate gate)

O design prevê **subprocess por request**. Alternativa é **subprocess persistente por `acpAgent`** mantendo `session/prompt` repetido na mesma conexão. Trade-offs:

- **Por request**: simples, isolado, cold start ~200-500ms.
- **Persistente**: rápido em requests sucessivos, mas complica (a) mapa session↔subprocess, (b) reset quando troca agent, (c) cleanup no server shutdown.

**Default escolhido**: por request. Motivo: POC, simplicidade > latência. Confirmar no debate gate se o usuário quer questionar.

## 10. Cronograma rough

- T1–T9 (backend): ~3-4h de coding focado.
- T10–T12 (frontend): ~1-2h.
- T13–T14 (smoke + docs): ~1h.
- **Total**: ~5-7h de trabalho focado. Realista pra 1-2 sessões.

## Critério de saída do Define

- [x] Problema em 1 frase
- [x] Objetivo do POC verificável
- [x] 8 decisões bloqueadas com rationale
- [x] Out of scope explícito
- [x] 15 requisitos numerados e testáveis
- [x] Plano de tarefas numerado com dependências
- [x] Riscos identificados com mitigação
- [x] 1 pergunta aberta para debate gate

**Próximo passo**: Debate Gate adversarial (como solicitado no início do Embrace).
