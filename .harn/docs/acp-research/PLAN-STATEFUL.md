# Plan — ACP Stateful Sessions

**Created:** 2026-04-10
**Source handoff:** `.harn/docs/acp-research/HANDOFF-STATEFUL.md`
**Status:** done (code complete on branch `feat/acp-stateful`, manual smoke tests deferred — see SUMMARY-STATEFUL.md)
**Branch:** `feat/acp-stateful`

> Cada phase abaixo é **self-contained**: tem documentação citada com `path:linha`, tarefas em tom "COPIE este padrão" em vez de "refatore x", checklist de verificação e anti-patterns explícitos. Se for executar em novos chats, começa por Phase 0 sempre.

---

## Phase 0 — Documentation Discovery (leitura obrigatória)

Antes de qualquer código, o executor precisa ler e internalizar os fatos abaixo. **Não invente método do SDK.**

### 0.1. APIs disponíveis no ACP SDK (fatos, não suposição)

Fonte primária: `node_modules/@agentclientprotocol/sdk/dist/acp.d.ts` e `node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts`.

| API | Path:linha | Assinatura |
|---|---|---|
| `ClientSideConnection` ctor | `acp.d.ts:226` | `constructor(toClient: (agent: Agent) => Client, stream: Stream)` — **factory function, NÃO instância** |
| `connection.initialize` | `acp.d.ts:239` | `initialize(params: schema.InitializeRequest): Promise<schema.InitializeResponse>` |
| `connection.newSession` | `acp.d.ts:257` | `newSession(params: schema.NewSessionRequest): Promise<schema.NewSessionResponse>` → retorna `sessionId` |
| `connection.prompt` | `acp.d.ts:401` | `prompt(params: schema.PromptRequest): Promise<schema.PromptResponse>` — retorna `stopReason` (inclui `Cancelled`) |
| `connection.cancel` | `acp.d.ts:415` | `cancel(params: schema.CancelNotification): Promise<void>` — **método público, fire-and-forget notification**. Depois dele, o `connection.prompt()` pendente resolve com `stopReason: "cancelled"` |
| `Client.sessionUpdate` | `acp.d.ts:45` | `sessionUpdate(params: schema.SessionNotification): Promise<void>` |
| `Client.requestPermission` | `acp.d.ts:58` | `requestPermission(params: schema.RequestPermissionRequest): Promise<schema.RequestPermissionResponse>` |
| `SessionUpdate` (union) | `schema/types.gen.d.ts:4135+` | Discriminated por `sessionUpdate: "user_message_chunk" \| "agent_message_chunk" \| "agent_thought_chunk" \| "tool_call" \| "tool_call_update" \| "plan" \| ...` |

### 0.2. Anti-patterns proibidos

- **Não usar** `new ClientSideConnection(clientInstance, stream)` — TEM que ser `new ClientSideConnection(() => clientInstance, stream)`. Erro `toClient is not a function` = este bug (visto no commit `9faa3ace`).
- **Não inventar** `connection.abort()`, `connection.close()`, `connection.terminate()`. O único modo de cancelar é `connection.cancel({ sessionId })`.
- **Não matar o subprocess** em abort de prompt stateful. `killCascade()` só roda em `session.close()` (shutdown / reaper / DELETE explícito). Matar subprocess em cancel mata a session inteira — derrota o propósito do refactor.
- **Não usar** `sendBeacon` para DELETE (`sendBeacon` é só POST). Usar `fetch(url, { method:"DELETE", keepalive: true })`.
- **Não esquecer** de registrar `proc.on("exit")` — se o agent morre sozinho (crash/OOM), a registry precisa saber para evitar reutilização da entry.

### 0.3. Estado atual (para entender o que está mudando)

