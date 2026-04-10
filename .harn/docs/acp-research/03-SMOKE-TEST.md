# ACP Runtime Smoke Test

Plano de smoke test manual para validar a integração ACP end-to-end.

## Pré-requisitos

1. Backend + frontend rodando via `npm run dev` (Vite :5173 + backend :3001).
2. Pelo menos um dos CLIs ACP instalado e autenticado (ver `00-SETUP.md`):
   - `claude-agent-acp`
   - `codex-acp`
3. Credenciais PI (anthropic/openai) configuradas para o teste de regressão.

## Test Matrix

### TC1 — PI mode unchanged (regressão)

**Objetivo**: garantir que o refactor Runtime não quebrou o fluxo PI existente.

1. Abrir http://localhost:5173.
2. RuntimeToggle deve mostrar "PI" como default.
3. Selecionar modelo anthropic ou openai via AgentModelPopover.
4. Enviar "Olá, quem é você?".

**Esperado**: streaming de texto em tempo real via SSE, mesma UX do baseline.

### TC2 — ACP + claude-agent-acp

**Objetivo**: validar spawn, sessão, prompt e streaming do runtime ACP com Claude.

1. Clicar no RuntimeToggle → selecionar "ACP (subprocess)".
2. Selecionar `claude-acp` no submenu.
3. Enviar "Liste os arquivos no diretório atual e resuma o conteúdo".

**Esperado**:
- Mensagem do usuário aparece imediatamente.
- `session/update` chega como eventos SSE (texto e/ou tool cards).
- Subprocesso `claude-agent-acp` visível em `ps aux | grep claude-agent-acp`.
- Tmpdir `/tmp/pi-ai-poc-acp-*` criado durante a execução.
- Subprocesso encerra e tmpdir é removido após conclusão.

### TC3 — ACP + codex-acp

Mesma sequência de TC2, mas selecionando `codex-acp`. Esperado: comportamento
equivalente, validando que o registry de agentes funciona para múltiplos CLIs.

### TC4 — Abort mid-stream

**Objetivo**: validar o kill cascade em abort manual.

1. Repetir TC2 com prompt longo ("escreva um ensaio de 2000 palavras").
2. Durante o streaming, clicar no botão stop.

**Esperado**:
- UI para de receber eventos imediatamente.
- Texto recebido até o momento é preservado.
- Subprocesso `claude-agent-acp` desaparece de `ps aux` em < 3s
  (SIGTERM → 2s → SIGKILL).
- Tmpdir é removido.
- Logs do backend: `[acp-runtime] abort signal received` / `tmpdir cleaned`.

### TC5 — Missing binary (erro limpo)

**Objetivo**: validar UX quando um agente ACP não está no PATH.

1. Editar `.harn/config/acp-agents.json` adicionando `"fake-acp": { "command": "nao-existe" }`.
2. Reiniciar `npm run dev`.
3. Consultar `curl :3001/api/runtime/acp/status` → deve ter `"fake-acp": false`.
4. Na UI, o RuntimeToggle deve mostrar `fake-acp` com "not in PATH" e desabilitado.
5. Se houver outro agente válido, o toggle ACP deve estar habilitado; caso contrário,
   desabilitado.

**Esperado**: nenhuma chamada pode ser feita para `fake-acp`; o backend retorna
400 se alguém forçar `acpAgent: "nao-existe"` via API.

### TC6 — Stall detection

**Objetivo**: validar que o stall de 60s mata o subprocesso.

1. Modo de teste: criar um "agente fake" que abre stdin mas nunca emite `session/update`.
   (Opcional — só executar se houver tempo para instrumentar o fake.)
2. Enviar prompt e aguardar 60s.

**Esperado**: SSE recebe evento `error` com mensagem "agent stalled",
subprocesso morto, tmpdir limpo.

### TC7 — Hard timeout (5min)

**Objetivo**: validar que um prompt que excede 300s é abortado.

Executável só com agente que demore > 5min — tipicamente pulado em smoke.

## Report template

