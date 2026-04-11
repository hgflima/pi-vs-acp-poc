# Plano: Permission Modes & Interactive Prompts

**Status:** Draft — aguardando revisão humana antes do IMPLEMENT phase
**Spec:** `.harn/docs/specs/permissions-and-ask-user.md`
**Autor:** Claude (via `agent-skills:planning-and-task-breakdown`)
**Data:** 2026-04-11

---

## Overview

Quebrar a spec em 7 fatias verticais, cada uma terminando em commit verde. A ordem é: fundação de schema → ACP ponta-a-ponta (fail fast contra agentes externos reais) → PI runtime → UAT. Cada fatia é testável isoladamente e não regressa as anteriores.

**Total:** 20 tarefas · 7 fases · 4 checkpoints humanos.

---

## Decisões de arquitetura (fixadas aqui)

1. **`permission-bridge.ts` compartilhado** entre ACP e PI, chaveado por `promptId` standalone (não por `sessionId`). O endpoint `/respond` recebe `{ id, response }` e não precisa saber qual runtime é. Justificativa: simplifica o roteamento e o POC é single-user local.
2. **Endpoint novo:** `POST /api/chat/respond` (não `:sessionId/respond`). Stateless do ponto de vista da rota — a lookup é feita no bridge pelo id. Stream SSE de chat continua intocado.
3. **Render inline como pseudo-mensagens:** `PermissionPrompt` e `ElicitationPrompt` são renderizados dentro do `MessageList` como itens anexos ao tool call que os disparou. `ModeChip` vai no `ChatHeader`. Alternativa rejeitada: modais overlay — perderiam contexto do tool.
4. **Runtime interface estendida:** `Runtime` ganha `getAvailableModes?(): SessionMode[]` e `setMode?(id: string): Promise<void>` — ambos opcionais. ACP session implementa via RPC; PI runtime implementa via `session-mode.ts`.
5. **`allow_always` scope:** `(toolName, chatSessionId)` — dura enquanto a aba do chat estiver viva. Zerado em server restart.
6. **Rejeição de permissão → tool error card existente.** Sem novo variant de evento. O tool call termina com `status: "error"` e uma mensagem "Rejected by user".
7. **Modo default do PI runtime:** `default`. Modos disponíveis: `default | acceptEdits | plan | bypassPermissions`, hardcoded no `session-mode.ts`.
8. **Bridge timeout:** 5 minutos. Ao expirar, rejeita a Promise e emite `{ type: "prompt_expired", id }` no SSE para o cliente limpar o card.

---

## Dependency graph

```
Phase 1: Foundation (schema + bridge skeleton)
  │
  ├── Phase 2: ACP mode cycling (chip + set_mode)
  │
  ├── Phase 3: ACP per-tool permissions (replace auto-approve)
  │        │
  │        └── Phase 4: ACP elicitation (ElicitationCapabilities)
  │
  └── Phase 5: PI runtime mode + beforeToolCall
           │
           └── Phase 6: PI runtime askUserQuestion tool
                    │
                    └── Phase 7: UAT + doc sweep
```

ACP vem antes de PI porque valida o wire shape contra um agente externo real (fail-fast). PI runtime reusa shapes já validadas.

---

## Open questions a resolver durante IMPLEMENT

Destas 8 da spec, **3 foram resolvidas agora**:

- ~~Q4 (onde o /respond POST aterrissa):~~ `POST /api/chat/respond`, stateless, lookup por id.
- ~~Q5 (PI runtime mode persistence):~~ session-only, zerado em server restart, zerado em troca de agent.
- ~~Q8 (typecheck command):~~ **não existe** — Task 1 adiciona `"typecheck": "tsc --noEmit"` ao `package.json`.

**5 permanecem abertas** e serão verificadas em runtime durante as fatias:

- Q1/Q2: `availableModes` de claude-acp/codex-acp — verificar via ndjson na Task 7.
- Q3: claude-acp emite `ElicitationRequest`? — verificar na Task 12. Se não emitir, ainda construímos a infra para PI runtime e codex.
- Q6: `allow_always` scope fino — **decidido acima** como `(toolName, chatSessionId)`. Pode ser revisto na Task 10.
- Q7: rejeição UX — **decidido acima** como reuso do tool error card. Pode ser revisto na Task 10.

---

## Phase 1 — Foundation

**Objetivo:** schema + bridge skeleton pronto, zero mudança de comportamento visível.

### Task 1: Add `typecheck` script

**Description:** Adicionar `"typecheck": "tsc --noEmit"` ao `package.json`. Todas as tarefas seguintes usam essa como acceptance gate.

**Acceptance criteria:**
- [ ] `npm run typecheck` existe e roda sem erros no commit atual.