| Arquivo | Ponto atual | Linha |
|---|---|---|
| `src/server/agent/acp-runtime.ts` | `AcpRuntime` class, `async *prompt(opts)` é o ciclo inteiro | `:28-368`, `prompt` em `:258`, `run()` em `:281+` |
| ^ | Stall timer 60s, hard timeout 300s, SIGKILL grace 2s | `:115`, `:268`, `:118` |
| ^ | `killCascade()` chamado em 3 paths (stall, hard, signal abort) | `:115`, `:267`, `:279` |
| ^ | History replay sequencial via `connection.prompt()` por mensagem user | `:291-305` |
| `src/server/routes/chat.ts` | Body shape `{message, history?, runtime, acpAgent?, provider?, model?}` | `:13-25` |
| ^ | Roteamento PI vs ACP + SSE | `:77-110` |
| `src/server/index.ts` | **Sem shutdown hook** — `serve()` em `:52`, nenhum `process.on` | `:52-62` |
| `src/server/agent/pi-runtime.ts` | **IGNORA `opts.history`** — só faz `agent.prompt(opts.message)`. Fase B precisa corrigir backend, não só frontend | `:65` |
| `src/server/agent/acp-agents.ts` | `getAcpAgent(id): AcpAgentSpec \| undefined`, IDs `"claude-acp"` e `"codex-acp"` | `:61` |
| `src/client/hooks/use-chat.ts` | `sendMessage(content, config)` com discriminated union; **sem chatId, sem history** | `:185`, body em `:198-206` |
| `src/client/components/chat/chat-layout.tsx` | **Sem chatId state**, sem `useEffect`. `clearMessages()` chamado em 5 lugares | `:52-64`, `:95-102` |
| `src/client/hooks/use-runtime.ts` | `UseRuntimeReturn` + localStorage persist | `:26-36`, `:38` |
| `src/client/lib/api.ts` | Tem `fetchAcpStatus()`; **sem helper DELETE** | `:101-106` |

### 0.4. Descoberta importante: Fase B é maior do que o handoff diz

O handoff original dizia "Backend: nenhuma mudança — `chat.ts` já lê `body.history`". **Isto é parcialmente falso.** `chat.ts:97` extrai `history` e passa a `PiRuntime.prompt()`, mas **`PiRuntime` em `pi-runtime.ts:65` ignora `opts.history` completamente** e só chama `agent.prompt(opts.message)`. Fase B precisa corrigir o `PiRuntime` também, não só mandar o history do frontend.

---

## Phase A1 — Extract `AcpSession` class

**Goal:** Mover tudo que é lifecycle stateless de `AcpRuntime.prompt()` para uma classe `AcpSession` reutilizável entre prompts.

**File:** `src/server/agent/acp-session.ts` (NOVO).

**Tarefa (COPIE padrões existentes, NÃO reinvente):**

1. Copie o setup de `spawn` + `mkdtempSync` + `Readable.toWeb`/`Writable.toWeb` + `new ClientSideConnection(() => client, stream)` de `acp-runtime.ts:258-284` para um método `init(agent: AcpAgentSpec): Promise<void>` da nova classe.
2. Copie a construção do `client` object (`sessionUpdate` + `requestPermission`) de `acp-runtime.ts:145-220` para um field `private client`, mas **escreva no queue de uma prompt ativa**, não em um queue global. Padrão:
   ```ts
   private currentQueue: RuntimeEvent[] | null = null
   private notify: (() => void) | null = null
   private client: Client = {
     sessionUpdate: async (params) => {
       if (!this.currentQueue) return // no active prompt, drop
       this.currentQueue.push(mapSessionUpdate(params.update))
       this.notify?.()
       this.notify = null
     },
     requestPermission: async (params) => { /* auto-approve first */ },
   }
   ```