```
Data: ____________
Versão: commit ____________
Ambiente: macOS/linux _________, Node _______

TC1 PI regressão            [ pass / fail ]  notas: ______
TC2 claude-acp stream       [ pass / fail ]  notas: ______
TC3 codex-acp stream        [ pass / fail ]  notas: ______
TC4 abort kill cascade      [ pass / fail ]  notas: ______
TC5 missing binary          [ pass / fail ]  notas: ______
TC6 stall detection         [ pass / fail / skipped ]
TC7 hard timeout            [ pass / fail / skipped ]
```

## Stateful Session Test Matrix (v2)

Adicionado na refatoração ACP Stateful Sessions (branch `feat/acp-stateful`).
Testa que a sessão ACP persiste entre prompts via `chatId`.

### ST1 — PI history (paridade de contexto)

1. Runtime PI, modelo Claude ou GPT.
2. Enviar "meu nome é Alice".
3. Aguardar resposta, depois enviar "qual o meu nome?".

**Esperado**: agente responde "Alice". DevTools Network mostra que a 2ª
request tem `history` com 2 mensagens.

### ST2 — ACP stateful continuity

1. Runtime ACP, `claude-acp`.
2. Enviar "meu nome é Bob".
3. Aguardar resposta, depois enviar "qual o meu nome?".

**Esperado**:
- Agente responde "Bob" sem replay.
- DevTools Network: ambas as requests têm `chatId` idêntico e **não** têm
  campo `history`.
- `ps aux | grep claude-agent-acp` mostra o **mesmo PID** entre os dois prompts.

### ST3 — ACP cancel preserva session

1. Executar ST2 passo 2.
2. Enviar prompt longo ("escreva 2000 palavras sobre X").
3. Clicar Stop a meio do streaming.
4. Conferir PID em `ps aux | grep claude-agent-acp`.
5. Enviar "continue a última resposta".

**Esperado**:
- PID **não muda** entre antes do Stop, depois do Stop, e depois do novo prompt.
- O novo prompt recebe resposta que continua o contexto da última resposta
  parcial (agente lembra do que estava dizendo).

### ST4 — New Chat limpa session

1. Conversa ativa em `claude-acp`, PID visível em `ps`.
2. Clicar "New Chat" no header.
3. Conferir Network: `DELETE /api/chat/session/<old-chatId>` aparece.
4. Conferir `ps` — PID some.
5. Enviar nova mensagem. PID novo aparece.

**Esperado**: troca de PID após New Chat + DELETE visível no Network.

### ST5 — Troca de agente limpa session

1. Conversa ativa em `claude-acp`.
2. Trocar para `codex-acp` via RuntimeToggle.
3. Conferir Network: DELETE para a sessão claude-acp.
4. Enviar mensagem — novo PID de `codex-acp`.

### ST6 — Troca de runtime limpa session

1. Conversa ativa em `claude-acp` (PI mode desativado).
2. Trocar runtime para PI.
3. Conferir Network: DELETE para a sessão ACP.
4. `ps aux | grep claude-agent-acp` — zero processos.

### ST7 — Server shutdown cleanup

1. Conversa ativa em `claude-acp` (subprocess vivo).
2. No terminal do backend: `kill -TERM $(lsof -ti:3001)` (ou Ctrl+C no dev server).
3. Conferir logs: `[shutdown] SIGTERM received, closing ACP sessions`.
4. Conferir `ps aux | grep -E 'claude-agent-acp|codex-acp'` — zero processos.
5. Conferir `ls /tmp/pi-ai-poc-acp-*` — nenhum tmpdir órfão.

### ST8 — Subprocess crash (recovery)

1. Conversa ativa em `claude-acp`, PID = X.
2. No terminal: `kill -9 X` (force kill o agente).
3. Enviar nova mensagem na UI.

**Esperado**:
- ErrorDisplay mostra erro contendo "subprocess exited" ou "session terminated".
- Frontend rotaciona automaticamente o `chatId` (useEffect observa error).
- Próxima mensagem cria novo PID e funciona normalmente.

## Comandos úteis para observação

```bash
# Observar subprocessos ACP vivos
watch -n 1 "ps aux | grep -E 'claude-agent-acp|codex-acp' | grep -v grep"

# Observar tmpdirs criados
watch -n 1 "ls -lad /tmp/pi-ai-poc-acp-*"

# Observar eventos SSE crus
curl -N -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"runtime":"acp","message":"hello","acpAgent":"claude-acp"}'
```