**Verification:**
- [ ] `npm run typecheck` exit 0.

**Dependencies:** None.
**Files likely touched:** `package.json`.
**Scope:** XS.

---

### Task 2: Estender `RuntimeEvent` e `SSEEvent` com novos variants

**Description:** Adicionar 4 novos variants à união discriminada de `RuntimeEvent` (server) e `SSEEvent` (client), espelhando shapes do ACP SDK. Nenhum produtor emite os novos eventos ainda — só os tipos.

Variants:
- `{ type: "session_mode_state"; availableModes: SessionMode[]; currentModeId: string }`
- `{ type: "permission_request"; id: string; toolCallId: string; options: PermissionOption[] }`
- `{ type: "elicitation_request"; id: string; message: string; requestedSchema: ElicitationSchema }`
- `{ type: "prompt_expired"; id: string }`

**Acceptance criteria:**
- [ ] `src/server/agent/runtime.ts` tem os 4 novos variants importando tipos de `@agentclientprotocol/sdk`.
- [ ] `src/client/lib/types.ts` tem `SSEEvent` espelhando (shapes idênticos, sem `thinking_delta.data` vs `.delta` drift).
- [ ] `src/server/lib/runtime-sse.ts` serializa os 4 tipos novos (pode lançar "unreachable" se faltar — será preenchido nas fases seguintes).
- [ ] `src/client/lib/stream-parser.ts` (ou equivalente) desserializa os 4 tipos.

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] `npm run build` passa.
- [ ] `npm run dev` inicia ambos os processos sem erro no boot.

**Dependencies:** Task 1.
**Files likely touched:** `src/server/agent/runtime.ts`, `src/client/lib/types.ts`, `src/server/lib/runtime-sse.ts`, `src/server/lib/stream-adapter.ts`, `src/client/lib/stream-parser.ts` (se existir — confirmar no IMPLEMENT).
**Scope:** S.

---

### Task 3: Criar `permission-bridge.ts`

**Description:** Registry in-process de pending prompts conforme seção 5 da spec, levemente ajustado: chave é `promptId` puro (sem `sessionId` na chave). Exporta `requestPermission`, `requestElicitation`, `resolvePrompt`, `rejectAllPending`.

**Acceptance criteria:**
- [ ] `Map<promptId, Pending>` com timeout padrão 5min.
- [ ] `requestPermission(toolCallId, options, signal?)` retorna `Promise<RequestPermissionOutcome>`.
- [ ] `requestElicitation(message, schema, signal?)` retorna `Promise<ElicitationResponse>`.
- [ ] `resolvePrompt(id, outcome)` devolve `boolean` (true se encontrou).
- [ ] `AbortSignal.abort` rejeita a Promise e remove do Map.
- [ ] Timeout rejeita a Promise com mensagem clara e remove do Map.
- [ ] Testes unitários em `permission-bridge.test.ts`: resolve happy path, timeout, abort, double-resolve idempotência.

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Unit tests passam: `npx tsx --test src/server/agent/permission-bridge.test.ts` (ou via runner escolhido — confirmar no IMPLEMENT; se nenhum runner existir, flag como nota e escrevemos teste manual rodável).

**Dependencies:** Task 2.
**Files likely touched:** `src/server/agent/permission-bridge.ts` (novo), `src/server/agent/permission-bridge.test.ts` (novo).
**Scope:** S.

---

### Task 4: Endpoint `POST /api/chat/respond` + client dispatch

**Description:** Rota nova que recebe `{ id, response }` e chama `resolvePrompt(id, response)`. Responde 200 se resolveu, 404 se não encontrou. No client, cria um helper `respondToPrompt(id, response)` em `lib/api.ts` e um hook `use-interactive-prompts.ts` que:
- Mantém `pendingPrompts: Map<promptId, PermissionOrElicitationRequest>`.
- Expõe `respond(id, response)` que chama o helper e remove o pending.
- Reage a `prompt_expired` removendo o pending.

Nenhum componente renderiza os pendings ainda — só a plumbing.

**Acceptance criteria:**
- [ ] `POST /api/chat/respond` existe, valida body, chama bridge.
- [ ] 404 se promptId desconhecido.
- [ ] `use-interactive-prompts.ts` integra com `use-chat.ts` (pipeline recebe os novos eventos e popula o map).
- [ ] `respondToPrompt` envia POST e trata erro de rede.

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Smoke: `curl -X POST :3001/api/chat/respond -d '{"id":"nope","response":{}}'` retorna 404.

**Dependencies:** Task 3.
**Files likely touched:** `src/server/routes/chat.ts` (ou novo `src/server/routes/respond.ts`), `src/client/lib/api.ts`, `src/client/hooks/use-interactive-prompts.ts` (novo), `src/client/hooks/use-chat.ts`.
**Scope:** M.

