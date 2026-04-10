# Handoff — ACP Runtime Integration

**Data**: 2026-04-10
**Commit base**: `2712e7a0 feat(acp): add ACP runtime as alternative to PI (backend)`
**Branch**: `main`

## Leia antes de começar

1. `.harn/docs/acp-research/02-DEFINE.md` — arquitetura, decisões D1-D8, requisitos R1-R15, plano T1-T14
2. `.harn/docs/acp-research/02b-DEBATE-GATE.md` — overturns do gate (D5, D6, D7) + requisitos adicionais R16-R20 + subtasks T4b/T4c/T5b/T7b
3. `.harn/docs/acp-research/01-DISCOVER.md` (opcional) — pesquisa Pi AI vs ACP original

## Estado atual

**Backend completo e commitado (T1-T9 + T4b/T4c/T5b/T7b/R16-R20).**

Arquivos criados:
- `src/server/agent/runtime.ts` — interface `Runtime` + union `RuntimeEvent`
- `src/server/agent/pi-runtime.ts` — `PiRuntime` (embala `createAgent`, traduz `AgentEvent` → `RuntimeEvent`)
- `src/server/agent/acp-runtime.ts` — `AcpRuntime` (spawn, tempdir, stall detection 60s, kill cascade, history replay)
- `src/server/agent/acp-agents.ts` — loader `.harn/config/acp-agents.json` → `ACP_AGENTS_JSON` → fallback hardcoded, `isAcpAgentAvailable()`, `getAcpAgentsStatus()`
- `src/server/lib/runtime-sse.ts` — writer `RuntimeEvent` → SSE
- `src/server/routes/runtime.ts` — `GET /api/runtime/acp/status`

Arquivos modificados:
- `src/server/routes/chat.ts` — refatorado para `Runtime` + validação discriminated union (R16)
- `src/server/index.ts` — wire de `/api/runtime`
- `package.json` + `package-lock.json` — `@agentclientprotocol/sdk@^0.18.2`

**Verificação**:
- `npx tsc --noEmit` ✅
- `npm run build` ✅

## Tasks pendentes (frontend + smoke)

**Ordem sugerida:**

### T10 — `<RuntimeToggle>` (frontend)
Criar `src/client/components/config/RuntimeToggle.tsx`:
- 2 botões: PI / ACP
- Quando ACP ativo: selector adicional de `acpAgent`
- Fetch `GET /api/runtime/acp/status` no mount
- Desabilitar opções ACP cujo status = `false`
- Mesmo padrão visual do seletor de modelo existente em `src/client/components/config/`

### T11 — Estender `use-chat.ts`
`src/client/hooks/use-chat.ts`:
- Adicionar estado `runtime: "pi" | "acp"` + `acpAgent?: string`
- Incluir `runtime` (e `acpAgent` quando aplicável) no body do `POST /api/chat`
- Quando `runtime === "pi"`, continuar enviando `provider` + `model` como hoje
- Persistência em localStorage opcional (mesmo padrão do resto do app)

### T12 — Montar `<RuntimeToggle>` na UI
Onde o seletor de modelo atual é renderizado. Checar `src/client/components/config/` pra identificar o container.

### T13 — Smoke test manual
Validar cada fluxo e documentar em `.harn/docs/acp-research/03-SMOKE-TEST.md`:
- [ ] PI funciona idêntico ao antes (nenhuma regressão)
- [ ] ACP + `claude-acp` streama texto + mostra tool call
- [ ] ACP + `codex-acp` streama idem
- [ ] Abort (botão stop) mata subprocess em <2s
- [ ] Binário ACP ausente → erro limpo na UI

### T14 — `00-SETUP.md`
Documentar em `.harn/docs/acp-research/00-SETUP.md`:
- Como instalar `claude-agent-acp` (provavelmente `npm i -g`; **validar o nome real do pacote na hora**)
- Como instalar `codex-acp`
- Como fazer login nos dois CLIs
- Como verificar que estão no PATH (`which claude-agent-acp`, `which codex-acp`)
- Como customizar via `.harn/config/acp-agents.json` (shape documentado no `acp-agents.ts`)

## Gotchas descobertos (que não estão nos docs DEFINE/DEBATE)

### 1. `ndJsonStream` usa Web Streams, não Node streams
O SDK `@agentclientprotocol/sdk@0.18.2` recebe `ReadableStream<Uint8Array>` + `WritableStream<Uint8Array>`. Precisa converter os `child_process` Node streams:
```ts
import { Readable, Writable } from "node:stream"
const writable = Writable.toWeb(proc.stdin!) as WritableStream<Uint8Array>
const readable = Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>
const stream = ndJsonStream(writable, readable)
```
Isso já está feito em `acp-runtime.ts` — mencionado aqui pra quem for debugar.

### 2. `Client.sessionUpdate` é **notification** (void)
O lado cliente implementa `Client` interface. O método que recebe os `session/update` é `sessionUpdate(params: SessionNotification): Promise<void>` — não tem return value, só empurra pra queue interna.

### 3. `client.requestPermission` — auto-approve no POC
O SDK exige implementação. `acp-runtime.ts` seleciona a primeira opção automaticamente. Reconsiderar se o agent do Claude começar a pedir permissão em excesso.

### 4. Nomes de binários NÃO validados
O mapa default em `acp-agents.ts`:
```ts
"claude-acp": { command: "claude-agent-acp", args: [] }
"codex-acp": { command: "codex-acp", args: [] }
```
**Não foi validado ao vivo** se esses são os executables corretos após `npm i -g`. **Validar durante T14/T13** — se estiverem errados, basta criar `.harn/config/acp-agents.json` com os nomes reais, não precisa recompilar.

### 5. Tempdir vazio pode fazer agents falharem com "nothing to do"
Risco documentado no DEFINE (tabela §8). Se durante T13 o agent Claude Code não produzir nada, popular o tempdir com 1-2 arquivos dummy antes do spawn (1 `README.md` + 1 `hello.js` já bastam pra ele ter algo pra ler).

### 6. Memória de sessão anterior estava errada
A observação #67 dizia que o SDK já estava instalado, mas não estava — foi necessário reinstalar nesta sessão. Se a memória indicar algo como "já feito", **confirme no filesystem** antes de pular.

## Primeiro passo ao retomar

```bash
cd /Users/henriquelima/Documents/dev/personal/pi-ai-poc
git log --oneline -5    # Confirmar que 2712e7a0 é HEAD
ls src/client/components/config/   # Entender o padrão do seletor de modelo
```

Depois leia `src/client/components/config/` (provavelmente há um `ModelSelector.tsx` ou similar) e `src/client/hooks/use-chat.ts` para saber exatamente como o atual seletor envia os dados — e replique o padrão no `<RuntimeToggle>`.

## Contrato backend ↔ frontend

O body novo de `POST /api/chat`:
```ts
// runtime = "pi" (default, compat)
{ message: string, runtime?: "pi", provider: "anthropic"|"openai", model: string, history?: AgentMessage[] }

// runtime = "acp"
{ message: string, runtime: "acp", acpAgent: string, history?: AgentMessage[] }
```

Validação discriminated union é feita em `chat.ts:validateChatBody`. 400 em caso de body inválido com mensagem específica.

`GET /api/runtime/acp/status` retorna:
```ts
{ [agentId: string]: boolean }   // ex: { "claude-acp": true, "codex-acp": false }
```
