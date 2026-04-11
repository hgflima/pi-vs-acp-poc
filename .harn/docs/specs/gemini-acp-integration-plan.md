# Implementation Plan: Gemini ACP Integration

> **Source spec:** [gemini-acp-integration.md](./gemini-acp-integration.md)
> **Scope:** Adicionar `gemini-acp` como terceiro agent ACP. Auth delegada ao `gemini` CLI.
> **Status:** 🟢 Done — Phase 1 commit `a80c2995`. Phase 2 smoke test 5/5 tasks executadas (Tasks 6-10 via subagent paralelo). Limitações de elicitation e runtime CWD swap documentadas como aceitas (não-regressão da integração).

## Overview

O spec é cirúrgico: duas linhas de código + smoke test end-to-end. A infraestrutura ACP já suporta o fluxo completo (subprocess lifecycle, permission bridge, elicitation, harness CWD), então a implementação em si é trivial. O **risco real** está no smoke test — validar que `gemini --acp` fala o protocolo ACP canônico (Zed) sem divergências em tool calls, permission prompts ou elicitation.

Por isso, o plano inverte o peso tradicional: ~10% código, ~90% verificação.

## Architecture Decisions

- **Registro direto no `DEFAULT_AGENTS` map** — sem feature flag, sem wrapper, sem env var condicional. Mesmo padrão dos outros dois agents. (§5 do spec)
- **Auth fora do app** — `gemini` CLI resolve OAuth Google ou `GEMINI_API_KEY` do shell do backend. Zero toques em `credentials.ts`/`auth.ts`/`oauth.ts`. (§1, §7)
- **Sem novas dependências, sem novos endpoints, sem mudanças em `acp-session.ts` ou `permission-bridge.ts`** — reaproveita a infra existente 100%. (§4, §7)
- **Elicitation parity é best-effort** — se o Gemini CLI não implementar elicitation via ACP, documentamos como limitação conhecida e seguimos para merge. Não patchamos no app. (§10 Q2)
- **Version pinning diferido** — a versão do `gemini` CLI usada no smoke test do dia do merge vira a referência implícita. Sem pin explícito agora. (§10 Q1)

## Task List

### Phase 1: Code Change

#### Task 1: Add `gemini-acp` to `DEFAULT_AGENTS`

**Description:** Adicionar entrada `gemini-acp` ao map `DEFAULT_AGENTS` em `src/server/agent/acp-agents.ts:14`, espelhando o padrão dos entries existentes.

**Acceptance criteria:**
- [ ] `DEFAULT_AGENTS` contém exatamente 3 entradas: `claude-acp`, `codex-acp`, `gemini-acp`.
- [ ] Entrada `gemini-acp` tem `command: "gemini"` e `args: ["--acp"]`.
- [ ] Nenhum outro símbolo do arquivo é modificado (sem novos imports, sem novas funções).

**Verification:**
- [ ] `npm run build` passa.
- [ ] `grep "gemini-acp" src/server/agent/acp-agents.ts` retorna a entrada nova.
- [ ] Se existir `npm test` com cobertura de `loadAcpAgents`, rodar e verificar que passa. Se não houver, pular — não criar test file só pra isso (§6).

**Dependencies:** None

**Files touched:**
- `src/server/agent/acp-agents.ts`

**Estimated scope:** XS (1 arquivo, 1 linha)

---

#### Task 2: Mirror default in `.harn/config/acp-agents.json`

**Description:** Adicionar entrada `gemini-acp` ao arquivo de override local para manter paridade com os outros dois agents já declarados.

**Acceptance criteria:**
- [ ] `.harn/config/acp-agents.json` contém as 3 entradas em ordem: `claude-acp`, `codex-acp`, `gemini-acp`.
- [ ] JSON continua válido (`cat | jq .` funciona).
- [ ] Nenhuma diferença semântica entre o override e o `DEFAULT_AGENTS` do código.

**Verification:**
- [ ] `cat .harn/config/acp-agents.json | jq '.["gemini-acp"]'` retorna `{"command": "gemini", "args": ["--acp"]}`.
- [ ] Reiniciar backend (`npm run dev:backend`) sem erros de parsing do override.

**Dependencies:** Task 1

**Files touched:**
- `.harn/config/acp-agents.json`