---

### ✅ Checkpoint — Foundation
- [ ] `npm run typecheck` e `npm run build` passam.
- [ ] `npm run dev` boota sem erro.
- [ ] Chat funciona exatamente como antes (nenhum comportamento novo visível).
- [ ] Human review: confirmar que os shapes do SDK batem com o que a spec assumiu. **Se não baterem, parar.**

---

## Phase 2 — ACP Mode Cycling (Slice B da spec)

### Task 5: `AcpSession` expõe e aplica SessionMode

**Description:** `AcpSession` passa a:
1. Ler `availableModes` e `currentModeId` da resposta de `session/new` (se presentes). Armazenar no campo `private modeState`.
2. Expor `getModeState()` e `setMode(modeId)`.
3. `setMode` envia `session/set_mode` via `ClientSideConnection.setSessionMode(...)`.
4. Quando `session/mode_updated` chegar do agent, atualizar `modeState` e emitir `{ type: "session_mode_state", ... }` no stream.
5. Emitir o evento inicial `session_mode_state` assim que a session for criada (durante `initialize`/`new`).

**Acceptance criteria:**
- [ ] `acp-session.ts` tem `modeState: SessionModeState | null`.
- [ ] `setMode(id)` funciona e retorna `Promise<void>`.
- [ ] `prompt()` emite `session_mode_state` como primeiro evento quando a session é nova.
- [ ] Handler `sessionModeUpdated` no `Client` do `acp-session.ts` atualiza + re-emite.

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Manual: iniciar sessão claude-acp, conferir ndjson log do subprocess mostrando `session/new` response contendo `availableModes` (se não contiver — Q1 da spec resolvida como "no, precisa fallback"; flagar para human).
- [ ] Manual: chamar `setMode` via REPL/curl (futuro) não é escopo desta task.

**Dependencies:** Task 2.
**Files likely touched:** `src/server/agent/acp-session.ts`, `src/server/agent/acp-session-registry.ts` (possivelmente — expor setMode).
**Scope:** M.

---

### Task 6: `<ModeChip />` component + state no `use-chat`

**Description:** Componente `chat/mode-chip.tsx` renderiza o modo atual como pill, mostra tooltip com descrição (`SessionMode.description`), cycle on click. Integra com `use-chat` que passa a manter `chatState.modeState: SessionModeState | null`.

**Acceptance criteria:**
- [ ] `<ModeChip />` lê `modeState` do chat state, renderiza current mode, onclick cycla para o próximo.
- [ ] Se `modeState === null`: não renderiza (runtimes que não advertem modos ficam sem chip).
- [ ] `chat-header.tsx` monta `<ModeChip />` à direita do nome do agent.
- [ ] `use-chat.ts` atualiza `modeState` quando `session_mode_state` chega no stream.

**Verification:**
- [ ] `npm run typecheck` + `npm run build` passam.
- [ ] Manual UI: abrir chat com claude-acp, clicar no chip N vezes, verificar que cycla visualmente.

**Dependencies:** Task 5.
**Files likely touched:** `src/client/components/chat/mode-chip.tsx` (novo), `src/client/components/chat/chat-header.tsx`, `src/client/hooks/use-chat.ts`, `src/client/lib/types.ts` (ChatState).
**Scope:** S.

---

### Task 7: Wire chip → `setMode` end-to-end

**Description:** Click no chip dispara uma POST para uma rota nova `POST /api/acp/:chatId/mode` que chama `AcpSession.setMode(id)`. Alternativa rejeitada: reusar `/respond` — semântica diferente, piora legibilidade.

**Acceptance criteria:**
- [ ] `POST /api/acp/:chatId/mode` existe e roteia para a sessão certa.
- [ ] Click no chip envia POST e atualiza UI otimistamente.
- [ ] Se o agent responder `session/mode_updated`, UI reconcilia (confirmação).
- [ ] Erros de setMode aparecem como toast/error card.

**Verification:**
- [ ] `npm run typecheck` + `npm run build` passam.
- [ ] Manual UAT (claude-acp): clicar chip, conferir ndjson mostrando `session/set_mode` enviado.
- [ ] Manual UAT (codex-acp): idem.
- [ ] Se um dos dois não advertir modos, documentar na UAT report como known gap — não é blocker.

**Dependencies:** Task 6.
**Files likely touched:** `src/server/routes/chat.ts` (ou novo módulo `routes/acp.ts`), `src/client/components/chat/mode-chip.tsx`, `src/client/lib/api.ts`.
**Scope:** S.

---

