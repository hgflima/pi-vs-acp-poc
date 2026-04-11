# Spec: Gemini ACP Integration

> **Scope:** Adicionar `gemini-acp` como terceiro agent ACP, ao lado de `claude-acp` e `codex-acp`, usando `gemini --acp` como subprocess. **Auth delegada ao CLI** — o app não gerencia credenciais do Gemini.
>
> **Out of scope:** Integração Gemini no runtime PI (pi-ai provider). Será tratada em spec separada depois que este ACP pouso.

## 1. Objective

Permitir que o usuário escolha o Gemini CLI como agent ACP no chat do pi-ai-poc, mantendo paridade total de features com os ACP agents existentes (`claude-acp`, `codex-acp`):

- Troca de runtime via popover `RuntimeToggle`.
- Envio/recebimento de mensagens via protocolo ACP.
- Tool calls visíveis no chat.
- Permission prompts + elicitation (`askUserQuestion`) roteados pelo `permission-bridge`.
- Harness ativo + project-home respeitados como workspace root.
- Auth (API key ou OAuth Google) resolvida **fora** do app, via `gemini` CLI diretamente.

### User story

> Como usuário do pi-ai-poc, quero selecionar "gemini-acp" no seletor de runtime e conversar com o Gemini CLI como coding agent, exatamente como já faço com claude-agent e codex, sem precisar configurar API keys ou OAuth pelo app.

### Success criteria

1. Rodar `gemini` uma vez pra autenticar (OAuth Google *ou* `export GEMINI_API_KEY=...`) e em seguida o botão `gemini-acp` aparece habilitado no popover `RuntimeToggle`.
2. Selecionar `gemini-acp` e enviar uma mensagem produz streaming SSE idêntico ao claude-acp (mensagens + tool calls renderizados no chat).
3. Um tool call que dispara `permission_request` via `permission-bridge` abre o `PermissionDialog` no frontend, e a resposta do usuário é propagada de volta ao subprocess Gemini.
4. Um tool call `askUserQuestion` (elicitation) abre o `ElicitationDialog`, coleta resposta e retorna ao Gemini.
5. Trocar o `activeHarness` (project-home) e reiniciar a sessão faz o Gemini operar no novo workspace root.
6. `GET /api/acp/agents` retorna `{ "gemini-acp": true|false, ... }` refletindo presença do binário `gemini` no PATH.
7. Sem o `gemini` CLI instalado, o botão aparece com legenda `not in PATH` e permanece desabilitado (sem crash).

## 2. Tech Stack

- **Sem novas dependências.** Reaproveita a infra ACP existente:
  - `@zed-industries/agent-client-protocol` (já instalado)
  - `acp-session.ts` (subprocess lifecycle + bridge SSE)
  - `acp-session-registry.ts` (chat → session map)
  - `permission-bridge.ts` (request/response wire shape)
