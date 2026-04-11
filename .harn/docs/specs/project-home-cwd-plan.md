# Plan: `CWD` env var como project_home padrao

**Spec:** `.harn/docs/specs/project-home-cwd.md`
**Status:** DRAFT — aguardando review humano antes de iniciar implementacao.
**Data:** 2026-04-11
**Autor:** Claude (planning-and-task-breakdown skill)

---

## Overview

Cinco mudancas cirurgicas que transformam `process.env.CWD` em single
source of truth para o project_home do backend. Um modulo novo publica
`PROJECT_HOME`; tres consumidores existentes (`tools.ts`,
`acp-agents.ts`, `acp-session.ts`) passam a importar dele; `index.ts`
loga o path ativo no boot.

O trabalho e pequeno (~40 linhas de delta), mas o arquivo
`acp-session.ts` tem cascata de efeitos (remocao de `tempDir`,
`mkdtempSync`, `cleanupTempDir`) que justifica tratar como task
dedicada.

## Architecture Decisions

- **Horizontal slicing dessa vez.** Spec e pequena e toda ela
  depende de um unico novo modulo (`project-home.ts`). Construir o
  modulo primeiro e depois plugar os consumidores e mais simples que
  tentar slices verticais artificiais.
- **Sem branch nova.** Ja estamos em `feat/acp-stateful`; a feature
  conversa com o mesmo escopo (ACP sessions) e nao precisa de PR
  separado.
- **Sem testes automatizados novos.** Projeto nao tem suite
  (verificado). Verificacao fica 100% manual via smoke tests
  PH1–PH6 da spec.
- **Ordem de commits.** Um commit por task, no padrao do codebase
  (`feat(server):`, `refactor(acp):`, etc). Mantem historia navegavel
  se der pau em alguma task e precisar reverter.

## Task List

### Phase 1: Foundation

#### Task 1: Criar modulo `src/server/lib/project-home.ts`

**Description:** Novo modulo que le `process.env.CWD`, valida strict
(absoluto + existe + diretorio) e exporta `PROJECT_HOME` como `const`
resolvido uma vez no boot. Padrao identico ao `ALLOWED_ORIGINS` em
`index.ts`. Sem fallback silencioso alem do caso "env var ausente"
→ `process.cwd()`.

**Acceptance criteria:**
- [ ] Arquivo `src/server/lib/project-home.ts` existe
- [ ] Export nomeado `PROJECT_HOME: string`
- [ ] Sem `CWD` setada → retorna `process.cwd()`
- [ ] `CWD` relativo → `console.error("FATAL: CWD must be an absolute path...")` + `process.exit(1)`
- [ ] `CWD` inexistente → `console.error("FATAL: CWD does not exist...")` + `process.exit(1)`
- [ ] `CWD` aponta pra arquivo → `console.error("FATAL: CWD is not a directory...")` + `process.exit(1)`
- [ ] Sem `mkdir`, sem `fs.promises`, sem async — tudo sync no boot

**Verification:**
- [ ] `npx tsc --noEmit` nao introduz novos erros (comparar com obs 190 baseline)
- [ ] Import teste: `node -e "require('./src/server/lib/project-home')"` (ou via tsx) carrega sem crash quando `CWD` nao setada
- [ ] Smoke manual: `CWD=/nao/existe npx tsx -e "import('./src/server/lib/project-home.js')"` imprime FATAL e sai com codigo 1

**Dependencies:** Nenhuma

**Files likely touched:**
- `src/server/lib/project-home.ts` (NOVO)

**Estimated scope:** XS (1 arquivo, ~35 linhas)

---

### Checkpoint: Foundation

- [ ] Modulo compila em isolamento
- [ ] Validacoes FATAL funcionam (smoke rapido via tsx)
- [ ] Sem regressao no boot normal (`npm run dev` sem `CWD`)

---

### Phase 2: Wire Consumers

#### Task 2: Apontar `WORKSPACE_ROOT` (tools.ts) para `PROJECT_HOME`

**Description:** Trocar `process.cwd()` por `PROJECT_HOME` importado
em `src/server/agent/tools.ts:11`. Mantem `fs.realpathSync` — queremos
canonicalizar symlinks como antes. Nenhuma mudanca na logica de
containment check abaixo.

**Acceptance criteria:**
- [ ] `tools.ts` importa `PROJECT_HOME` de `../lib/project-home`
- [ ] `WORKSPACE_ROOT = fs.realpathSync(PROJECT_HOME)` (linha 11)
- [ ] `grep -n "process\.cwd()" src/server/agent/tools.ts` retorna zero matches