### ✅ Checkpoint — ACP Mode Cycling
- [ ] Chip visível com claude-acp.
- [ ] Click cycla modo e ndjson confirma envio.
- [ ] Streaming de texto intacto (sanity: mandar uma mensagem, confirmar que chega normal).
- [ ] Human review antes de prosseguir.

---

## Phase 3 — ACP Per-Tool Permissions (Slice C da spec)

### Task 8: Remover auto-approve em `acp-session.ts:120-127`

**Description:** Substituir o corpo atual do handler `requestPermission` por uma chamada ao `permission-bridge.requestPermission`. Emitir `permission_request` no stream. Aguardar a Promise. Traduzir `RequestPermissionOutcome` de volta para `RequestPermissionResponse` do ACP SDK.

**Acceptance criteria:**
- [ ] `acp-session.ts` não contém mais o fallback `options?.[0]` → selected.
- [ ] Handler chama `requestPermission(toolCallId, options, signal)` do bridge.
- [ ] Emite `{ type: "permission_request", ... }` no stream **antes** de aguardar.
- [ ] Traduz outcome back (aceite → `{ outcome: "selected", optionId }`, reject/cancel → `{ outcome: "cancelled" }` ou equivalente do SDK).
- [ ] Abort do prompt do chat → bridge aborta → handler rejeita → ACP SDK recebe error.

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Manual: rodar Claude Code via claude-acp com uma prompt que peça bash, conferir que o stream emite `permission_request` e o agent pausa.
- [ ] `grep -n "optionId: first.optionId" src/server/agent/acp-session.ts` retorna zero matches (evita re-introdução acidental).

**Dependencies:** Task 4.
**Files likely touched:** `src/server/agent/acp-session.ts`.
**Scope:** S.

---

### Task 9: `<PermissionPrompt />` component inline

**Description:** Componente que recebe `PermissionPrompt` prop (id, toolCallId, options). Renderiza botões conforme `PermissionOptionKind` (`allow_once`, `allow_always`, `reject_once`, `reject_always`). Click envia resposta via `respondToPrompt(id, ...)`.

**Acceptance criteria:**
- [ ] Renderiza N botões conforme options.
- [ ] Botões usam variant shadcn apropriado (`default`/`destructive`).
- [ ] Click chama `respondToPrompt(id, { outcome: "selected", optionId })` e o card some quando `use-chat` o remove do pending map.
- [ ] Keyboard accessible (tab + enter).

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Manual UAT: mandar prompt que pede bash no claude-acp, clicar Allow, confirmar que o tool call segue e termina verde.
- [ ] Click Reject, confirmar que o tool call termina com `status: "error"`.

**Dependencies:** Task 8.
**Files likely touched:** `src/client/components/chat/permission-prompt.tsx` (novo), `src/client/components/chat/message-list.tsx`.
**Scope:** M.

---

### Task 10: `allow_always` caching (session-scoped)

**Description:** Quando o usuário escolhe `allow_always`, guardar em `Map<(toolName, chatSessionId), "allowed">` no bridge. Próximas chamadas do mesmo tool na mesma session pulam o bridge e retornam allow imediato. Zerado em disconnect da session.

**Acceptance criteria:**
- [ ] Cache adicionado ao `permission-bridge.ts`.
- [ ] Hook no AcpSession.close() limpa o cache da session.
- [ ] Allow Always para `bash` não re-prompta em calls subsequentes dentro da mesma session.
- [ ] Novo chat → cache zerado.

**Verification:**
- [ ] Manual UAT: allow-always bash, mandar segunda prompt que usa bash, confirmar sem novo prompt.
- [ ] Unit test adicional em `permission-bridge.test.ts` cobre o cache.

**Dependencies:** Task 9.
**Files likely touched:** `src/server/agent/permission-bridge.ts`, `src/server/agent/permission-bridge.test.ts`, `src/server/agent/acp-session.ts`.
**Scope:** S.

---

### ✅ Checkpoint — ACP Permissions
- [ ] Happy path (Allow Once) funciona claude-acp + codex-acp.
- [ ] Reject path termina tool com erro visível.
- [ ] Allow Always cacheia dentro da session.
- [ ] Streaming + mode cycling não regressaram.
- [ ] Human review.

---

## Phase 4 — ACP Elicitation (Slice D da spec)

### Task 11: Declarar `ElicitationCapabilities` no initialize

**Description:** Incluir `elicitation: { type: "form" }` (ou equivalente) no payload de `initialize` do `ClientSideConnection`. Confirmar estrutura exata contra `@agentclientprotocol/sdk` types.

**Acceptance criteria:**
- [ ] Initialize envia capability.
- [ ] Não quebra sessions existentes (resposta do agent continua válida).

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Manual: ndjson log mostra capability no handshake.