3. Copie a lógica de drain (queue + `notify` promise) de `acp-runtime.ts:327-345` para um método `async *prompt(message: string, signal: AbortSignal): AsyncIterable<RuntimeEvent>`.
4. Dentro de `prompt()`:
   - Seta `this.currentQueue = []` + limpa `this.notify` no começo, limpa no finally.
   - **Stall timer arma aqui, não em `init`.** Reset a cada push no queue. Se estourar: chama `this.connection.cancel({ sessionId: this.sessionId })` + push erro + `{type:"done"}`. **NÃO chama `killCascade`.**
   - Wire `signal.addEventListener("abort", ...)` → `this.connection.cancel({ sessionId: this.sessionId })`. Remove listener no finally.
   - `await this.connection.prompt({ sessionId: this.sessionId, prompt: [{type:"text", text: message}] })`.
   - Push `{type:"done"}` quando o `await` resolver.
5. Método `async close(): Promise<void>`:
   - Copia `killCascade` de `acp-runtime.ts:119-144` (SIGTERM → 2s grace → SIGKILL, `rmSync` do tempdir).
   - Marca `this.closed = true`.
6. `proc.on("exit", ...)` em `init()`: se `!this.closed`, marca sessão como dead e guarda o motivo para o próximo `prompt()` rejeitar.

**Deliverable:** `src/server/agent/acp-session.ts` existe, compila, exporta `class AcpSession` com `init/prompt/close/isDead`. `AcpRuntime` **ainda não foi modificado nesta phase**.

**Verification checklist:**
- [ ] `npm run build` passa sem erros TS
- [ ] `grep -n "killCascade" src/server/agent/acp-session.ts` mostra killCascade só dentro de `close()`, não em timers ou signal handlers
- [ ] `grep -n "new ClientSideConnection" src/server/agent/acp-session.ts` mostra factory function `(() =>` como primeiro arg
- [ ] `grep -n "currentQueue" src/server/agent/acp-session.ts` mostra que sessionUpdate escreve em `currentQueue`, não em um field estável
- [ ] Class não exporta `prompt(history, ...)` — history não existe mais, sessão é stateful

**Anti-pattern guards:**
- [ ] `connection.cancel` é chamado em stall timeout e signal abort, NUNCA em `close()`
- [ ] `killCascade` é chamado em `close()`, NUNCA em stall/abort
- [ ] Construtor do `ClientSideConnection` usa factory function

---

## Phase A2 — Session Registry

**Goal:** Mapear `chatId → AcpSession` com idle reaping e serialização de prompts concorrentes.

**File:** `src/server/agent/acp-session-registry.ts` (NOVO).

**Tarefa:**

```ts
// Shape mínimo — COPIE assinatura tal qual
interface RegistryEntry {
  session: AcpSession
  lastUsedAt: number
  mutex: Promise<void>  // serialize prompts
  agentId: string
}

const sessions = new Map<string, RegistryEntry>()
const IDLE_MS = 15 * 60_000
const REAP_INTERVAL_MS = 60_000

export async function getOrCreate(chatId: string, agentId: string, spec: AcpAgentSpec): Promise<AcpSession>
export function has(chatId: string): boolean
export async function close(chatId: string): Promise<void>
export async function closeAll(): Promise<void>
// internal: reaper via setInterval — closes entries com now - lastUsedAt > IDLE_MS
```

**Detalhes críticos:**
1. `getOrCreate` — se a entry existe mas `entry.agentId !== agentId` (usuário trocou agent sem novo chatId), **feche a antiga e crie nova**. Isso é consistente com o frontend que regenera chatId em troca de agent (A4), mas serve de safety net.
2. `getOrCreate` — se `entry.session.isDead`, feche e recrie.
3. **Mutex por chatId** — para prompts concorrentes no mesmo chatId (double-click, bug do frontend). Padrão:
   ```ts
   export async function runExclusive<T>(chatId: string, fn: (session: AcpSession) => Promise<T>): Promise<T> {
     const entry = sessions.get(chatId)!
     const prev = entry.mutex
     let release: () => void
     entry.mutex = new Promise(res => { release = res })
     await prev
     try { return await fn(entry.session) }
     finally { entry.lastUsedAt = Date.now(); release!() }
   }
   ```
