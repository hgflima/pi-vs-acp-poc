# Debate Gate — Define → Develop

**POC**: pi-ai-poc · **Data**: 2026-04-10 · **Fase**: Gate entre 2/4 Define e 3/4 Develop
**Upstream**: `.harn/docs/acp-research/02-DEFINE.md`
**Style**: adversarial · 1 round · max 250 words por posição

## Participantes

| Slot | Provider | Status |
|---|---|---|
| Adversário 1 | Codex CLI (gpt-5.4) | ✅ respondeu |
| Adversário 2 | Gemini CLI | ✅ respondeu (demorou; chegou depois da síntese inicial) |
| Rebuttal | Claude (este conversa) | ✅ |

> Nota de método: Gemini CLI tem latência alta neste ambiente — chegou após a síntese inicial já escrita com base apenas no Codex. As duas posições adversariais foram lidas e comparadas; concordam no alvo principal (D7) e nos overturns secundários (D5/tempdir, D6/config). Gemini adiciona um ponto que Codex não cobre: **zombie processes** se SSE trava mid-stream. Incluído abaixo. O orchestrate.sh do plugin octo tem bug ativo (`mv: rename .tmp.X to :`) — debate rodou via dispatch direto aos CLIs.

---

## Round 1 — Adversário (Codex)

> **Foco**: atacar decisões D2, D3, D5, D6, D7 do Define doc. Citar seções. Terminar com a decisão que overturnaria.

**1. `D5/§9` — spawn-por-request não é "simpler"**
> "Just hides state management by multiplying failure paths. Every request now redoes `spawn → initialize → newSession → prompt → abort wiring → timeout wiring → stderr handling → cleanup`. That is more lifecycle code, not less. Persistent per-agent processes with explicit `session/reset` would centralize failures instead of re-implementing teardown on every turn."

**2. `D7` — drop history passthrough quebra o métrica de sucesso**
> "It invalidates the comparison. You claim the success metric is 'comparar visualmente o output do mesmo prompt' (§2), but ACP is denied `history` while PI keeps it. You are not comparing runtimes under equivalent conversational conditions. Mid-session toggle with 'nova conversa' doesn't save this; it narrows the benchmark into stateless single-turn demos."

**3. `D3/D6` — binários hardcoded sem verificação**
> "Assumes package and binary names that may not exist: `claude-acp` vs `claude-agent-acp`, repo names vs executable names, global install semantics, PATH discovery via `which`. 'Atualizar o mapa se diferir' is not a plan; it is an admission of unverified dependency risk. Plan B should be **configurable command paths in env/config**, not hardcoded strings."

**4. `D5` + `cwd: WORKSPACE_ROOT` — indefensível**
> "Your own risk table says agents may 'mexem no workspace real' and then still keeps the real source tree as the sandbox. **Tempdir clone or copy-on-write workspace is the only sane default** for a tool-executing agent POC."

**5. `D2` toggle no body — contratos poluídos**
> "Hurts discoverability, schema clarity, validation, and generated docs. Separate `/api/chat/pi` and `/api/chat/acp` gives cleaner contracts, fewer invalid parameter combinations, and simpler tests."

**Decisão que overturnaria**: `D7` — ship ACP sem history. "That breaks the comparison."

---

## Round 1 — Adversário 2 (Gemini, chegou tarde)

> Confirma Codex em todos os 5 pontos. Acrescenta ângulo que Codex não cobriu:

**Sobre D5 (error paths / zombies)**
> "D5's error paths (R12, R15) are a nightmare. If a subprocess hangs mid-SSE, your server-side loop blocks. **A persistent pool with heartbeats is the only way to ensure the 'Abort' (R7) actually kills the process instead of leaking zombies.**"

**Sobre D7 (history) — "goldfish mode"**
> "A coding agent without history is a goldfish; if it forgets the `read_file` results from the previous turn, it cannot function. You aren't 'comparing' agents; you're comparing lobotomized shadows."

**Sobre D5/workspace**
> "Setting `cwd: WORKSPACE_ROOT` is professional negligence. One hallucinated `rm -rf .` and the POC deletes its own source code. A `/sandbox` or `tmpdir` is a **hard requirement, not a 'recommendation'**."