**Dependencies:** Task 10.
**Files likely touched:** `src/server/agent/acp-session.ts`.
**Scope:** XS.

---

### Task 12: Handler de elicitation no Client + bridge

**Description:** Adicionar handler `elicitation` ao objeto `client` de `acp-session.ts`. Chama `permission-bridge.requestElicitation(message, schema, signal)`, emite `elicitation_request` no stream, aguarda, traduz resposta para `ElicitationResponse` do SDK.

**Acceptance criteria:**
- [ ] Handler presente e retorna Promise.
- [ ] Emite evento antes de aguardar.
- [ ] Accept → `{ action: "accept", content }`; Cancel → `{ action: "cancel" }`.
- [ ] AbortSignal propagado.

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Manual UAT: **se claude-acp emitir elicitation hoje**, conferir que chega. Se não emitir (Q3), documentar no UAT report e validar só com PI runtime na Fase 6.

**Dependencies:** Task 11.
**Files likely touched:** `src/server/agent/acp-session.ts`.
**Scope:** S.

---

### Task 13: `<ElicitationPrompt />` component

**Description:** Componente que recebe `(id, message, requestedSchema)`. Renderiza form plain HTML baseado no schema — suportar os 5 tipos listados na spec: `string` (text), `string` com `enum` (select), `number`, `boolean` (checkbox), `array of string` (multi-select). Submit → `respondToPrompt(id, { action: "accept", content })`. Cancel → `{ action: "cancel" }`.

**Acceptance criteria:**
- [ ] Componente renderiza os 5 tipos de campo.
- [ ] Validação mínima (required fields do schema).
- [ ] Submit envia shape ACP-compatível.
- [ ] Cancel também funciona.
- [ ] Monta via `message-list.tsx` como pseudo-mensagem.

**Verification:**
- [ ] `npm run typecheck` + `npm run build` passam.
- [ ] Manual UAT: se disponível, com agent que emite elicitation. Senão, testar renderização via mock manual (criar um pending no bridge via curl para trigger).

**Dependencies:** Task 12.
**Files likely touched:** `src/client/components/chat/elicitation-prompt.tsx` (novo), `src/client/components/chat/message-list.tsx`.
**Scope:** M.

---

### ✅ Checkpoint — ACP Elicitation
- [ ] Infra de elicitation funciona ponta-a-ponta (mesmo que nenhum agent real a use ainda).
- [ ] Nenhuma regressão em permissions nem mode cycling.
- [ ] Human review.

---

## Phase 5 — PI Runtime Mode + beforeToolCall (Slice E da spec)

### Task 14: `session-mode.ts` módulo

**Description:** Módulo que mantém mode state por-chat para o PI runtime. Como PI é stateless per request hoje, precisamos de um `chatSessionId` novo. Decisão: gerar server-side na primeira POST de uma "conversa" — o client pin e re-envia nas subsequentes. Simpler: o client passa a gerar um UUID quando uma nova conversa começa, e envia em todas as POSTs. O server usa esse id como chave em `Map<chatSessionId, CurrentMode>`.

**Acceptance criteria:**
- [ ] `session-mode.ts` exporta `getMode(chatSessionId)`, `setMode(chatSessionId, modeId)`, `DEFAULT_PI_MODES` constante.
- [ ] `DEFAULT_PI_MODES = [default, acceptEdits, plan, bypassPermissions]` com shapes `SessionMode` do ACP SDK.
- [ ] `getMode` retorna `"default"` se não tiver entrada.
- [ ] Testes unitários em `session-mode.test.ts`.

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Unit tests passam.

**Dependencies:** Task 4.
**Files likely touched:** `src/server/agent/session-mode.ts` (novo), `src/server/agent/session-mode.test.ts` (novo), `src/client/lib/types.ts` (chatSessionId no body).
**Scope:** S.

---

### Task 15: `pi-runtime.ts` — beforeToolCall hook + mode-aware filtering

**Description:** Passar `beforeToolCall` para o agent loop do pi-agent-core. Comportamento por modo:
- `plan`: se tool é write-class (edit/write/bash), retornar `{ block: true, reason: "plan mode: read-only" }` sem prompt.
- `bypassPermissions`: retornar undefined (allow-all sem prompt).
- `acceptEdits`: se tool é write-class, allow; se é bash, prompt via bridge.
- `default`: sempre prompt via bridge.

Write-class determinado por lista hardcoded em `session-mode.ts`.

Ao iniciar a prompt loop, emitir `session_mode_state` com os modos do PI.