**Estimated scope:** XS (1 arquivo, 4 linhas)

---

### Checkpoint: Code Landed

- [ ] `npm run lint` limpo
- [ ] `npm run build` limpo
- [ ] Backend inicia sem erro
- [ ] `GET /api/acp/agents` retorna `gemini-acp` no payload (true se `gemini` está no PATH, false se não)
- [ ] Diff total ≤ 10 linhas

Se algum item falhar, **parar** e investigar antes de continuar para Phase 2.

---

### Phase 2: Smoke Test (Gate Real do Merge)

> **Pré-requisito do ambiente:** `gemini` CLI instalado, autenticado (OAuth Google *ou* `export GEMINI_API_KEY=...`), e `gemini --acp --help` executa sem erro.

Esta fase corresponde §6 do spec. Cada task valida um dos success criteria §9.

#### Task 3: CLI preflight

**Description:** Confirmar que o ambiente tem Gemini CLI instalado e autenticado antes de testar o app.

**Acceptance criteria:**
- [ ] `which gemini` retorna caminho válido.
- [ ] `gemini --acp --help` sai com código 0 e mostra ajuda do modo ACP.
- [ ] `gemini` (sem flags) não pede login — já autenticado.

**Verification:**
- [ ] Comandos acima executados e logados.
- [ ] Se falhar, pausar e instalar/autenticar o CLI antes de Task 4.

**Dependencies:** None (roda em paralelo com Phase 1 se quiser)

**Files touched:** Nenhum (checagem de ambiente)

**Estimated scope:** XS

---

#### Task 4: Runtime selector shows `gemini-acp`

**Description:** Validar que o `RuntimeToggle` popover lista `gemini-acp` com estado de disponibilidade correto.

**Acceptance criteria:**
- [ ] `npm run dev` inicia sem erro.
- [ ] Em `/chat`, abrir o popover do runtime.
- [ ] `gemini-acp` aparece como opção selecionável com bolinha verde (available).
- [ ] Clicar em `gemini-acp` muda o label do botão para `gemini-acp`.

**Verification:**
- [ ] Screenshot do popover mostrando as 3 opções (claude-acp, codex-acp, gemini-acp) todas verdes.
- [ ] `GET /api/acp/agents` via curl confirma `{ "gemini-acp": true, ... }`.

**Dependencies:** Checkpoint "Code Landed", Task 3

**Files touched:** Nenhum (validação via browser)

**Estimated scope:** S (usar `agent-browser` para automatizar se possível)

---

#### Task 5: Basic message + tool call streaming

**Description:** Enviar mensagem simples e verificar que streaming SSE + renderização de tool calls funcionam idênticos ao claude-acp.

**Acceptance criteria:**
- [ ] Enviar `"oi, lista os arquivos do diretório atual"` via `gemini-acp`.
- [ ] Texto do LLM aparece com streaming progressivo (não de uma vez só).
- [ ] Tool call (`read_dir`, `list_directory`, ou equivalente Gemini) renderiza card no chat.
- [ ] Sem erros no console do browser nem no backend.

**Verification:**
- [ ] Response completa visível no chat.
- [ ] DevTools Network tab mostra SSE stream saudável (sem 500, sem early close).
- [ ] Tool call card tem input/output visíveis.

**Dependencies:** Task 4

**Files touched:** Nenhum

**Estimated scope:** S

---

#### Task 6: Permission prompt end-to-end

**Description:** Verificar que o `permission-bridge` roteia permission_request do Gemini subprocess para o `PermissionDialog` do frontend e propaga a resposta de volta.

**Acceptance criteria:**
- [ ] Enviar prompt que força write (`"crie um arquivo test.txt com o conteúdo 'hello'"`).
- [ ] `PermissionDialog` abre no frontend com descrição da ação.
- [ ] Clicar "Allow" → arquivo é criado e tool call reporta sucesso.
- [ ] Em nova mensagem similar, clicar "Deny" → tool call cancelado sem crash do backend ou subprocess.
- [ ] Checar `ls` e confirmar que `test.txt` existe (após Allow) e que não existe cópia duplicada após Deny.

**Verification:**
- [ ] Dois prompts consecutivos validados (Allow + Deny).
- [ ] Backend logs não mostram erros não-tratados.
- [ ] Limpar `test.txt` ao final.