**Decisão que overturnaria**: `D7` — idem Codex.

### Gemini-specific risk incorporado

Gemini levanta que `AcpRuntime` precisa de **detecção ativa de subprocess hanging** — não basta `kill` no abort, precisa também de keepalive/heartbeat durante o stream pra detectar agent que para de emitir `session/update`. Codex não cobriu isso.

**Nova mitigação** (vai pra Develop como parte de T8/T9):
- **Stall detection**: se `AcpRuntime` passar mais de 60s sem receber nenhum `session/update` nem ter o `prompt()` response resolvido, assumir hang e matar subprocess com SIGKILL. Emitir SSE `error` com mensagem "agent stalled".
- **Kill cascade completo**: no abort (request cancelada ou stall detectado ou timeout de 5min), sequência é `SIGTERM → 2s wait → SIGKILL → wait exit → rm -rf tempdir`. Mesmo caminho pra todas as causas.

---

## Round 1 — Rebuttal (Claude)

**Sobre D5 (spawn-per-request)**: *concedo parcialmente*. O ataque é justo em um ponto — mesmo código de lifecycle rodando toda request *é* mais código no hot path que uma versão pooled. Mas o Codex ignora três coisas: (a) POC single-user, QPS efetivo é 0.1-1, o hot path não é hot; (b) pool introduz concerns novos — lazy start, keepalive, detecção de crash assíncrono, reset entre conversas, shutdown gracioso do server; (c) agents ACP são processos externos *mutáveis* que podem corromper estado entre runs, e reset via `session/new` em conexão viva **não** garante limpeza (spawn novo sim). **Mantenho D5** para o primeiro corte mas adiciono escape hatch: deixar `AcpRuntime` usar uma closure interna `createConnection()` que pode ser trocada por versão pooled em Fase 2 sem mudar a interface pública.

**Sobre D7 (drop history)**: *Codex tem razão. Overturn.* O ataque é devastador porque aponta contradição interna: a métrica de sucesso do POC é "comparar PI e ACP no mesmo prompt", mas PI mantém history e ACP não. Comparação inválida. **D7 muda**: `AcpRuntime.prompt()` vai *também* aceitar `history` e enviar cada turno anterior como `session/prompt` sucessivo na mesma connection (modo subprocess-por-request replaying history no `initialize → newSession → loop de prompts`) OU usar `session/load` se disponível. Custo: pode dobrar latência em conversas longas. Ainda melhor que comparação inválida.

**Sobre D3/D6 (binários hardcoded)**: *Codex tem razão. Fortificar.* Plan B vira Plan A: mapa `ACP_AGENTS` lê de variável de ambiente `ACP_AGENTS_JSON` OU de `.harn/config/acp-agents.json`, com fallback hardcoded só pra o default. Assim o usuário pode apontar pra `~/bin/claude-acp-wrapper.sh` ou outro nome sem mudar código. **D6 muda**.

**Sobre D5 + cwd: WORKSPACE_ROOT**: *Codex tem razão. Não-negociável.* A tabela de riscos do Define já admitia isso ("Recomendação: spawn com cwd = tempdir dedicado") mas a decisão não refletiu. **Corrigir**: `AcpRuntime` cria `fs.mkdtemp(path.join(os.tmpdir(), 'pi-ai-poc-acp-'))` antes do spawn, passa como `cwd`, e faz `rm -rf` no cleanup. POC não precisa do source tree real pra validar "coding agent escreve arquivo + vemos tool call na UI" — um tempdir vazio já serve. **D5 muda**.

**Sobre D2 (body toggle vs endpoints separados)**: *rejeito*. O argumento do Codex é válido pra uma API pública com swagger/OpenAPI e múltiplos consumers. Este POC tem 1 consumer (o próprio frontend) e 0 docs geradas. Separar endpoints dobraria a superfície de rotas (`/api/chat/pi`, `/api/chat/acp`, e provavelmente também `/api/chat/acp/claude`, `/api/chat/acp/codex` pra ficar simétrico), sem benefício real. A validação que o Codex quer pode ser feita com Zod/TypeBox no body parser — o POC já usa TypeBox pra tools. **Mantenho D2** mas adiciono R16 (novo): validação discriminada do body.