4. Reaper — `setInterval` armado no module load; guarda o handle para `closeAll()` cancelar. Não usar `unref()` (queremos que impeça o node de sair enquanto sessions existem).
5. `closeAll()` — `Promise.all` de todos `entry.session.close()`, limpa o map, cancela o interval.

**Deliverable:** Arquivo existe, compila, expõe `getOrCreate`, `runExclusive`, `has`, `close`, `closeAll`.

**Verification checklist:**
- [ ] `npm run build` passa
- [ ] `grep -n "runExclusive\|mutex" src/server/agent/acp-session-registry.ts` confirma serialização
- [ ] `grep -n "setInterval" src/server/agent/acp-session-registry.ts` mostra reaper armado
- [ ] Teste manual: `curl` para `/api/chat` stateful (depois de A3) com mesmo chatId duas vezes em < 1s — segundo só inicia depois do primeiro terminar

---

## Phase A3 — Refactor `chat.ts` + novo DELETE + shutdown hook

**Goal:** Rota ACP usa registry ao invés de `new AcpRuntime()` a cada call. Adicionar `DELETE /api/chat/session/:chatId` e shutdown hook.

**Files:**
- `src/server/routes/chat.ts` — modificar
- `src/server/index.ts` — adicionar shutdown hook
- `src/server/agent/acp-runtime.ts` — pode ser **deletado** ou reduzido a thin wrapper sobre `AcpSession`. Recomendo deletar (ninguém mais usa).

**Tarefas:**

1. **Extend body shape** em `chat.ts:13-25`:
   ```ts
   interface AcpChatBody {
     runtime: "acp"
     acpAgent: string
     chatId: string  // NEW — required
     message: string
     // history não existe mais em ACP (stateful)
   }
   ```
   Atualize `validateChatBody()` para exigir `chatId` quando `runtime === "acp"` (400 se missing).

2. **Replace** o branch `if (body.runtime === "acp")` em `chat.ts:84-88` por:
   ```ts
   if (body.runtime === "acp") {
     const spec = getAcpAgent(body.acpAgent)
     if (!spec) return c.json({ error: `unknown agent ${body.acpAgent}` }, 400)
     const session = await acpSessionRegistry.getOrCreate(body.chatId, body.acpAgent, spec)
     return streamSSE(c, async (stream) => {
       const controller = new AbortController()
       stream.onAbort(() => controller.abort())
       await acpSessionRegistry.runExclusive(body.chatId, async (s) => {
         for await (const ev of s.prompt(body.message, controller.signal)) {
           await writeRuntimeEventToSSE(ev, stream)
         }
       })
     })
   }
   ```

3. **New route** `DELETE /api/chat/session/:chatId`:
   ```ts
   chatRoutes.delete("/session/:chatId", async (c) => {
     const chatId = c.req.param("chatId")
     await acpSessionRegistry.close(chatId)
     return c.json({ ok: true })
   })
   ```
   Monte no mesmo router que `POST /api/chat` (já está em `src/server/index.ts:44`).

4. **Shutdown hook** em `src/server/index.ts` depois do `serve()`:
   ```ts
   const shutdown = async (sig: string) => {
     console.log(`[shutdown] ${sig} received, closing ACP sessions`)
     await acpSessionRegistry.closeAll()
     process.exit(0)
   }
   process.on("SIGTERM", () => void shutdown("SIGTERM"))
   process.on("SIGINT",  () => void shutdown("SIGINT"))
   ```

5. **Remove `AcpRuntime` se ninguém mais importar** — rode `grep -rn "AcpRuntime\|acp-runtime" src/server` depois da mudança.

