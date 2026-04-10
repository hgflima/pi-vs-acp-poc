# Handoff — Stateful ACP Sessions (next work)

**Created:** 2026-04-10 04:45 GMT-3 (before /clear)
**Prior handoff:** `HANDOFF.md` (frontend completion — now done + committed)

## Where we are

### Committed + pushed

- `2712e7a0` feat(acp): backend runtime abstraction + ACP stateless runtime
- `9faa3ace` fix(acp): pass client factory to ClientSideConnection
- `cc008543` feat(acp): frontend RuntimeToggle + use-runtime hook

Remote: https://github.com/hgflima/pi-vs-acp-poc (public, main tracks origin/main)

### Runtime ACP — validated working

- Both binaries installed global + in PATH:
  - `claude-agent-acp` from `@agentclientprotocol/claude-agent-acp@0.26.0` (the original `@zed-industries/claude-code-acp` is deprecated — migrate to this one).
  - `codex-acp` from `@zed-industries/codex-acp@0.11.1`
- `curl http://localhost:3001/api/runtime/acp/status` → `{"claude-acp": true, "codex-acp": true}`
- `.harn/config/acp-agents.json` exists (redundant with hardcoded defaults but explicit):
  ```json
  {
    "claude-acp": { "command": "claude-agent-acp", "args": [] },
    "codex-acp":  { "command": "codex-acp",        "args": [] }
  }
  ```
- Smoke test results:
  - TC1 PI regressão — implícito ok
  - TC2 claude-acp stream — ok
  - TC3 codex-acp stream — ok
  - TC4 abort kill cascade — ok (subprocess + tmpdir limpos em < 3s)
  - TC5–TC7 — skipped

### Current stateless behavior (to change)

Cada POST `/api/chat` em ACP:
1. `spawn(agent.command, …)` em `mkdtempSync("/tmp/pi-ai-poc-acp-")`
2. `connection.initialize()` + `connection.newSession({cwd, mcpServers:[]})`
3. Opcional: replay de history como prompts sequenciais
4. `connection.prompt({sessionId, prompt:[{type:"text", text}]})`
5. `killCascade()` (SIGTERM → 2s → SIGKILL) + `rm -rf tmpdir`

Consequência: cada mensagem é sessão nova; tool caches/file reads do agente morrem; startup pago toda mensagem; frontend atualmente nem manda `history` no body, então o agente vê só a msg corrente sem contexto.

## O objetivo novo

Tornar as sessões ACP **stateful como Claude Code/Codex** — subprocesso vive pelo chat inteiro, `connection.prompt()` é reutilizado. Para PI, como pi-agent-core é inerentemente stateless per-request (memória obs 84), a paridade vem enviando `history` no body (backend já suporta — `chat.ts` lê `body.history`).

Decisão do usuário: **fazer as duas fases (A e B) em sequência.** Ele vai confirmar na nova sessão, mas a direção está dada.

## Fase A — ACP stateful (o core)

### A1. Criar `AcpSession` class (arquivo: `src/server/agent/acp-runtime.ts` ou novo `acp-session.ts`)

Extrair do atual `AcpRuntime.prompt()` tudo que é lifecycle e mover para uma classe reutilizável:

```ts
class AcpSession {
  private proc: ChildProcess | null = null
  private connection: ClientSideConnection | null = null
  private sessionId: string | null = null
  private tempDir: string | null = null
  private closed = false
  private currentQueue: RuntimeEvent[] | null = null  // for concurrent push during prompt
  private notify: (() => void) | null = null
  // ...

  async init(agent: AcpAgentSpec): Promise<void> {
    // spawn + streams + ClientSideConnection(() => client, stream)
    // initialize + newSession — persiste sessionId
  }

  async *prompt(message: string, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
    // stall timer RESET aqui, não na init
    // wire signal → connection.cancel({sessionId})   (NÃO killCascade)
    // await connection.prompt({ sessionId, prompt:[{type:"text", text:message}] })
    // drena eventos via o mesmo padrão de queue + notify
  }

  async close(): Promise<void> {
    // killCascade + rm tempDir + marca closed
  }
}
```