**Acceptance criteria:**
- [ ] `beforeToolCall` assinatura confere com `@mariozechner/pi-agent-core` types.d.ts:174 (verificar na Task 14).
- [ ] 4 ramos de modo implementados com teste do plan mode mais agressivo.
- [ ] Emissão de `session_mode_state` no início do prompt.
- [ ] Abort do signal propaga para bridge.

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Manual UAT: rodar PI runtime, cycling chip para `plan`, mandar prompt que tenta editar arquivo, confirmar erro imediato sem prompt.
- [ ] Manual UAT: modo `default`, prompt que usa bash, confirmar prompt inline.
- [ ] Manual UAT: modo `bypassPermissions`, prompt que usa bash, confirmar sem prompt.

**Dependencies:** Task 14, Task 9 (reusa PermissionPrompt UI).
**Files likely touched:** `src/server/agent/pi-runtime.ts`, `src/server/routes/chat.ts` (passa chatSessionId), `src/server/agent/session-mode.ts`.
**Scope:** M.

---

### Task 16: ModeChip funciona com PI runtime

**Description:** Server-side, o PI path precisa expor `getModeState()` e `setMode()` análogos ao AcpSession. Client, se `modeState != null`, já renderiza chip (herdado de Task 6) — então o trabalho é só garantir que:
1. Primeiro evento do stream no PI runtime é `session_mode_state` com os 4 modos default.
2. `POST /api/pi/:chatSessionId/mode` existe e atualiza `session-mode.ts`.
3. Client envia para endpoint certo baseado no runtime ativo (helper `setMode(runtime, chatSessionId, modeId)`).

**Acceptance criteria:**
- [ ] Client chip funciona identicamente em PI e ACP — zero diff na UI.
- [ ] Mode change em PI persiste até próximo POST.
- [ ] Mode change não afeta ACP session e vice-versa.

**Verification:**
- [ ] Manual UAT: trocar entre PI ↔ claude-acp via agent picker, confirmar que cada um mantém seu próprio mode state.

**Dependencies:** Task 15.
**Files likely touched:** `src/server/routes/chat.ts` (ou `routes/pi.ts`), `src/client/lib/api.ts`, `src/client/components/chat/mode-chip.tsx`.
**Scope:** S.

---

### ✅ Checkpoint — PI Permissions
- [ ] Plan mode bloqueia writes em PI.
- [ ] Default mode prompta em bash.
- [ ] Bypass mode roda sem prompt.
- [ ] Mode state isolado entre PI e ACP.
- [ ] Human review.

---

## Phase 6 — PI Runtime `askUserQuestion` Tool (Slice F da spec)

### Task 17: Tool definition `ask-user-tool.ts`

**Description:** Tool `askUserQuestion` com schema Zod/JSON minimalista: `{ message: string, requestedSchema: ElicitationSchema }`. Implementação: chama `permission-bridge.requestElicitation(message, requestedSchema, signal)`, retorna o conteúdo da response como string JSON para o LLM consumir.

**Acceptance criteria:**
- [ ] Tool definition usa o tipo `Tool` de `@mariozechner/pi-ai`.
- [ ] `execute` chama bridge e retorna `ToolResult` apropriado.
- [ ] Abort propagado.
- [ ] Schema do input permite os 5 tipos de campo.

**Verification:**
- [ ] `npm run typecheck` passa.
- [ ] Unit smoke (opcional): mock bridge, rodar execute, assert shape.

**Dependencies:** Task 15.
**Files likely touched:** `src/server/agent/ask-user-tool.ts` (novo).
**Scope:** S.

---

### Task 18: Registrar tool no `tools.ts` e verificar E2E

**Description:** Adicionar `askUserQuestion` ao `pocTools` em `tools.ts`. Testar end-to-end com uma prompt que force o LLM a perguntar algo.

**Acceptance criteria:**
- [ ] Tool aparece no tool list do PI runtime.
- [ ] LLM pode invocá-la (prompt tipo "pergunte ao usuário qual linguagem ele prefere antes de continuar").
- [ ] ElicitationPrompt renderiza.
- [ ] Submit volta como tool result e o LLM continua.

**Verification:**
- [ ] Manual UAT executado e documentado.
- [ ] `npm run typecheck` + `npm run build` passam.

**Dependencies:** Task 17, Task 13 (UI).
**Files likely touched:** `src/server/agent/tools.ts`.
**Scope:** S.

---

### ✅ Checkpoint — PI Elicitation
- [ ] askUserQuestion funciona ponta-a-ponta no PI runtime.
- [ ] Non-regression em todas as outras features.
- [ ] Human review.

---

## Phase 7 — UAT + Doc Sweep

### Task 19: UAT pass completo em todos os success criteria da spec

**Description:** Executar os 10 critérios testáveis da seção 1 da spec, marcar cada um na tabela abaixo, anexar o report a este plano como apêndice.