**Verification checklist:**
- [ ] `npm run build` passa
- [ ] `curl -X POST http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"runtime":"acp","acpAgent":"claude-acp","chatId":"test-1","message":"hello"}'` retorna SSE stream
- [ ] Segundo curl com o mesmo `chatId` e `message: "qual foi a mensagem anterior?"` — o agente **lembra** (stateful validado)
- [ ] `curl -X DELETE http://localhost:3001/api/chat/session/test-1` retorna `{ok:true}` e mata o subprocess (verificar com `ps aux | grep claude-agent-acp`)
- [ ] Body sem `chatId` em ACP → 400
- [ ] `kill -TERM <server-pid>` limpa os subprocessos antes de sair (verificar `ps` depois)
- [ ] `grep -rn "AcpRuntime" src/server` retorna vazio (ou só o delete)

**Anti-pattern guards:**
- [ ] `body.history` não existe mais no branch ACP
- [ ] Não há `killCascade` direto em `chat.ts` — matar sessão é sempre via `acpSessionRegistry.close()`

---

## Phase A4 — Frontend chatId lifecycle

**Goal:** Frontend gera `chatId`, injeta no body ACP, regenera nos pontos certos, manda DELETE no unmount / troca de chat.

**Files:**
- `src/client/components/chat/chat-layout.tsx` — adicionar state
- `src/client/hooks/use-chat.ts` — aceitar chatId
- `src/client/lib/api.ts` — adicionar `deleteAcpSession(chatId)`

**Tarefas:**

1. **Adicionar em `api.ts`** (padrão copia de `fetchAcpStatus` em `:101-106`):
   ```ts
   export async function deleteAcpSession(chatId: string): Promise<void> {
     try {
       await fetch(`${API_BASE}/chat/session/${encodeURIComponent(chatId)}`, {
         method: "DELETE",
         keepalive: true,
       })
     } catch {
       // best-effort — reaper cleans up anyway
     }
   }
   ```

2. **Em `chat-layout.tsx`** (próximo de `:52`):
   ```ts
   const [chatId, setChatId] = useState(() => crypto.randomUUID())
   const rotateChatId = useCallback(() => {
     const old = chatId
     const next = crypto.randomUUID()
     setChatId(next)
     if (runtime.runtime === "acp") void deleteAcpSession(old)
   }, [chatId, runtime.runtime])
   ```
   - Chame `rotateChatId()` **dentro** de: `handleNewChat`, `onRuntimeSwitch`, `onAcpAgentSwitch` — junto do `clearMessages()` existente (linhas `:52`, `:95`, `:99`).
   - `handleAgentSwitch` / `handleModelSwitch` (PI-only, linhas `:56-64`) — **não** precisam rotacionar, chatId só é usado em ACP.

3. **`useEffect` de unmount** em `chat-layout.tsx`:
   ```ts
   useEffect(() => {
     return () => {
       if (runtime.runtime === "acp") void deleteAcpSession(chatId)
     }
   }, [chatId, runtime.runtime])
   ```
   Cuidado: este effect roda em toda mudança de `chatId`, o que é o que queremos (cleanup da antiga quando `rotateChatId` muda o id). O `useEffect` cleanup substitui o `void deleteAcpSession(old)` manual em `rotateChatId` — escolha **um** caminho, não dois. Recomendo: **deixa o cleanup do useEffect fazer isso**, remove o `void deleteAcpSession(old)` do `rotateChatId`. Mais limpo.

4. **`use-chat.ts` `sendMessage`** (linha `:185`):
   - Adicione `chatId: string` à signature do config ACP:
     ```ts
     config: 
       | { runtime: "acp"; acpAgent: string; chatId: string }
       | { runtime: "pi"; model: string; provider: string }
     ```
   - Inclua `chatId` no body ACP (linha `:198-206`):
     ```ts
     const body = config.runtime === "acp"
       ? { runtime: "acp" as const, message: content, acpAgent: config.acpAgent, chatId: config.chatId }
       : { ... /* PI unchanged */ }
     ```

5. **Chat layout passa `chatId` pro hook** — no call site de `sendMessage({runtime:"acp", ...})`, incluir `chatId` do state.