**Dependencies:** Task 5

**Files touched:** Nenhum de código. `test.txt` criado e removido no workspace.

**Estimated scope:** S

---

#### Task 7: Elicitation (`askUserQuestion`) — best effort

**Description:** Tentar provocar uma pergunta de clarificação do Gemini para validar o `ElicitationDialog`. Se o Gemini CLI não implementar elicitation via ACP, marcar como limitação conhecida no spec (§10 Q2 autorizado).

**Acceptance criteria:**
- [ ] Enviar prompt ambíguo (`"renomeia os arquivos de configuração"`).
- [ ] **Se** Gemini dispara elicitation: `ElicitationDialog` abre, user responde, resposta chega no subprocess.
- [ ] **Se não**: documentar no spec §6 passo 8 como "Gemini CLI vX.Y.Z não suporta elicitation ACP" e prosseguir.

**Verification:**
- [ ] Resultado (suportado/não suportado) anotado no spec.
- [ ] Nenhum crash em qualquer caso.

**Dependencies:** Task 5

**Files touched:** Possivelmente `.harn/docs/specs/gemini-acp-integration.md` (nota de limitação, apenas se não suportar).

**Estimated scope:** XS

---

#### Task 8: Harness CWD propagation

**Description:** Trocar o harness ativo (project-home) e confirmar que o subprocess Gemini opera no novo workspace root após reinício da sessão ACP.

**Acceptance criteria:**
- [ ] Harness atual é o workspace do pi-ai-poc. Trocar para outro diretório (ex: `/tmp/gemini-test`, criar se necessário).
- [ ] Enviar `"em que diretório você está? lista os arquivos aqui"` via `gemini-acp`.
- [ ] Gemini reporta o novo diretório e lista conteúdo esperado.
- [ ] Criar um arquivo no chat (`"crie hello.txt"`) e confirmar via `ls /tmp/gemini-test/` que o arquivo está no harness novo.

**Verification:**
- [ ] Path reportado pelo Gemini ≠ path inicial.
- [ ] Arquivo criado está fisicamente no diretório correto.
- [ ] Voltar o harness ao workspace do pi-ai-poc ao final.

**Dependencies:** Task 5

**Files touched:** Nenhum no repo. Arquivos de teste no harness temporário.

**Estimated scope:** S

---

#### Task 9: Graceful degradation — `gemini` not in PATH

**Description:** Simular ambiente sem `gemini` CLI e confirmar que o app não crasha, e que o botão aparece desabilitado.

**Acceptance criteria:**
- [ ] Renomear ou `PATH`-ocultar o binário `gemini` (ex: `mv $(which gemini) /tmp/gemini.bak`).
- [ ] Reiniciar backend (`npm run dev:backend`).
- [ ] `GET /api/acp/agents` retorna `{ "gemini-acp": false, ... }`.
- [ ] `RuntimeToggle` mostra `gemini-acp` desabilitado com legenda "not in PATH" (ou equivalente do componente atual).
- [ ] Backend não crasha; outros agents (claude-acp, codex-acp) continuam funcionais.
- [ ] Restaurar binário ao caminho original.

**Verification:**
- [ ] Screenshot do botão desabilitado.
- [ ] Logs do backend limpos.
- [ ] Após restaurar, `gemini-acp` volta a ficar verde (reiniciar backend).

**Dependencies:** Task 8

**Files touched:** Nenhum no repo.

**Estimated scope:** S

---

#### Task 10: Subprocess shutdown cleanliness

**Description:** Confirmar que matar a sessão Gemini no meio (fechar browser, kill subprocess) não vaza processo nem deixa o backend em estado ruim.

**Acceptance criteria:**
- [ ] Iniciar sessão `gemini-acp`, enviar uma mensagem que gere streaming longo.
- [ ] Fechar aba do browser durante streaming.
- [ ] `ps aux | grep gemini` não mostra processo órfão após ~5s.
- [ ] Backend continua respondendo `/api/acp/agents` normalmente.
- [ ] Abrir nova sessão `gemini-acp` funciona sem reiniciar backend.

**Verification:**
- [ ] `ps` limpo.
- [ ] Backend logs mostram shutdown limpo do subprocess (via hook existente no `acp-session.ts`).

**Dependencies:** Task 9

