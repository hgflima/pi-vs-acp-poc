# Spec: `CWD` env var como project_home padrao

**Status:** DRAFT — aguardando review humano antes de avancar a Plan.
**Data:** 2026-04-11
**Autor:** Claude (spec-driven-development skill)

---

## Objective

Permitir que o usuario, ao rodar `npm run dev`, aponte o backend para qualquer
diretorio de projeto via **variavel de ambiente `CWD`**, sem editar codigo nem
mudar o diretorio em que o comando e executado.

Hoje, o pi-ai-poc assume `process.cwd()` como raiz para:
- `WORKSPACE_ROOT` (scope dos file tools em `tools.ts`)
- `CONFIG_PATH` de `.harn/config/acp-agents.json` (em `acp-agents.ts`)
- e — pior — ignora completamente isso para os ACP subprocess, que rodam num
  `mkdtemp` temporario, enxergando zero arquivos do projeto real.

A feature torna isso configuravel por chamada:

```bash
# comportamento atual preservado (fallback)
npm run dev
# → CWD = process.cwd() = onde o comando foi rodado

# novo uso
CWD=/Users/henrique/dev/meu-projeto npm run dev
# → servidor, tools E ACP subprocess rodam em /Users/henrique/dev/meu-projeto
```

**Usuario-alvo:** eu mesmo (uso pessoal, local-only). **Sucesso** = abrir o
chat no browser e conseguir pedir ao agente ACP que liste/edite arquivos do
projeto apontado por `CWD`, sem precisar abrir terminal naquele diretorio
primeiro.

---

## Tech Stack

Sem novas dependencias. Apenas Node.js + TypeScript existentes:

- `node:fs` — `statSync` para validacao do path
- `node:path` — `path.isAbsolute` para validar formato
- `process.env` — leitura da env var no boot do backend

---

## Commands

```bash
# Executa com fallback = process.cwd() (inalterado)
npm run dev

# Executa apontando para outro diretorio
CWD=/abs/path/to/project npm run dev

# Frontend sozinho (nao afetado — CWD so aplica ao backend)
npm run dev:frontend

# Backend sozinho, com CWD
CWD=/abs/path/to/project npm run dev:backend

# Build (nao afetado)
npm run build
```

**Nota:** `concurrently` herda env vars do shell pai automaticamente, entao
prefixar `CWD=...` antes de `npm run dev` propaga para `dev:backend` sem
precisar mexer no `package.json`.

---

## Project Structure

Arquivos tocados (escopo cirurgico, sem refator adjacente):

```
src/server/
├── index.ts                  ← NOVO: le e valida process.env.CWD no boot
├── lib/
│   └── project-home.ts       ← NOVO: modulo com resolveProjectHome() +
│                                export de PROJECT_HOME (single source of truth)
└── agent/
    ├── tools.ts              ← MUDA: WORKSPACE_ROOT = PROJECT_HOME
    ├── acp-agents.ts         ← MUDA: CONFIG_PATH usa PROJECT_HOME
    └── acp-session.ts        ← MUDA: spawn({cwd}) + newSession({cwd}) usam
                                PROJECT_HOME; remove mkdtemp/cleanupTempDir
```

Testes: **nao ha suite de testes automatizados no projeto hoje** (verificado).
A validacao sera manual — ver secao Testing Strategy abaixo.

---

## Code Style

Exemplo do modulo `project-home.ts` no estilo do codebase atual:

```typescript
// src/server/lib/project-home.ts
import { statSync } from "node:fs"
import path from "node:path"

function resolveProjectHome(): string {
  const raw = process.env.CWD

  // Fallback: sem env var → comportamento atual
  if (!raw || raw.trim() === "") {
    return process.cwd()
  }

  // Strict: precisa ser absoluto
  if (!path.isAbsolute(raw)) {
    console.error(
      `FATAL: CWD must be an absolute path, got: ${raw}`
    )
    process.exit(1)
  }

  // Strict: precisa existir e ser diretorio
  try {
    const stat = statSync(raw)
    if (!stat.isDirectory()) {
      console.error(`FATAL: CWD is not a directory: ${raw}`)
      process.exit(1)
    }
  } catch {
    console.error(`FATAL: CWD does not exist: ${raw}`)
    process.exit(1)
  }

  return raw
}

export const PROJECT_HOME = resolveProjectHome()
```

**Convencoes seguidas:**
- `const` top-level resolvido uma vez no boot (mesmo padrao de
  `ALLOWED_ORIGINS` em `index.ts`)
- Erros fatais usam `console.error` + `process.exit(1)` com prefixo `FATAL:`
  (mesmo padrao da verificacao de binding loopback em `index.ts:63-68`)
- Sem classes, sem fabricas — funcao modulo simples
- Naming: `PROJECT_HOME` em vez de `CWD` para a constante interna (mais
  expressivo no codigo). A env var externa continua sendo `CWD` porque o
  usuario escolheu esse nome.

---

## Testing Strategy

**Nao ha suite automatizada** no pi-ai-poc — validacao e manual via smoke
test no browser, consistente com os TCs ja documentados em
`.harn/docs/acp-research/03-SMOKE-TEST.md`.

### Smoke tests manuais