**Acceptance criteria:**
- [ ] Todos os 10 critérios verificados.
- [ ] Known gaps (ex: claude-acp não advertir modos) documentados explicitamente.
- [ ] Tabela de resultado anexada ao final deste arquivo.

**Verification:**
- [ ] Human review do report.

**Dependencies:** Task 18.
**Files likely touched:** `.harn/docs/specs/permissions-and-ask-user-plan.md` (apêndice).
**Scope:** S.

---

### Task 20: Doc sweep

**Description:** Atualizar `CLAUDE.md` (se aplicável), adicionar breve seção no README sobre modes/permissions (se existir), garantir que a spec original fica em sync (sem contradição — se houve desvios, anotar na spec).

**Acceptance criteria:**
- [ ] Docs refletem o que foi entregue.
- [ ] Qualquer desvio da spec está registrado.

**Verification:**
- [ ] Human review final.

**Dependencies:** Task 19.
**Files likely touched:** `CLAUDE.md`, `.harn/docs/specs/permissions-and-ask-user.md` (se houver desvio).
**Scope:** XS.

---

### ✅ Checkpoint — Complete
- [ ] Todos os 10 acceptance criteria da spec verificados.
- [ ] Nenhuma regressão.
- [ ] Human approval final antes de merge para main.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Claude-acp não advertir `availableModes` | Medium | Fallback: chip não renderiza. Documentar como known gap. PI runtime valida a funcionalidade. |
| Claude-acp não emitir `ElicitationRequest` hoje | Medium | Construímos a infra mesmo assim; PI runtime valida via `askUserQuestion` tool. Futuro agent update usará a infra existente. |
| `beforeToolCall` signature do pi-agent-core não bater com a spec | High | Verificar em `node_modules/@mariozechner/pi-agent-core/dist/types.d.ts:174` **antes** da Task 15. Se diferente, ajustar a Task 15 sem replanejar o plano inteiro. |
| ACP SDK types divergirem (shapes diferentes dos assumidos) | High | Task 2 é o canary. Se typecheck falha, pausar e reavaliar. |
| Bridge em memória vazar entre reloads do dev server | Low | `tsx watch` reinicia o processo → Map zerado. Aceitável; já está scoped como session-only. |
| `/respond` stateless + promptId colisão | Very Low | UUID v4 tem entropia suficiente para POC single-user. |
| Plan mode block via beforeToolCall não ser robusto o bastante (LLM tenta outros tools) | Medium | Lista write-class tem que incluir todos os mutators. Revisar na Task 15 contra `pocTools`. |
| Tarefas S/M maiores que o esperado (ex: Task 4) | Low-Medium | Quebrar em XS no momento se necessário; cada task já tem acceptance criteria independentes. |

---

## Open Questions (a resolver durante IMPLEMENT)

Herdadas da spec, ainda abertas:

1. **Q1:** `claude-acp` advertte `availableModes`? → Verificar em Task 5.
2. **Q2:** `codex-acp` advertte `availableModes`? → Verificar em Task 5.
3. **Q3:** `claude-acp` emite `ElicitationRequest` hoje? → Verificar em Task 12.

Resolvidas aqui, podem ser revisadas pelo human:

4. **Q4 ✓:** `POST /api/chat/respond` stateless, id-based lookup.
5. **Q5 ✓:** PI mode persistence session-only.
6. **Q6 ✓:** `allow_always` scope = `(toolName, chatSessionId)`.
7. **Q7 ✓:** Rejeição → tool error card existente, sem novo variant.
8. **Q8 ✓:** `typecheck` não existe — Task 1 adiciona.

---

## Parallelization notes

Se houver múltiplas sessions de trabalho:

- **Safe to parallelize:** Phase 2 (ACP modes) e Phase 5 (PI modes) podem ser feitas em paralelo APÓS a Fase 1 (ambas dependem só do schema foundation).
- **Must be sequential:** Phase 3 → Phase 4 (elicitation depende de permissions infra).
- **Must be sequential:** Phase 5 → Phase 6 (tool depende do bridge wiring do PI).

Recomendação: uma session faz 1 → 2 → 3 → 4, outra faz 1 (sync) → 5 → 6, merge em 7. Mas o POC é single-developer, então a ordem linear do plano é a default.

---

## Plan verification checklist

- [x] Cada task tem acceptance criteria
- [x] Cada task tem verification step
- [x] Dependências mapeadas e ordenadas
- [x] Nenhuma task XL (> 8 arquivos)
- [x] Checkpoints entre fases (4 no total + 1 final)
- [ ] **Human review & approval antes de iniciar Task 1**

**→ Próximo passo:** revise e aprove este plano. Se OK, avançamos para `agent-skills:incremental-implementation` começando pela Task 1.

---