**Verification checklist:**
- [ ] `npm run build` passa
- [ ] DevTools Network: POST `/api/chat` em ACP mostra `chatId` no body
- [ ] "New Chat" → `chatId` muda + request `DELETE /api/chat/session/<old>` aparece
- [ ] Troca runtime ACP→PI → DELETE aparece
- [ ] Troca de agent ACP (claude-acp → codex-acp) → DELETE aparece
- [ ] Fechar aba → DELETE aparece (via `keepalive: true` no fetch)
- [ ] Mandar "meu nome é X" depois "qual meu nome?" em ACP sem reload → agente responde corretamente

**Anti-pattern guards:**
- [ ] `sendBeacon` NÃO é usado (não suporta DELETE)
- [ ] DELETE duplicado (no `rotateChatId` E no useEffect cleanup) — só um caminho

---

## Phase A5 — Abort semântica (validar integração A1+A3+A4)

**Goal:** Confirmar que cancel no frontend (botão "Stop") cancela o prompt sem matar a sessão.

**Sem código novo se A1 foi feito certo** — esta phase é primariamente de verificação.

**Tarefas:**

1. Ler `src/client/hooks/use-chat.ts` e achar como o abort é hoje (provavelmente `AbortController` passado no fetch). Confirmar que `stream.onAbort()` em `chat.ts` dispara `controller.abort()` → que chega em `session.prompt()` → que chama `connection.cancel({sessionId})`.
2. Verificar que após o cancel, o subprocess **continua vivo** (verificar `ps aux | grep claude-agent-acp` antes e depois do stop — PID não muda).
3. Verificar que um novo `sendMessage()` depois do cancel reutiliza o mesmo subprocess (o mesmo PID) e o agente lembra da conversa anterior até o ponto do cancel.

**Verification checklist:**
- [ ] Manual UI: mandar prompt longo, clicar Stop, confirmar que responde parou
- [ ] `ps aux | grep claude-agent-acp` — mesmo PID antes e depois
- [ ] Mandar nova mensagem após Stop — agente lembra do contexto
- [ ] `curl -X DELETE /api/chat/session/<id>` — AGORA o PID muda (fica `<defunct>` ou some)

**Anti-pattern guards:**
- [ ] Nenhum commit nesta phase chama `killCascade` em signal.abort
- [ ] `grep -n "killCascade\|SIGKILL\|SIGTERM" src/server/agent/acp-session.ts` mostra killCascade só no `close()`

---

## Phase A6 — Stall timer escopado por prompt (revisar A1)

**Goal:** Confirmar que o stall timer de A1 está por-prompt, não por-session.

**Sem código novo se A1 foi feito certo.** Esta phase é review + teste.

**Tarefas:**
1. Ler `acp-session.ts` e confirmar que o stall timer é armado no começo de `prompt()`, reset a cada `sessionUpdate` do cliente, limpo no finally.
2. Simular stall: mandar um prompt, mockar uma condição onde o agent não manda update por >60s (difícil — pode skippar e depender do happy path).
3. Confirmar que depois de um stall timeout, a session **não** está morta — próximo prompt funciona.

**Verification checklist:**
- [ ] Code review: timer armado dentro de `prompt()`, não em `init()`
- [ ] Code review: stall handler chama `connection.cancel`, não `killCascade`
- [ ] Happy path: 2 prompts sequenciais no mesmo chat, cada um com 10+ updates, funcionam sem stall false positive

---

## Phase A7 — Error corner cases

**Goal:** Cobrir os casos de borda que o handoff listou.

**Tarefas:**

1. **Subprocess crash mid-chat** — já parcialmente coberto por A1 (`proc.on("exit")` marca dead). Adicionar:
   - Em `AcpSession.prompt()`, se `this.isDead` no início, lançar erro `"session terminated, please start a new chat"`.
   - Em `acp-session-registry.getOrCreate()`, se `entry.session.isDead`, fechar e recriar.
   - No frontend `use-chat.ts`, tratar este erro específico: mostrar toast + rotacionar `chatId`.