---

## Síntese — o que muda no Define

### Decisões overturnadas (3)

| Decisão original | Nova decisão | Delta |
|---|---|---|
| **D5** `cwd: WORKSPACE_ROOT` no spawn | `cwd: mkdtempSync('/tmp/pi-ai-poc-acp-')` + cleanup no fim | Sandbox real; agents não tocam o source tree |
| **D6** binários hardcoded (`claude-agent-acp`, `codex-acp`) | Mapa carregado de `.harn/config/acp-agents.json` com fallback hardcoded; env var `ACP_AGENTS_JSON` override | Usuário pode configurar path, nome, args, env sem patchar código |
| **D7** sem history em ACP | `AcpRuntime.prompt()` aceita `history` e faz replay como sequência de `session/prompt` na mesma `ClientSideConnection` | Comparação entre PI e ACP volta a ser equivalente |

### Decisões mantidas com nota (2)

| Decisão | Por que | Nota |
|---|---|---|
| **D5** spawn-per-request | POC single-user, QPS desprezível, isolamento > latência | Refatorar em Fase 2 se latência virar problema. Manter interface que permita swap pra pool. |
| **D2** toggle no body | POC tem 1 consumer, 0 docs geradas, rotas extras sem benefício | Adicionar R16: validação discriminada do body (Zod/TypeBox) |

### Novos requisitos

- **R16**: Validação do body em `POST /api/chat` com discriminated union — quando `runtime === "acp"`, `acpAgent` é obrigatório; quando `runtime === "pi"`, `provider` e `model` são obrigatórios. Body inválido retorna 400 com mensagem específica.
- **R17**: `AcpRuntime` cria tempdir novo via `fs.mkdtempSync` antes de cada spawn, usa como `cwd`, remove com `fs.rmSync({recursive: true, force: true})` no cleanup (sempre, mesmo em erro/abort).
- **R18**: Mapa de agents ACP é carregado de `.harn/config/acp-agents.json` se existir, ou variável `ACP_AGENTS_JSON`, ou fallback hardcoded. Shape: `{ [id: string]: { command: string, args: string[], env?: Record<string,string> } }`.
- **R19**: `AcpRuntime.prompt(opts)` aceita `opts.history: AgentMessage[]` e faz replay via N chamadas a `session/prompt` na mesma connection antes do prompt atual, preservando ordem. Se a lista está vazia, comportamento igual ao antes.
- **R20** (vindo do Gemini): `AcpRuntime` tem stall detection — se 60s se passam sem nenhum `session/update` e sem `prompt()` resolver, o runtime assume hang, mata subprocess com `SIGTERM → 2s → SIGKILL`, remove tempdir, e emite SSE `error` com `"agent stalled (no update in 60s)"`. Mesmo kill cascade pro abort manual e pro timeout de 5min.

### Novas tasks em Develop

- **T4b** (dentro de T4): tempdir creation e cleanup no `AcpRuntime` (R17).
- **T4c** (dentro de T4): history replay loop no `AcpRuntime.prompt` (R19).
- **T5b** (dentro de T5): carregar `ACP_AGENTS` do arquivo/env com fallback (R18).
- **T7b** (dentro de T7): validação discriminada do body com TypeBox (R16).

## Verdito do Gate

✅ **Proceed to Develop** — com as 3 decisões overturnadas. O Define doc é atualizado com um changelog note apontando pra este debate. R16-R19 incorporados.

**Confidence**: Alta. O ataque pegou 3 buracos reais (tempdir, history, binário configurável). Os outros 2 (spawn-per-request, body toggle) foram defendidos com rationale específico pro contexto POC, e escape hatches estão documentados.

**Unknowns restantes**:
- Nome real dos pacotes NPM dos binários ACP (validar na T1 ao instalar).
- Se o agente ACP (`claude-agent-acp`) aceita `session/prompt` em sequência na mesma connection sem reset (assumimos que sim baseado na spec, mas só validaremos na T4).
- Se tools do Claude Code rodando em tempdir vazio vão fazer algo interessante pra mostrar na UI, ou se vão só falhar por não ter código pra ler (risco documentado, provavelmente precisamos popular o tempdir com 1-2 arquivos dummy).