## Desvios do plano (execution report)

Registrado em 2026-04-11 ao final da Wave 3 (doc sweep). Cada item foi confirmado lendo o código entregue.

1. **Elicitation handler via `extMethod`, não handler direto.**
   - Arquivo: `src/server/agent/acp-session.ts` (linhas ~210-247).
   - O plano (Task 12) assumia um handler `elicitation` no objeto `Client` do SDK. Na prática o tipo `Client` de `@agentclientprotocol/sdk` não expõe esse método; a implementação caiu em `extMethod(method, params)` detectando `method === "session/elicitation"` (constante `ELICITATION_METHOD` em `acp-session.ts:26`). Comportamento equivalente, só a porta de entrada mudou.

2. **Shape de resposta de elicitation tem `action` aninhado em `action`.**
   - Arquivo: `src/server/agent/acp-session.ts` (linha ~241).
   - A spec (seção 1, critério 7) fala de `action: "accept"` / `action: "cancel"` direto. O zod schema do SDK exige `{ action: { action: "accept", content } }` e `{ action: { action: "cancel" } }`. O wire shape no servidor foi ajustado; o cliente deve produzir o mesmo formato ao postar em `/api/chat/respond`.

3. **Endpoints de mode são separados por runtime, não rota única.**
   - Arquivos: `src/server/routes/acp.ts` (`POST /api/acp/:chatId/mode`) e `src/server/routes/pi.ts` (`POST /api/pi/:chatSessionId/mode` + `GET /api/pi/:chatSessionId/mode`).
   - A Task 7 já discutia separar e ficou assim. Documentando explicitamente aqui porque a Task 16 ainda mencionava "routes/chat.ts" como possível host. O cliente escolhe o endpoint conforme o runtime ativo.

4. **Cache `allow_always` chaveado por `toolKey = title ?? kind`, não por `toolName`.**
   - Arquivos: `src/server/agent/permission-bridge.ts` (`cacheAllowAlways(sessionKey, toolName)` — nome do parâmetro ainda é `toolName`, mas recebe o `toolKey`) e `src/server/agent/acp-session.ts:166` (`const toolKey = params.toolCall.title ?? params.toolCall.kind ?? null`).
   - O ACP SDK identifica tools na requisição de permissão por `title` (com `kind` como fallback). Não há um `toolName` canônico. A Task 10 foi cumprida com essa chave; o comportamento casa com a intenção da spec (scope `(toolKey, chatSessionId)`).

5. **Rota `POST /api/chat/respond` vive em `src/server/routes/chat.ts`, não em rota separada.**
   - Arquivo: `src/server/routes/chat.ts:173`.
   - A Task 4 listava como opção um módulo novo `routes/respond.ts`. A foundation-dev preferiu adicionar a rota dentro de `chat.ts` (mount path `/api/chat`), o que mantém o bridge contido num arquivo só. Sem impacto no contrato público.

6. **`PROMPT_PERMISSION_OPTIONS` do PI runtime foi hardcoded com 3 opções.**
   - Arquivo: `src/server/agent/pi-runtime.ts:94-98` — `[allow_once, allow_always, reject_once]`.
   - O plano (Task 15) não detalhava o shape exato; a implementação omitiu `reject_always` por enquanto. Débito técnico: se o usuário pedir "reject always" no PI runtime, não há opção. O wire suporta — só a UI default não oferece.

7. **Cache `allow_always` no PI runtime ainda NÃO é consultado (débito técnico).**
   - Arquivo: `src/server/agent/pi-runtime.ts` (`beforeToolCall` chama o bridge toda vez; `checkAllowAlwaysCache` do `permission-bridge.ts` só é acionado no ACP path em `acp-session.ts:168`).
   - A Task 10 implementou o cache mas só ligou o lado ACP. Se o usuário escolher "allow always" num tool PI, a próxima call do mesmo tool ainda vai promptar. Débito técnico registrado aqui — deve ser ligado quando alguém tocar `pi-runtime.ts` em seguida.

### Task 19 do plano — UAT manual completo: PENDENTE

A Task 19 (UAT pass completo dos 10 critérios da spec) **não foi executada** nesta onda. É trabalho humano manual que exige exercer:

- claude-acp real (mode cycling, request_permission, elicitation se o agente advertir hoje)
- codex-acp real (mesmas 3 verticais)
- PI runtime (modos `default`/`acceptEdits`/`plan`/`bypassPermissions`, `askUserQuestion` tool, rejection path)

Nenhum agente LLM conseguiu reproduzir esse fluxo dentro da Wave 3. Fica como gate humano antes do "merge para main" do checkpoint final. Quando for executada, o report deve vir como apêndice adicional a este arquivo (não substituir este).