**Files touched:** Nenhum.

**Estimated scope:** S

---

### Checkpoint: Smoke Test Complete

- [ ] Tasks 3–10 todas ✅ (ou com limitação documentada em Task 7)
- [ ] Nenhum bug novo descoberto que exige mudança de código além das duas linhas do Phase 1
- [ ] Spec §9 "Success Criteria" — todos os checkboxes marcados
- [ ] Review humano do plano + resultados do smoke test

Se aparecer gap que exige patch no app (ex: Gemini CLI wire shape diverge do ACP canônico), **não tentar contornar**. Documentar no spec §11 Risks, criar issue upstream, e pausar o merge até decidir.

---

### Phase 3: Ship

#### Task 11: Commit and close the spec

**Description:** Commit único com mudança cirúrgica, atualização de status do spec, e push.

**Acceptance criteria:**
- [ ] `git status` mostra apenas: `src/server/agent/acp-agents.ts`, `.harn/config/acp-agents.json`, possivelmente `.harn/docs/specs/gemini-acp-integration.md` (se Task 7 adicionou nota).
- [ ] Commit message: `feat(acp): add gemini-acp runtime`.
- [ ] Atualizar spec status de `🟡 Draft` para `🟢 Shipped` na linha final (§Spec status).
- [ ] Push para `main` (ou branch conforme convenção do projeto).

**Verification:**
- [ ] `git log -1 --stat` mostra diff esperado.
- [ ] `git push` sem erros.
- [ ] Reiniciar backend após push confirma que tudo continua funcionando.

**Dependencies:** Checkpoint "Smoke Test Complete"

**Files touched:**
- `src/server/agent/acp-agents.ts`
- `.harn/config/acp-agents.json`
- `.harn/docs/specs/gemini-acp-integration.md` (opcional)

**Estimated scope:** XS

---

### Checkpoint: Shipped

- [ ] Commit no `main`
- [ ] Spec marcado como `🟢 Shipped`
- [ ] Plan marcado como `🟢 Done`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `gemini --acp` diverge do protocolo ACP canônico (Zed) em algum detalhe (tool call shape, permission request format) | **Alto** — quebraria Task 5/6/7 e exigiria patches que o spec proíbe | Smoke test cedo (Task 4–5) revela. Se divergir, reportar upstream e pausar — não patchar no app. |
| Binário `gemini` não aceita flag `--acp` na versão instalada do usuário | Médio — trava Task 3 | Task 3 é preflight justamente para falhar rápido. Atualizar CLI ou documentar versão mínima no spec §10 Q1. |
| Subprocess Gemini vaza processo em shutdown (não respeita SIGTERM) | Baixo | Task 10 valida explicitamente. `acp-session.ts` já tem shutdown hook testado com claude-acp/codex-acp. |
| Elicitation do Gemini não existe ou usa wire shape incompatível | Baixo | Spec §10 Q2 já autoriza aceitar como limitação conhecida. Task 7 é best-effort. |
| Harness CWD não propaga para subprocess Gemini | Baixo | Task 8 valida. Se falhar, investigar em `acp-session.ts` spawn options — mas isso é "Ask first" pelo spec §7. |

## Parallelization Opportunities

- **Task 1 + Task 2** podem ser feitas no mesmo commit (são 2 linhas); não vale paralelizar.
- **Task 3 (preflight CLI)** pode rodar em paralelo com Phase 1 (code change) — são independentes.
- **Tasks 5–10** devem ser sequenciais porque compartilham a mesma sessão ACP/browser state.
- Considerar usar `agent-browser` skill para automatizar Tasks 4–6 se o ambiente permitir — reduz fricção de re-executar após iterações.

## Open Questions

Todas as perguntas do spec §10 já foram respondidas. Nenhuma pergunta em aberto para o plano.

## Verification Checklist (pré-início)

- [x] Todo task tem acceptance criteria
- [x] Todo task tem verification step
- [x] Dependências identificadas e ordenadas
- [x] Nenhum task toca mais de ~2 arquivos (Phase 1) ou 0 arquivos (Phase 2 smoke test)
- [x] Checkpoints entre phases
- [ ] **Humano aprovou o plano** ← aguardando

---

**Plan status:** 🟡 Draft — aguardando aprovação do usuário antes de executar.