**Verification:**
- [ ] Smoke PH1: `npm run dev` sem env var → Bash tool do agente lista CWD local
- [ ] Smoke PH6: `CWD=/tmp npm run dev` + tentativa de ler `/etc/passwd` via Read tool → bloqueado com erro de containment
- [ ] `npx tsc --noEmit` sem regressoes

**Dependencies:** Task 1

**Files likely touched:**
- `src/server/agent/tools.ts`

**Estimated scope:** XS (1 linha modificada, 1 import novo)

---

#### Task 3: Apontar `CONFIG_PATH` (acp-agents.ts) para `PROJECT_HOME`

**Description:** Trocar `process.cwd()` por `PROJECT_HOME` importado
em `src/server/agent/acp-agents.ts:18`. Garante que
`.harn/config/acp-agents.json` e lido do project_home, nao de onde o
servidor foi iniciado.

**Acceptance criteria:**
- [ ] `acp-agents.ts` importa `PROJECT_HOME` de `../lib/project-home`
- [ ] `CONFIG_PATH = path.join(PROJECT_HOME, ".harn", "config", "acp-agents.json")`
- [ ] `grep -n "process\.cwd()" src/server/agent/acp-agents.ts` retorna zero matches

**Verification:**
- [ ] Smoke manual: `CWD=/abs/path/com/.harn/config/acp-agents.json npm run dev` → chat carrega agents desse config
- [ ] Boot sem `CWD` continua lendo `.harn/config/acp-agents.json` do cwd atual (regressao zero)
- [ ] `npx tsc --noEmit` sem regressoes

**Dependencies:** Task 1

**Files likely touched:**
- `src/server/agent/acp-agents.ts`

**Estimated scope:** XS (1 linha modificada, 1 import novo)

---

### Checkpoint: File tools + config resolvem via PROJECT_HOME

- [ ] Smoke PH1 passa (fallback)
- [ ] Smoke PH2 parcial passa (config carrega do CWD certo)
- [ ] `grep -rn "process\.cwd()" src/server/agent/` mostra apenas matches em `acp-session.ts` (que sera removido na task 4)

---

### Phase 3: ACP session cwd + cleanup

#### Task 4: Remover `tempDir` e apontar ACP subprocess para `PROJECT_HOME`

**Description:** Refactor mais extenso. `acp-session.ts` hoje cria um
`mkdtemp` temporario e roda o subprocess ACP la — por isso o agente
enxerga zero arquivos do projeto real. Trocar tudo para
`PROJECT_HOME`:

1. Remover `import { mkdtempSync, rmSync } from "node:fs"` (linha 2)
2. Remover `import { tmpdir } from "node:os"` (linha 3) — confirmado
   unico uso via grep
3. Remover campo `private tempDir: string | null = null` (linha 105)
4. Remover `this.tempDir = mkdtempSync(...)` (linha 139)
5. Trocar `cwd: this.tempDir` → `cwd: PROJECT_HOME` em `spawn` (linha 144)
6. Trocar `cwd: this.tempDir` → `cwd: PROJECT_HOME` em `newSession` (linha 173)
7. Remover chamada `this.cleanupTempDir()` no catch do init (linha 148)
8. Remover chamada `this.cleanupTempDir()` em `close()` (linha 272)
9. Remover metodo `private cleanupTempDir(): void { ... }` (linhas 346-354)
10. Adicionar `import { PROJECT_HOME } from "../lib/project-home"`

**Acceptance criteria:**
- [ ] `grep -n "tempDir\|mkdtemp\|cleanupTempDir\|tmpdir" src/server/agent/acp-session.ts` retorna zero matches
- [ ] `grep -n "PROJECT_HOME" src/server/agent/acp-session.ts` mostra 2 usos (spawn + newSession) + 1 import
- [ ] Imports `mkdtempSync, rmSync` e `tmpdir` totalmente removidos (nao deixar _unused)
- [ ] `close()` ainda chama `killCascade()` — unico cleanup path remanescente
- [ ] Nenhuma mudanca em `killCascade()` ou no protocolo de shutdown

**Verification:**
- [ ] Smoke PH2: `CWD=/Users/henrique/dev/algum-projeto npm run dev` + abrir chat + mandar "ls" → lista arquivos reais do projeto, nao de um tempdir
- [ ] TC4 da `03-SMOKE-TEST.md` ainda passa: kill cascade funcionando no DELETE endpoint
- [ ] `npx tsc --noEmit` sem regressoes
- [ ] Observacao manual: apos fechar sessoes, nao ha diretorio `pi-ai-poc-acp-*` criado em `/tmp` (nada pra limpar porque nada foi criado)