2. **Server restart (sessions perdidas)** — nada a fazer no backend. No frontend:
   - `use-chat.ts` já trata erros de rede? Verificar. Se não, adicionar handler que em 500 com mensagem contendo "session" rotaciona `chatId` e mostra mensagem.

3. **Cliente fecha aba sem DELETE** — já coberto pelo reaper de A2 (15min idle).

**Verification checklist:**
- [ ] Simular crash: `kill -9 $(pgrep claude-agent-acp)` durante um chat, próximo prompt retorna erro legível + frontend rotaciona chatId
- [ ] Restart do backend durante um chat, próximo prompt retorna erro + frontend rotaciona chatId
- [ ] Fechar aba sem New Chat, esperar 16min (ou reduzir `IDLE_MS` pra teste), verificar `ps aux` — sem zombies

---

## Phase B — PI history support (fix backend + frontend)

**Goal:** Paridade de contexto para PI runtime. **Descoberta importante**: o handoff original dizia só frontend; na verdade `PiRuntime` ignora `opts.history` hoje (`pi-runtime.ts:65`).

### B1. Backend — `PiRuntime` respeitar `opts.history`

**File:** `src/server/agent/pi-runtime.ts`

**Tarefa:** Ler como `@mariozechner/pi-agent-core` aceita história. Provavelmente via `new Agent({ messages: [...] })` ou via método `agent.addMessages(...)`. Verificar na typing do pacote (`node_modules/@mariozechner/pi-agent-core/dist/*.d.ts`).

**Ação:** Em `pi-runtime.ts:51-65`, antes de chamar `agent.prompt(opts.message)`:
- Se `opts.history?.length`, injetar history no agent (método exato depende da API do pi-agent-core — **ler os typings antes de codar**).
- Alternativa: construir um prompt combinado `[system?, ...history, user]` se a API é mais baixo nível.

**Verification:**
- [ ] Ler `node_modules/@mariozechner/pi-agent-core/dist/agent.d.ts` para confirmar API real
- [ ] Implementar conforme API real, não chute
- [ ] `npm run build` passa
- [ ] Manual: em PI, mandar "meu nome é X" depois "qual meu nome?" → responde X

### B2. Frontend — mandar history em PI

**File:** `src/client/hooks/use-chat.ts`

**Tarefa:**
1. Construir `history: AgentMessage[]` a partir do `messages[]` do state do hook. Shape esperado por `pi-agent-core`: provavelmente `{role: "user"|"assistant", content: string}`. Extrair texto plano de `Message.segments` (ou do field text-like que `Message` tem). Ler o shape de `Message` em `src/client/lib/types.ts` (ou equivalente).
2. Include `history` no body quando `config.runtime === "pi"`:
   ```ts
   const body = {
     runtime: "pi" as const,
     message: content,
     model: config.model,
     provider: config.provider,
     history: messages.map(toAgentMessage),
   }
   ```
3. `messages` vem do state do hook — na hora do `sendMessage`, use os messages **anteriores** ao push da mensagem atual.

**Verification:**
- [ ] Manual: em PI, mandar 3 mensagens, verificar no DevTools Network que a 3ª request tem `history` de 2 messages
- [ ] Manual: "meu nome é X" → "qual meu nome?" → responde X
- [ ] Trocar provider ou model rotaciona messages (já existe), history vai vazio no próximo prompt

---

## Phase V — Verification final (cross-phase)

**Goal:** Provar que tudo funciona junto antes de ship.

**Smoke tests manuais (TC1–TC8):**