| # | Setup | Acao | Esperado |
|---|-------|------|----------|
| PH1 | `npm run dev` sem env var | Abre chat, manda `ls` pro agente ACP | Lista o diretorio onde rodei `npm run dev` (fallback) |
| PH2 | `CWD=/Users/henrique/dev/outro npm run dev` | Abre chat, pede `ls` e `cat package.json` | Mostra arquivos de `/Users/henrique/dev/outro` |
| PH3 | `CWD=./relativo npm run dev` | — | Servidor aborta com `FATAL: CWD must be absolute` |
| PH4 | `CWD=/nao/existe npm run dev` | — | Servidor aborta com `FATAL: CWD does not exist` |
| PH5 | `CWD=/etc/hosts npm run dev` | — | Servidor aborta com `FATAL: CWD is not a directory` |
| PH6 | `CWD=/tmp npm run dev`, file tool em `/etc/passwd` | Pede leitura de `/etc/passwd` via Bash tool | WORKSPACE_ROOT scoping continua impedindo acesso fora de `/tmp` |

### Verificacao no codigo

- `grep -rn "process\.cwd()" src/server/` nao deve retornar matches nos
  arquivos tocados (`tools.ts`, `acp-agents.ts`). Pode sobrar em outros
  lugares nao relacionados a project_home.
- `grep -rn "tempDir\|mkdtemp\|cleanupTempDir" src/server/agent/acp-session.ts`
  deve retornar zero matches apos a mudanca.

---

## Boundaries

### Sempre fazer
- Manter `process.cwd()` como fallback silencioso quando `CWD` nao estiver
  setada (nao quebra quem usa hoje)
- Validar strict no boot: absoluto + existe + diretorio
- Emitir erro fatal com prefixo `FATAL:` e `exit(1)` em caso de validacao
  falhar (mesmo padrao do loopback check)
- Importar `PROJECT_HOME` de `src/server/lib/project-home.ts` — single
  source of truth

### Perguntar antes
- Tocar em `src/server/routes/harness.ts` ou `harness-picker.tsx` — o
  harness route ja tem sua propria nocao de "active directory" separada do
  project_home. Integrar os dois e escopo diferente, fora desta spec.
- Adicionar UI no frontend para exibir/trocar o `PROJECT_HOME` ativo
- Atualizar `CLAUDE.md` do projeto com documentacao da env var
- Adicionar a env var no `vite.config.ts` (frontend) — nao ha motivo
  aparente, mas vale confirmar

### Nunca fazer
- Expandir `~` manualmente — se o shell nao expandiu, erro fatal
- Aceitar path relativo (nada de `path.resolve()` implicito — quero erro
  explicito)
- Manter `mkdtemp`/`tempDir` como fallback "por seguranca" — foi decidido
  remover completamente (resposta da pergunta #2)
- Mexer em arquivos fora dos 4 listados em Project Structure
- Criar script novo no `package.json` (`dev:with-cwd`, etc) — usuario
  prefixa inline e ponto

---

## Success Criteria

A feature esta **concluida** quando:

1. `CWD=/abs/path npm run dev` inicia o backend sem erros, com log confirmando
   o path ativo (ex: `[project-home] active: /abs/path`).
2. Um agente ACP (claude-agent-acp) aberto via chat consegue listar/ler
   arquivos reais de `/abs/path`, nao de um tempdir.
3. Tools de arquivo (Read, Edit, Bash) respeitam o novo `WORKSPACE_ROOT` —
   tentativas de acesso fora ficam bloqueadas.
4. `.harn/config/acp-agents.json` e lido de `<PROJECT_HOME>/.harn/config/`,
   nao de `<cwd-onde-rodei-npm>/.harn/config/`.
5. Rodar `npm run dev` sem `CWD` mantem comportamento 100% identico ao
   estado atual (regressao zero).
6. Todos os 6 smoke tests (PH1–PH6) passam manualmente.
7. TypeScript compila sem novos erros (`tsc --noEmit` — mas ha erros
   pre-existentes registrados em obs 190, entao so os delta contam).

---

## Open Questions

Nenhuma bloqueante. Itens que fiquei na duvida e assumi um default:

1. **Log de confirmacao no boot.** Assumi que vamos logar
   `[project-home] active: <path>` depois da mensagem do Hono. OK?
2. **`CWD` vs `PI_PROJECT_HOME`.** Usuario escolheu `CWD`. So registrando
   que o nome e generico e pode colidir com scripts que tambem usam `CWD`
   — se aparecer bug disso, migrar pra `PI_CWD` ou similar.
3. **`harness.ts` POST /load.** O harness route continua independente.
   Ele pode acabar apontando pra um diretorio != `PROJECT_HOME` via UI.
   Nao vou resolver isso agora; fica como "known inconsistency".
4. **README/CLAUDE.md.** Atualizar a doc do projeto com exemplo de uso
   fica como follow-up — nao e parte desta spec.

---

## Integration points (ja mapeados, pra Plan phase)

Recuperado da memoria (obs 266, 267, 268, 269) — validar antes de Plan:

1. **`src/server/lib/project-home.ts`** (NOVO) — funcao + export do
   `PROJECT_HOME` constante.
2. **`src/server/agent/tools.ts:11`** — `WORKSPACE_ROOT = fs.realpathSync(PROJECT_HOME)`.
3. **`src/server/agent/acp-agents.ts:18`** — `CONFIG_PATH = path.join(PROJECT_HOME, ".harn", "config", "acp-agents.json")`.
4. **`src/server/agent/acp-session.ts`**:
   - Remover `import { mkdtempSync, rmSync }`, `private tempDir`, chamadas
     a `mkdtempSync`, e metodo `cleanupTempDir()`.
   - `spawn({ cwd: PROJECT_HOME, ... })` (linha ~144).
   - `newSession({ cwd: PROJECT_HOME, ... })` (linha ~173).
   - Remover chamada `cleanupTempDir()` no path de erro e no `close()`.
5. **`src/server/index.ts`** — import `PROJECT_HOME` e log de boot.