**Dependencies:** Task 1

**Files likely touched:**
- `src/server/agent/acp-session.ts`

**Estimated scope:** S (1 arquivo, ~10 edits coordenados)

**Risk note:** Esta e a mudanca de maior blast radius. Se algo der
errado com kill cascade ou spawn lifecycle, revert so desta task
preserva Tasks 1–3.

---

#### Task 5: Log de boot em `index.ts`

**Description:** Adicionar `console.log("[project-home] active: ${PROJECT_HOME}")`
logo apos o log existente `Backend running on http://127.0.0.1:${info.port}`
(linha 69). Confirma visualmente ao usuario qual path ficou ativo.

**Acceptance criteria:**
- [ ] `index.ts` importa `PROJECT_HOME` de `./lib/project-home`
- [ ] Log `[project-home] active: <path>` aparece no boot
- [ ] Log vem DEPOIS do "Backend running on" (ordem de leitura natural)
- [ ] Sem `CWD` → mostra o cwd onde `npm run dev` rodou
- [ ] Com `CWD=/x` → mostra `/x`

**Verification:**
- [ ] `npm run dev` → log aparece
- [ ] `CWD=/tmp npm run dev` → log mostra `/tmp`
- [ ] `npx tsc --noEmit` sem regressoes

**Dependencies:** Task 1

**Files likely touched:**
- `src/server/index.ts`

**Estimated scope:** XS (1 import + 1 console.log)

---

### Checkpoint: Complete

- [ ] Todos os 6 smoke tests (PH1–PH6) passam manualmente
- [ ] `grep -rn "process\.cwd()" src/server/` retorna apenas matches fora dos 4 arquivos tocados
- [ ] `grep -rn "tempDir\|mkdtemp\|cleanupTempDir" src/server/agent/acp-session.ts` retorna zero
- [ ] `npx tsc --noEmit` sem novos erros alem do baseline (obs 190)
- [ ] Kill cascade (TC4) continua funcionando — smoke test abort+delete no UI
- [ ] Commit historico: 5 commits atomicos, um por task
- [ ] Pronto para review

---

## Parallelization

Tasks 2, 3 e 5 sao **independentes** entre si (so dependem de Task 1)
e tocam arquivos disjuntos. Se rodando multiplos agentes, podem
executar em paralelo apos Task 1 ficar pronta. Task 4 e sequencial
porque e a mudanca de maior risco — melhor isolar e verificar
sozinha.

Uso solo: ordem sequencial 1 → 2 → 3 → 4 → 5 e mais simples, total
~20 min se nada sair errado.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `PROJECT_HOME` setada num path sem `.harn/config/` → agents vazio → chat abre vazio | Medio | Smoke PH2 detecta imediatamente; fallback e usuario corrigir o path (por design, nao criamos dir) |
| Remover `tempDir` quebra kill cascade porque cleanup ficou acoplado | Alto | Task 4 tem acceptance criteria explicito preservando `killCascade()`. TC4 smoke verifica. |
| ACP subprocess escreve lixo no PROJECT_HOME (arquivo temporario, cache) | Baixo | Comportamento esperado — e o ponto da feature. Se virar problema, e follow-up, nao regressao. |
| `tsc --noEmit` ja tinha 7 erros (obs 190) e fica dificil detectar delta | Baixo | Comparar contagem bruta antes/depois. Nao buscar zero — buscar "nao piorou". |
| Task 4 quebra tipagem por `cwd: PROJECT_HOME` nao aceitar `string` onde antes era `string \| null` | Baixo | Verificacao no momento do edit. Se der, narrow de tipo ou `!`. |

## Open Questions

Nenhuma bloqueante — spec ja resolveu todas as Open Questions dela.
Os itens abaixo sao "sei que vou fazer, registrando pra nao esquecer":

1. **Commit messages.** Seguir convencao vista em `git log`:
   `feat(server): `, `refactor(acp): `, etc. Ver `git log --oneline
   -20` antes do primeiro commit pra casar com estilo vigente.
2. **Tocar em `vite.config.ts`?** Spec diz "confirmar". Resposta:
   nao precisa — Vite e frontend-only, `CWD` nao vaza pra browser.
   Nao tocar.
3. **CLAUDE.md update.** Spec marcou como follow-up, nao parte desta
   feature. Nao incluir no plano.