1. **TC1 — PI regressão**: prompt simples, resposta streamada ok
2. **TC2 — PI history**: "meu nome é Alice" → "qual meu nome?" → "Alice"
3. **TC3 — ACP claude-acp stream**: prompt simples em claude-acp, resposta streamada
4. **TC4 — ACP codex-acp stream**: idem com codex-acp
5. **TC5 — ACP stateful continuity**: claude-acp, "meu nome é X", "qual meu nome?" → X, sem replay no body (confirmar no Network que body só tem a mensagem atual)
6. **TC6 — ACP cancel não mata session**: prompt longo, Stop, mesmo PID depois, nova mensagem lembra do contexto anterior até o cancel
7. **TC7 — ACP New Chat limpa session**: New Chat, DELETE no Network, novo PID na próxima mensagem
8. **TC8 — ACP server shutdown cleanup**: `kill -TERM $(lsof -ti:3001)`, `ps aux | grep acp` — zero zombies

**Grep-based anti-pattern checks:**
- [ ] `grep -rn "killCascade" src/server/agent/` — só em `acp-session.ts`, só dentro do método `close()`
- [ ] `grep -rn "new ClientSideConnection" src/server/` — todas as ocorrências usam factory `(() =>`
- [ ] `grep -rn "sendBeacon" src/client/` — zero
- [ ] `grep -rn "AcpRuntime" src/server/` — zero (removido)
- [ ] `grep -rn "body.history" src/server/routes/chat.ts` — só no branch PI

**Doc updates obrigatórios:**
- [ ] `.harn/docs/acp-research/00-SETUP.md` — atualizar para `@agentclientprotocol/claude-agent-acp` (o nome velho `@zed-industries/claude-code-acp` está deprecated)
- [ ] `.harn/docs/acp-research/03-SMOKE-TEST.md` — adicionar TC5/TC6/TC7/TC8 stateful
- [ ] Esta PLAN-STATEFUL.md — marcar status como `done` no topo

**Commit strategy:** um commit por phase (A1, A2, A3, A4, A5 skip se zero código, A6 skip se zero código, A7, B1, B2). Branch `feat/acp-stateful`. PR final aponta para essa estratégia na descrição.

---

## Gotchas acumulados (não perder entre phases)

1. **`ClientSideConnection(() => client, stream)`** — factory function, NÃO instância. Bug histórico `9faa3ace`.
2. **Package rename**: `@zed-industries/claude-code-acp` DEPRECATED → `@agentclientprotocol/claude-agent-acp` (binário continua `claude-agent-acp`).
3. **`.harn/` é untracked** (feedback `feedback_save_location.md`). Docs deste plano vão em `.harn/docs/`, código vai em `src/`.
4. **Web Streams obrigatórios**: `Readable.toWeb` / `Writable.toWeb` porque o SDK exige Web Streams. Manter.
5. **PI é stateless inerente** (pi-agent-core cria Agent novo por request). Phase B precisa passar history **explicitamente** pro agent — `chat.ts` já passa pro runtime, mas runtime ignora hoje.
6. **Stall 60s + hard 300s** atuais são por-request. Em A1 viram por-prompt (armados/limpos em `prompt()`, não `init()`).
7. **requestPermission** auto-aprova primeira opção. Fora do escopo deste plano — mas se uma tool crítica precisar de review, abrir phase nova.
8. **`proc.on("exit")`** é a única defesa contra subprocess morto mid-session — não esquecer.
9. **Reaper `setInterval` SEM `unref()`** — queremos que impeça node de sair enquanto sessions existem (`closeAll` cancela no shutdown).

---

## Resume steps (cold start em nova sessão)

1. `git log --oneline -5` — confirmar HEAD
2. `curl http://localhost:3001/api/runtime/acp/status` → `{claude-acp:true,codex-acp:true}` esperado
3. Ler este `PLAN-STATEFUL.md` **inteiro** + `HANDOFF-STATEFUL.md` como contexto
4. Ler Phase 0 deste plano (doc discovery) antes de qualquer código
5. Ler `src/server/agent/acp-runtime.ts` inteiro — é a base pra extrair em A1
6. Começar por Phase A1, um commit por phase