O `client` (objeto com `sessionUpdate` + `requestPermission`) precisa **escrever no queue da prompt ativa**, não no queue global. Uma forma limpa: o `client` referencia `this.currentQueue`/`this.notify` e o método `prompt()` seta esses campos no começo e limpa no fim.

### A2. `src/server/agent/acp-session-registry.ts` (novo)

```ts
const sessions = new Map<string, { session: AcpSession; lastUsedAt: number }>()
const IDLE_MS = 15 * 60_000  // reap after 15min idle
const REAP_INTERVAL_MS = 60_000

export async function getOrCreate(chatId: string, agent: AcpAgentSpec): Promise<AcpSession>
export function has(chatId: string): boolean
export async function close(chatId: string): Promise<void>
export async function closeAll(): Promise<void>  // called on server shutdown
// internal reaper: setInterval that closes sessions older than IDLE_MS
```

Concorrência: precisa serializar prompts no mesmo chatId (um `Mutex`/Promise chain por session) — se o frontend disparar dois prompts concorrentes por bug ou double-click, evitar race no ndjson stream.

### A3. Refactor de `src/server/routes/chat.ts`

Body em ACP agora precisa de `chatId`:
```ts
interface AcpChatBody {
  runtime: "acp"
  acpAgent: string
  chatId: string  // NEW — required
  message: string
  // history não é mais necessário em ACP (sessão é stateful)
}
```

Rota:
```ts
if (body.runtime === "acp") {
  const spec = getAcpAgent(body.acpAgent)
  if (!spec) return 400
  const session = await acpSessionRegistry.getOrCreate(body.chatId, spec)
  return streamSSE(c, async (stream) => {
    const controller = new AbortController()
    stream.onAbort(() => controller.abort())
    for await (const ev of session.prompt(body.message, controller.signal)) {
      await writeRuntimeEventToSSE(ev, stream)
    }
  })
}
```

Nova rota: `DELETE /api/chat/session/:chatId` → chama `acpSessionRegistry.close(chatId)`.

Server shutdown hook em `src/server/index.ts` para `closeAll()` (SIGTERM/SIGINT).

### A4. Frontend — chatId lifecycle

- `ChatLayout`: `const [chatId, setChatId] = useState(() => crypto.randomUUID())` (ou `nanoid` se já tem).
- Regenerar `chatId` quando:
  - Click em "New Chat" (`handleNewChat`)
  - `onRuntimeSwitch` / `onAcpAgentSwitch` (já chamam `clearMessages()`, adicionar `setChatId(new)`)
- `useEffect` de unmount: `navigator.sendBeacon(\`/api/chat/session/${chatId}\`, ...)` — `sendBeacon` não suporta DELETE, então alternativa: `fetch(..., {method:"DELETE", keepalive:true})`.
- `use-chat.ts`: `sendMessage` passa a aceitar `chatId` e injetar em body quando `runtime === "acp"`.

### A5. Abort semântica nova

- **Stateless (atual)**: abort → `killCascade()` → subprocess morre.
- **Stateful (novo)**: abort → `connection.cancel({ sessionId })` → subprocesso **vive**, só o prompt atual é interrompido.
- `killCascade()` só roda em `session.close()` (shutdown/idle/explicit delete).

Verificar se `ClientSideConnection` expõe `.cancel()` como método ou se é via `connection.request(...)` — checar `node_modules/@agentclientprotocol/sdk/dist/acp.d.ts`.

### A6. Stall timer re-escopado

Atual: um timer por `prompt()` call, reseta a cada `session/update`, se estourar mata tudo.
Novo: timer é armado quando `session.prompt()` começa, limpo quando termina (seja por `done` ou erro). Se estourar: chama `connection.cancel({sessionId})` + emite erro, **mas não mata o subprocesso**.

### A7. Erros corner case

- Subprocess morre mid-chat (crash do agente, OOM): `proc.on("exit")` marca a sessão como dead, próximo `prompt()` retorna erro claro "session terminated, please start a new chat". Registry remove a entry.
- Cliente fecha aba sem chamar DELETE: idle reaper limpa em 15min.
- Server reinicia: todas as sessões em memória se perdem — frontend precisa lidar com erro na primeira msg após restart.

## Fase B — PI com history (depois de A)

Escopo pequeno:

1. `use-chat.ts` converte `messages[]` (shape do reducer: `{role, content, segments…}`) para `AgentMessage[]` do pi-agent-core. Provavelmente:
   ```ts
   const history = messages.map(m => ({
     role: m.role,
     content: typeof m.content === "string" ? m.content : extractText(m)
   }))
   ```
2. Enviar `body.history = history` no POST quando `runtime === "pi"`.
3. Backend: nenhum mudança — `chat.ts` já lê `body.history` e passa pra `PiRuntime.prompt()`.
4. Verificar se `PiRuntime` realmente aplica o history — ler `src/server/agent/pi-runtime.ts` para confirmar que ele passa pro Agent antes do prompt.

## Arquivos que vão mudar (estimativa)

**Backend:**
- `src/server/agent/acp-runtime.ts` — refactor grande, AcpSession class
- `src/server/agent/acp-session-registry.ts` — NOVO
- `src/server/routes/chat.ts` — chatId, rota DELETE
- `src/server/index.ts` — shutdown hook
- (opcional) `src/server/agent/pi-runtime.ts` — se a Fase B precisar ajuste

**Frontend:**
- `src/client/components/chat/chat-layout.tsx` — chatId state
- `src/client/hooks/use-chat.ts` — chatId no body + unmount cleanup
- (Fase B) `src/client/hooks/use-chat.ts` — history no body PI

## Resume steps (cold start)

1. `git log --oneline -5` — confirmar HEAD em `cc008543`
2. `curl http://localhost:3001/api/runtime/acp/status` — `{claude-acp:true,codex-acp:true}` esperado
3. Ler este handoff + `HANDOFF.md` original
4. Ler `src/server/agent/acp-runtime.ts` inteiro (arquitetura stateless atual)
5. Ler `node_modules/@agentclientprotocol/sdk/dist/acp.d.ts` seções `ClientSideConnection` + `cancel` — confirmar assinaturas do `cancel`
6. Propor task breakdown pro usuário, esperar green light, começar
7. Fazer um commit por task (A1, A2, A3, A4, A5, A6, A7) — branch `feat/acp-stateful` talvez

## Gotchas acumulados (importantes, não perder)

1. **`ClientSideConnection(() => client, stream)`** — factory function, NÃO instância. Erro `toClient is not a function` é sintoma disso.
2. **Package renomeado**: `@zed-industries/claude-code-acp` está DEPRECATED → usar `@agentclientprotocol/claude-agent-acp` (binário continua sendo `claude-agent-acp`).
3. **Display key vs command**: em `acp-agents.json`, a chave (`claude-acp`) é o ID que aparece no UI; o valor `command` é o binário real (`claude-agent-acp`). Se escrever a chave errada, o default hardcoded some.
4. **`.harn/` é untracked** — workspace local. NÃO commitar docs/config daí (user preference memória `feedback_save_location.md`).
5. **Web Streams**: `acp-runtime.ts` usa `Readable.toWeb`/`Writable.toWeb` porque o SDK exige Web Streams, não Node streams. Manter.
6. **Memória stale**: obs 67 dizia que o SDK estava instalado quando não estava; sempre verificar filesystem antes de confiar em memória.
7. **PI é stateless inerentemente** (pi-agent-core cria Agent novo por request, memória obs 84). Statefulness para PI só via history replay no body.
8. **Stall timer 60s + hard timeout 300s** atuais são por-request. Na Fase A precisam virar por-prompt (limpos a cada `done`).
9. **requestPermission** está auto-aprovando a primeira opção — pode precisar UI real se um agente pedir permissão crítica.

## Não esqueça

- Atualizar `00-SETUP.md` com o nome correto do pacote (`@agentclientprotocol/claude-agent-acp`) — hoje o doc foi escrito antes da migração.
- Atualizar `03-SMOKE-TEST.md` adicionando TC8 "stateful continuity" quando a Fase A estiver pronta: mandar "meu nome é X", depois "qual meu nome?" → deve responder X sem replay.
- O `fetchAcpStatus` é hoje fetch-on-open + fetch-on-mount. Considerar se faz sentido também poll quando um agente é instalado depois do backend subir (provavelmente não — refresh manual basta).