- **External runtime:** `gemini` CLI ≥ versão que suporta `--acp` (ver <https://geminicli.com/docs/cli/acp-mode/>). Verificação de versão mínima fica fora do app — se o CLI não aceitar `--acp`, o subprocess falha no spawn e o bridge reporta erro via SSE como qualquer outro agent.

## 3. Commands

Sem mudanças nos comandos do projeto:

```bash
# Dev
npm run dev              # Frontend (:5173) + Backend (:3001)
npm run dev:frontend
npm run dev:backend

# Build & check
npm run build
npm run lint
npm run typecheck        # se existir, senão `tsc --noEmit`
npm test                 # vitest

# Gemini CLI (pré-requisito do usuário — não gerenciado pelo app)
gemini                   # primeira execução → OAuth Google
# OU
export GEMINI_API_KEY=...
gemini --acp             # smoke test manual do modo ACP
```

## 4. Project Structure

Arquivos **modificados** (contagem estimada):

```
src/server/agent/acp-agents.ts          — +1 entrada no DEFAULT_AGENTS
.harn/config/acp-agents.json            — +1 entrada (override local, opcional mas recomendado)
```

Arquivos **potencialmente tocados** (só se um bug específico do Gemini aparecer durante o smoke test — não antecipar):

```
src/server/agent/acp-session.ts         — se env vars precisarem ser propagadas de forma custom
src/client/components/config/runtime-toggle.tsx — se o label "gemini-acp" ficar feio e quisermos cosmético
```

Arquivos **não tocados**: `credentials.ts`, `auth.ts`, `oauth.ts`, `permission-bridge.ts`, `ask-user-tool.ts`, `pi-runtime.ts`, `setup.ts`, connection-page, qualquer componente PI.

## 5. Code Style

Padrão existente do projeto. Exemplo concreto — o diff pretendido em `acp-agents.ts`:

```ts
const DEFAULT_AGENTS: AcpAgentMap = {
  "claude-acp": { command: "claude-agent-acp", args: [] },
  "codex-acp": { command: "codex-acp", args: [] },
  "gemini-acp": { command: "gemini", args: ["--acp"] },
}
```

Nada de wrappers, sem flag condicional, sem `process.env.GEMINI_ENABLED`. Entrada direta no map — mesmo padrão dos outros dois.

O override em `.harn/config/acp-agents.json` espelha o default pra quem quiser customizar flags:

```json
{
  "claude-acp": { "command": "claude-agent-acp", "args": [] },
  "codex-acp":  { "command": "codex-acp",        "args": [] },
  "gemini-acp": { "command": "gemini",           "args": ["--acp"] }
}
```

## 6. Testing Strategy

### Unit tests

- **`acp-agents` tests (se existirem)**: adicionar case que `loadAcpAgents()` retorna `gemini-acp` nos defaults. Se não houver test file, **não criar um só pra isso** — a cobertura já é trivialmente verificável via smoke test.
- **Sem testes novos em `acp-session.ts`**: o código não muda, então a regressão é coberta pelos testes existentes.

### Smoke test manual (obrigatório — este é o gate real)

Executar na ordem, marcar ✅/❌:

1. `which gemini` retorna caminho → instalar se faltar (`brew install gemini-cli` ou equivalente).
2. `gemini --acp --help` mostra ajuda sem erro → versão do CLI suporta ACP.
3. `npm run dev` → abrir `/chat`.
4. Clicar no popover de runtime → confirmar que `gemini-acp` aparece com bolinha verde (available).
5. Selecionar `gemini-acp` → label do botão muda pra `gemini-acp`.
6. Enviar mensagem curta (`"oi, lista os arquivos do diretório atual"`) → verificar:
   - Streaming de texto aparece no chat.
   - Tool call `read_dir` (ou equivalente Gemini) renderiza card.
7. Enviar mensagem que dispara permission prompt (`"crie um arquivo test.txt com 'hello'"`) → verificar:
   - `PermissionDialog` abre.
   - Clicar "Allow" propaga ao subprocess e a tool executa.
   - Clicar "Deny" cancela sem crash.
8. Dependendo se Gemini CLI suporta elicitation via ACP: enviar prompt que provoque pergunta de clarificação → verificar `ElicitationDialog`. **Se Gemini CLI não implementar elicitation, marcar como limitação conhecida, não bloquear o merge.**
9. Trocar o harness ativo pra outro diretório e enviar nova mensagem → confirmar que o Gemini opera no novo CWD.
10. `rm $(which gemini)` (ou renomear) → reiniciar backend → confirmar que `gemini-acp` aparece como `not in PATH` e fica desabilitado.

### Browser testing

Usar `document-skills:webapp-testing` / Playwright MCP pra automatizar passos 3–7 se der tempo, mas manual é aceitável pra este escopo.

## 7. Boundaries

### Always do
- Testar smoke end-to-end antes de marcar o spec como done.
- Executar `npm run lint` e `npm run build` antes de commitar.
- Manter o diff cirúrgico — idealmente 1 arquivo de código + 1 arquivo de config.
- Commit message no padrão: `feat(acp): add gemini-acp runtime`.

### Ask first
- Qualquer mudança em `acp-session.ts`, `permission-bridge.ts`, `credentials.ts`.
- Adicionar dependência nova.
- Criar novo route/endpoint.
- Modificar UX do `runtime-toggle` além do label.

### Never do
- Adicionar `"google"` ao tipo `Provider` em `credentials.ts` (é escopo do spec PI-Gemini futuro).
- Criar novo fluxo OAuth server-side pro Google.
- Injetar `GEMINI_API_KEY` a partir do `.env` do app (deixa o CLI ler do env do shell que iniciou o backend).
- Wrappar o comando `gemini` com scripts shell.
- Modificar `DEFAULT_AGENTS` pra incluir flags que desabilitem tools do Gemini CLI.
- Adicionar testes só pra bater coverage.

## 8. Implementation Plan (preview — vira Phase 2 completo depois da aprovação)

Ordem sugerida, ~1 commit total:

1. **T1** — Adicionar `gemini-acp` em `DEFAULT_AGENTS` (`acp-agents.ts`).
2. **T2** — Atualizar `.harn/config/acp-agents.json` pra espelhar o default.
3. **T3** — Rodar smoke test manual completo (passos 1–10 da §6).
4. **T4** — Corrigir qualquer gap descoberto no smoke test (sem antecipar).
5. **T5** — Commit único: `feat(acp): add gemini-acp runtime`.

Se durante o smoke test aparecer incompatibilidade do Gemini CLI com alguma feature (ex.: elicitation não implementada), documentar como "limitação conhecida" neste spec e abrir issue/phase separada — **não tentar contornar no app**.

## 9. Success Criteria (testável)

Espelham §1 — todos devem passar no smoke test manual antes do merge:

- [x] `GET /api/runtime/acp/status` retorna `gemini-acp` (true se instalado, false senão).
- [x] `RuntimeToggle` popover lista `gemini-acp`.
- [x] Envio de mensagem via `gemini-acp` produz streaming SSE visível.
- [x] Tool calls renderizam cards de visualização.
- [x] Permission prompt → dialog → resposta → execução funciona (Allow + Deny ambos validados).
- [x] Workspace root do subprocess = harness ativo / project-home (validado via tool `pwd`).
- [x] Graceful degradation quando `gemini` não está no PATH (UI mostra "not in PATH"; outros agents intactos).
- [x] Sem crash do backend ao matar o subprocess Gemini no meio da sessão (zero processos órfãos).
- [x] `npm run typecheck` + `npm run build` limpos.

**Limitação aceita (autorizada por §10 Q2):** Gemini CLI 0.37.1 não emite `askUserQuestion` via ACP — em prompts ambíguos o modelo responde com perguntas inline no texto do assistant ao invés de abrir o `ElicitationDialog`. Sem crash, sem regressão da nossa integração. Reportável upstream se o Gemini CLI suportar elicitation em versão futura.

## 10. Open Questions

1. **Version pinning do Gemini CLI**: queremos registrar uma versão mínima conhecida-boa neste spec pra futuros debugs? Proponho não pinar agora — o smoke test do dia do merge vira a versão de referência.
Resp: Ok
2. **Elicitation parity**: se Gemini CLI não suportar elicitation via ACP hoje, o spec fica parcial (success criteria 7.4 fica N/A). OK aceitar? Minha recomendação: sim, é limitação do upstream, não do nosso app.
Resp: Sim
3. **Nome do ID**: `gemini-acp` é consistente com `claude-acp` / `codex-acp`. Manter.
Resp: Sim

## 11. Risks

| Risco | Prob. | Mitigação |
|---|---|---|
| `gemini --acp` tem flags/env vars diferentes do esperado | média | Smoke test cedo revela; ajuste é localizado em `acp-agents.ts` args. |
| Permission/elicitation wire shape do Gemini diverge do ACP padrão | baixa | Zed ACP é canônico; se divergir, reportamos upstream ao invés de patchar. |
| Gemini CLI spawn vaza processo (não respeita SIGTERM) | baixa | `acp-session.ts` já tem shutdown hook; validar no smoke test passo 10. |
| Auth expira mid-session (OAuth token refresh do CLI) | baixa | Problema do CLI, não nosso. Se bugar, documentar e reportar upstream. |

---

**Spec status:** 🟢 Shipped — Phase 1 commit `a80c2995` (`feat(acp): add gemini-acp runtime`). Smoke test 9/9 success criteria validados (incluindo limitação documentada de elicitation).
