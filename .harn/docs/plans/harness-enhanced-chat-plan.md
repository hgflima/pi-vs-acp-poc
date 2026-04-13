# Implementation Plan: Harness Management & Enhanced Chat

## Overview

Implementar gerenciamento de configuração por projeto (CRUD de skills, commands, rules, hooks, subagents) com editor visual, autocomplete de `/` e `@` no chat, clipboard attachments, e statusline em tempo real. Tudo ACP-only, baseado na spec em `.harn/docs/specs/harness-management-enhanced-chat.md`.

## Architecture Decisions

- **Escrita canônica em `.agents/`**: todo harness compartilhável vive em `.agents/`, com symlinks e conversão via agent para diretórios específicos de cada coding agent
- **CodeMirror 6**: editor de configuração com auto-detecção de linguagem (md, json, yaml, toml)
- **available_commands_update**: fonte primária para autocomplete de `/`; fallback via filesystem discovery
- **Texto puro via ACP**: invocação de skills/commands é `/name args` como texto no prompt
- **File watcher**: `fs.watch` recursivo + SSE para frontend

## Task List

---

### Phase 1: Foundation — Types, Backend CRUD, ACP Event

Estabelece a base: tipos expandidos, endpoints CRUD, e captura do evento ACP.

---

#### Task 1: Expand shared types

**Description:** Adicionar tipos necessários para harness CRUD, autocomplete, attachments, e statusline no arquivo de tipos compartilhado.

**Acceptance criteria:**
- [ ] Novos tipos: `HarnessItemType`, `HarnessItem`, `AvailableCommand`, `AutocompleteItem`, `ChatAttachment`, `AgentStatus`
- [ ] SSEEvent expandido com `available_commands` e `file_changed`
- [ ] HarnessResult expandido com `commands`, `rules`, `subagents`

**Verification:**
- [ ] `npm run build` compila sem erros
- [ ] Nenhum tipo órfão ou duplicado

**Dependencies:** None

**Files likely touched:**
- `src/client/lib/types.ts`

**Estimated scope:** Small (1 file)

---

#### Task 2: Server harness CRUD endpoints

**Description:** Expandir `src/server/routes/harness.ts` e `src/server/agent/harness.ts` com endpoints de leitura/escrita/deleção para items em `.agents/` (skills, commands, rules, subagents, hooks). Inclui discovery expandido.

**Acceptance criteria:**
- [ ] `GET /api/harness/items?type=skills` lista items de `.agents/skills/`
- [ ] `GET /api/harness/item?type=skills&name=foo` retorna conteúdo do item
- [ ] `POST /api/harness/item` cria/atualiza item no diretório canônico
- [ ] `DELETE /api/harness/item` deleta item (canônico + derivados)
- [ ] `discoverHarness()` expandido para detectar commands, rules, subagents, hooks
- [ ] Path traversal prevention (validar que paths não escapam do projeto)

**Verification:**
- [ ] `curl` nos endpoints retorna dados corretos
- [ ] Criar item via POST, verificar arquivo no disco
- [ ] Deletar item via DELETE, verificar remoção
- [ ] Tentativa de path traversal (`../../../etc/passwd`) retorna 400

**Dependencies:** Task 1

**Files likely touched:**
- `src/server/agent/harness.ts`
- `src/server/routes/harness.ts`

**Estimated scope:** Medium (2-3 files)

---

#### Task 3: Capture `available_commands_update` in ACP session

**Description:** Adicionar handling do evento `available_commands_update` em `mapSessionUpdate()` do `acp-session.ts`, emitindo como `RuntimeEvent` que chega ao frontend via SSE.

**Acceptance criteria:**
- [ ] `mapSessionUpdate()` trata `available_commands_update` e retorna `{ type: "available_commands", commands: [...] }`
- [ ] SSEEvent `available_commands` é emitido via stream no chat route
- [ ] `writeRuntimeEventToSSE()` serializa o novo evento corretamente

**Verification:**
- [ ] Iniciar sessão ACP e verificar que o evento chega no SSE stream (pode ser via log ou devtools network)
- [ ] `npm run build` compila sem erros

**Dependencies:** Task 1

**Files likely touched:**
- `src/server/agent/acp-session.ts`
- `src/server/lib/runtime-sse.ts`

**Estimated scope:** Small (2 files)

---

#### Task 4: Project files listing endpoint

**Description:** Criar endpoint `GET /api/harness/project-files?query=<partial>` que lista arquivos do projeto respeitando `.gitignore`, para uso no autocomplete `@`.

**Acceptance criteria:**
- [ ] Endpoint retorna lista de arquivos (path relativo) filtrada por query parcial
- [ ] Respeita `.gitignore` (usa `git ls-files` ou equivalente)
- [ ] Max 50 resultados
- [ ] Não inclui `node_modules/`, `.git/`, binários

**Verification:**
- [ ] `curl /api/harness/project-files?query=src/server` retorna arquivos corretos
- [ ] Arquivos em `.gitignore` não aparecem

**Dependencies:** None

**Files likely touched:**
- `src/server/routes/harness.ts`

**Estimated scope:** Small (1 file)

---

### Checkpoint: Phase 1

- [ ] `npm run build` compila sem erros
- [ ] Endpoints CRUD funcionam via curl
- [ ] `available_commands_update` é capturado (verificar via log)

---

### Phase 2: Statusline (Quick Win)

Feature independente que adiciona visibilidade do estado do agent no footer do chat.

---

#### Task 5: Statusline component

**Description:** Criar componente `statusline.tsx` que mostra o estado atual do agent (idle, thinking, reasoning, tool execution, error, connection status) derivado dos eventos SSE existentes. Timer incremental durante tool execution.

**Acceptance criteria:**
- [ ] Componente renderiza no footer abaixo do chat input
- [ ] Mostra dot colorido + texto para cada estado: idle (cinza), thinking (azul pulsante), reasoning (roxo pulsante), tool execution (amarelo + nome + timer), error (vermelho)
- [ ] Indicador de conexão (dot verde/vermelho no canto direito)
- [ ] Transições com fade 150ms
- [ ] Timer incremental durante tool execution (atualiza a cada segundo)

**Verification:**
- [ ] Enviar mensagem no chat, observar transições: idle → thinking → tool (se houver) → idle
- [ ] Timer conta corretamente durante tool execution
- [ ] Build compila sem erros

**Dependencies:** None

**Files likely touched:**
- `src/client/components/chat/statusline.tsx` (NEW)
- `src/client/components/chat/chat-layout.tsx` (integrar statusline)
- `src/client/hooks/use-chat.ts` (expor estado do agent se necessário)

**Estimated scope:** Small-Medium (3 files)

---

### Checkpoint: Phase 2

- [ ] Statusline visível no chat durante interações com agent
- [ ] Transições visuais corretas entre estados

---

### Phase 3: Config Editor — Scaffold + Instructions

Estabelece a estrutura de tabs na settings page e implementa o primeiro editor (Instructions).

---

#### Task 6: Install CodeMirror 6 + create wrapper component

**Description:** Instalar dependências do CodeMirror 6 e criar componente wrapper reutilizável que auto-detecta linguagem por extensão (.md, .json, .yaml, .toml) com syntax highlighting e theme escuro.

**Acceptance criteria:**
- [ ] Pacotes instalados: `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/lang-json`, `@codemirror/lang-yaml`, `codemirror-lang-toml`, `@codemirror/theme-one-dark`
- [ ] Componente `CodeEditor` aceita props: `value`, `onChange`, `language` (auto ou explícito), `readOnly`
- [ ] Auto-detecção por extensão funciona
- [ ] Theme escuro consistente com a UI

**Verification:**
- [ ] Renderizar editor com conteúdo Markdown e JSON, verificar syntax highlighting
- [ ] Build compila sem erros

**Dependencies:** None

**Files likely touched:**
- `package.json`
- `src/client/components/settings/code-editor.tsx` (NEW)

**Estimated scope:** Small (2 files)

---

#### Task 7: Settings page layout with tabs

**Description:** Refatorar `settings-page.tsx` para usar layout com tabs horizontais: Instructions, Skills, Commands, Rules, Hooks, Subagents, Harness. Tab Harness mantém o conteúdo atual (directory picker + status).

**Acceptance criteria:**
- [ ] 7 tabs visíveis na settings page
- [ ] Tab Harness contém o conteúdo existente (harness picker + file status)
- [ ] Tabs vazias (Instructions, Skills, etc.) mostram placeholder "Coming soon" ou componente stub
- [ ] URL não muda com tab selection (estado local)
- [ ] Layout responsivo (tabs empilham em telas pequenas ou viram scroll horizontal)

**Verification:**
- [ ] Navegar para /settings, ver todas as tabs
- [ ] Tab Harness funciona como antes
- [ ] Build compila sem erros

**Dependencies:** None

**Files likely touched:**
- `src/client/components/settings/settings-page.tsx`

**Estimated scope:** Small (1 file)

---

#### Task 8: Instructions editor (AGENTS.md)

**Description:** Implementar tab Instructions com CodeMirror para editar `AGENTS.md`. Mostra status dos arquivos derivados (`CLAUDE.md`, `GEMINI.md`). Botão Save escreve `AGENTS.md` + gera derivados se não existirem.

**Acceptance criteria:**
- [ ] CodeMirror carrega conteúdo de `AGENTS.md` via API
- [ ] Status badges mostram se `CLAUDE.md` e `GEMINI.md` existem e contêm `@AGENTS.md`
- [ ] Botão Save escreve `AGENTS.md` via backend
- [ ] Backend gera `CLAUDE.md` (com `@AGENTS.md`) e `GEMINI.md` (com `@AGENTS.md`) se não existirem
- [ ] Indicador de unsaved changes (dot ou asterisco no tab)

**Verification:**
- [ ] Abrir tab Instructions, ver conteúdo do AGENTS.md (ou editor vazio se não existe)
- [ ] Editar e salvar, verificar arquivo no disco
- [ ] CLAUDE.md e GEMINI.md gerados se não existiam
- [ ] Build compila sem erros

**Dependencies:** Task 2, Task 6, Task 7

**Files likely touched:**
- `src/client/components/settings/instructions-editor.tsx` (NEW)
- `src/client/components/settings/settings-page.tsx` (integrar tab)
- `src/server/routes/harness.ts` (endpoint específico para instructions)
- `src/client/lib/api.ts` (novas funções API)

**Estimated scope:** Medium (4 files)

---

### Checkpoint: Phase 3

- [ ] Settings page tem tabs funcionais
- [ ] Instructions editor carrega, edita, e salva AGENTS.md
- [ ] CLAUDE.md e GEMINI.md gerados automaticamente
- [ ] Build e app funcionando

---

### Phase 4: Config Editor — Managers

Pattern: cada manager segue o mesmo modelo (list + create + edit + delete). Skills é o template, os demais seguem.

---

#### Task 9: Skills manager

**Description:** Implementar tab Skills: lista skills de `.agents/skills/`, criar/editar/deletar skills. Cada skill é um diretório com `SKILL.md` (YAML frontmatter + Markdown). Mostra status dos symlinks.

**Acceptance criteria:**
- [ ] Lista skills com nome, descrição (do frontmatter), status dos symlinks
- [ ] Criar: form com nome, descrição, instruções, allowed-tools → gera `.agents/skills/<name>/SKILL.md`
- [ ] Editar: abre SKILL.md no CodeMirror
- [ ] Deletar: remove diretório com confirmação (dialog)
- [ ] Status de symlinks: badges mostrando se `.claude/skills` e `.gemini/skills` apontam para `.agents/skills`

**Verification:**
- [ ] Criar skill, verificar arquivo no disco
- [ ] Editar skill, verificar mudanças persistidas
- [ ] Deletar skill, verificar remoção
- [ ] Build compila sem erros

**Dependencies:** Task 2, Task 6, Task 7

**Files likely touched:**
- `src/client/components/settings/skills-manager.tsx` (NEW)
- `src/client/components/settings/settings-page.tsx` (integrar tab)
- `src/client/lib/api.ts` (funções CRUD genéricas)

**Estimated scope:** Medium (3 files)

---

#### Task 10: Slash commands manager

**Description:** Implementar tab Commands: lista commands de `.agents/commands/`, criar/editar/deletar. Formato YAML frontmatter + Markdown. Badge de compatibilidade por agent.

**Acceptance criteria:**
- [ ] Lista commands com nome, descrição, preview, badges de compatibilidade (Claude: symlink, Gemini: convertido, Codex: N/A)
- [ ] Criar: form com nome, descrição, prompt template → gera `.agents/commands/<name>.md`
- [ ] Editar: abre no CodeMirror
- [ ] Deletar: remove canônico + derivados (`.gemini/commands/<name>.toml`)

**Verification:**
- [ ] Criar command, verificar arquivo no disco
- [ ] Editar e deletar funcionam
- [ ] Badges de compatibilidade renderizam corretamente

**Dependencies:** Task 9 (reutiliza pattern)

**Files likely touched:**
- `src/client/components/settings/commands-manager.tsx` (NEW)
- `src/client/components/settings/settings-page.tsx`

**Estimated scope:** Small-Medium (2 files, reutiliza pattern do Task 9)

---

#### Task 11: Rules manager

**Description:** Implementar tab Rules: lista rules de `.agents/rules/`, criar/editar/deletar. Formato Markdown puro. Status de sync por agent.

**Acceptance criteria:**
- [ ] Lista rules com nome + status de sync por agent
- [ ] Criar: form com nome + conteúdo Markdown → gera `.agents/rules/<name>.md`
- [ ] Editar: abre no CodeMirror (Markdown)
- [ ] Deletar: remove canônico + derivados

**Verification:**
- [ ] CRUD completo funciona
- [ ] Status de sync visível na lista

**Dependencies:** Task 9 (reutiliza pattern)

**Files likely touched:**
- `src/client/components/settings/rules-manager.tsx` (NEW)
- `src/client/components/settings/settings-page.tsx`

**Estimated scope:** Small-Medium (2 files)

---

#### Task 12: Hooks manager

**Description:** Implementar tab Hooks: edita `.agents/hooks.json`. Agrupados por evento. Criar/editar/deletar hooks inline. Preview de formato por agent.

**Acceptance criteria:**
- [ ] Lista hooks agrupados por evento (PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, Stop)
- [ ] Criar: evento + matcher + command + timeout → adiciona ao JSON
- [ ] Editar/Deletar: inline na lista
- [ ] Preview mostra como o hook fica no formato de cada agent

**Verification:**
- [ ] Criar hook, verificar `.agents/hooks.json` no disco
- [ ] Preview renderiza formatos diferentes
- [ ] Build compila sem erros

**Dependencies:** Task 2, Task 7

**Files likely touched:**
- `src/client/components/settings/hooks-manager.tsx` (NEW)
- `src/client/components/settings/settings-page.tsx`

**Estimated scope:** Medium (2-3 files, lógica de JSON mais complexa)

---

#### Task 13: Subagents manager

**Description:** Implementar tab Subagents: lista subagents de `.agents/agents/`, criar/editar/deletar. Formato YAML frontmatter + Markdown.

**Acceptance criteria:**
- [ ] Lista subagents com nome, descrição, model, tools
- [ ] Criar: form com nome, descrição, tools, model, system prompt → gera `.agents/agents/<name>.md`
- [ ] Editar: abre no CodeMirror
- [ ] Deletar: remove canônico + derivados

**Verification:**
- [ ] CRUD completo funciona
- [ ] Build compila sem erros

**Dependencies:** Task 9 (reutiliza pattern)

**Files likely touched:**
- `src/client/components/settings/subagents-manager.tsx` (NEW)
- `src/client/components/settings/settings-page.tsx`

**Estimated scope:** Small-Medium (2 files)

---

### Checkpoint: Phase 4

- [ ] Todas as 6 tabs do config editor funcionam (Instructions, Skills, Commands, Rules, Hooks, Subagents)
- [ ] CRUD completo para cada tipo de harness item
- [ ] Arquivos criados corretamente em `.agents/`
- [ ] Build e app funcionando

---

### Phase 5: Chat Autocomplete

Adiciona `/` e `@` autocomplete no chat input.

---

#### Task 14: Autocomplete hook + menu component

**Description:** Criar `use-autocomplete.ts` hook com lógica de trigger (`/` e `@`), filtragem fuzzy, e navegação por teclado. Criar `autocomplete-menu.tsx` como popover acima do chat input.

**Acceptance criteria:**
- [ ] Hook detecta `/` como primeiro caractere → abre modo slash
- [ ] Hook detecta `@` em qualquer posição → abre modo mention
- [ ] Filtragem fuzzy por digitação (match no nome e descrição)
- [ ] Menu renderiza com ícones diferenciados: `[S]` Skill, `[C]` Command, `[B]` Built-in
- [ ] Navegação: ↑↓ mover, Enter selecionar, Esc fechar, Tab completar
- [ ] Max 10 itens visíveis com scroll
- [ ] Fecha ao perder foco ou cursor antes do trigger

**Verification:**
- [ ] Digitar `/` abre menu com itens de teste
- [ ] Navegar com teclado funciona
- [ ] Build compila sem erros

**Dependencies:** Task 1

**Files likely touched:**
- `src/client/hooks/use-autocomplete.ts` (NEW)
- `src/client/components/chat/autocomplete-menu.tsx` (NEW)

**Estimated scope:** Medium (2 files, lógica complexa de cursor/teclado)

---

#### Task 15: `/` slash command autocomplete integration

**Description:** Integrar autocomplete de `/` no chat input. Fonte primária: `available_commands_update` do ACP. Fallback: discovery de `.agents/skills/` + `.agents/commands/`. Ao selecionar, substitui texto e envia como mensagem de texto.

**Acceptance criteria:**
- [ ] `use-chat.ts` captura evento `available_commands` e armazena no state
- [ ] `harness-context.tsx` disponibiliza commands para autocomplete
- [ ] `/` no chat input abre dropdown com skills + commands
- [ ] Selecionar item substitui `/partial` por `/nome-completo `
- [ ] Envio: mensagem de texto normal (agent resolve internamente)

**Verification:**
- [ ] Iniciar sessão ACP, digitar `/`, ver commands do agent
- [ ] Sem sessão ativa, ver commands do filesystem (fallback)
- [ ] Selecionar e enviar funciona

**Dependencies:** Task 3, Task 14

**Files likely touched:**
- `src/client/components/chat/chat-input.tsx` (integrar autocomplete)
- `src/client/hooks/use-chat.ts` (capturar available_commands)
- `src/client/contexts/harness-context.tsx` (expor commands)

**Estimated scope:** Medium (3 files)

---

#### Task 16: `@` file/subagent autocomplete + backend resolution

**Description:** Integrar autocomplete de `@` no chat input. Lista subagents primeiro, depois arquivos do projeto. No envio, backend lê conteúdo dos arquivos referenciados e inclui como contexto.

**Acceptance criteria:**
- [ ] `@` abre dropdown com subagents (ícone robô) listados primeiro, depois arquivos
- [ ] Filtro fuzzy por digitação
- [ ] Selecionar insere `@path/to/file.ts` no input
- [ ] Backend resolve `@` refs: lê conteúdo dos arquivos e inclui no prompt ACP
- [ ] Limites: max 100KB por arquivo, max 5 referências por mensagem

**Verification:**
- [ ] Digitar `@` mostra subagents + arquivos
- [ ] Enviar mensagem com `@src/server/agent/harness.ts`, verificar que conteúdo foi incluído no prompt
- [ ] Build compila sem erros

**Dependencies:** Task 4, Task 14

**Files likely touched:**
- `src/client/components/chat/chat-input.tsx`
- `src/server/routes/chat.ts` (resolver file refs)
- `src/client/lib/api.ts` (fetch project files)

**Estimated scope:** Medium (3 files)

---

### Checkpoint: Phase 5

- [ ] `/` autocomplete funciona com commands do ACP e fallback
- [ ] `@` autocomplete lista subagents e arquivos
- [ ] File refs resolvidos como contexto no prompt
- [ ] Build e app funcionando

---

### Phase 6: File Attachments

Adiciona clipboard paste e drag & drop no chat.

---

#### Task 17: Clipboard paste + drag & drop + attachment chips

**Description:** Adicionar handler de Ctrl/Cmd+V no chat input para imagens e arquivos. Adicionar drag & drop. Renderizar chips de attachment abaixo do textarea com preview e botão X.

**Acceptance criteria:**
- [ ] Ctrl/Cmd+V de texto simples → paste normal (sem mudança)
- [ ] Ctrl/Cmd+V de imagem → cria attachment com thumbnail preview
- [ ] Ctrl/Cmd+V de arquivo texto → cria attachment
- [ ] Drag & drop de arquivo → cria attachment
- [ ] Chips renderizam abaixo do textarea com nome + tipo + botão X para remover
- [ ] Limites: max 1MB por arquivo, max 5 attachments por mensagem

**Verification:**
- [ ] Copiar imagem do clipboard, colar no chat → chip aparece com preview
- [ ] Arrastar arquivo → chip aparece
- [ ] Remover attachment via X funciona
- [ ] Build compila sem erros

**Dependencies:** None

**Files likely touched:**
- `src/client/components/chat/chat-input.tsx` (handlers de paste/drop)
- `src/client/components/chat/attachment-chip.tsx` (NEW)

**Estimated scope:** Medium (2 files)

---

#### Task 18: Backend attachment handling in chat route

**Description:** Expandir POST `/api/chat` para aceitar attachments (base64 images, text content) e file refs. Montar prompt ACP com content blocks adequados.

**Acceptance criteria:**
- [ ] Body aceita `attachments?: Array<{ content, filename, mimeType }>` e `fileRefs?: string[]`
- [ ] Imagens enviadas como content block base64 no prompt ACP
- [ ] Texto de arquivo inserido como contexto textual no prompt
- [ ] File refs resolvidos: conteúdo lido do disco e incluído

**Verification:**
- [ ] Enviar mensagem com imagem attachment via Postman/curl
- [ ] Enviar mensagem com file ref, verificar que conteúdo chegou ao agent
- [ ] Build compila sem erros

**Dependencies:** Task 17

**Files likely touched:**
- `src/server/routes/chat.ts`
- `src/client/hooks/use-chat.ts` (enviar attachments no body)
- `src/client/lib/api.ts`

**Estimated scope:** Medium (3 files)

---

### Checkpoint: Phase 6

- [ ] Clipboard paste de imagem e texto funciona
- [ ] Drag & drop funciona
- [ ] Attachments enviados corretamente ao agent
- [ ] File refs resolvidos como contexto

---

### Phase 7: Infrastructure — Real-time Sync

Conecta tudo com file watcher, symlinks, e conversão de formato.

---

#### Task 19: File watcher + SSE stream

**Description:** Implementar `fs.watch` recursivo no backend para monitorar `.agents/`, `AGENTS.md`, `.claude/`, `.codex/`, `.gemini/`. Emitir mudanças via SSE em `GET /api/harness/watch`. Frontend re-carrega harness ao receber evento.

**Acceptance criteria:**
- [ ] Endpoint SSE `GET /api/harness/watch` emite eventos `file_changed`
- [ ] Eventos incluem: `path`, `action` (created/modified/deleted)
- [ ] Frontend se conecta ao SSE e re-carrega dados relevantes
- [ ] Debounce de 300ms para evitar spam de eventos

**Verification:**
- [ ] Editar arquivo externamente em `.agents/`, verificar que UI atualiza
- [ ] Criar/deletar arquivo, verificar evento emitido

**Dependencies:** Task 2

**Files likely touched:**
- `src/server/routes/harness.ts` (SSE endpoint + watcher setup)
- `src/client/contexts/harness-context.tsx` (consumir SSE)

**Estimated scope:** Medium (2 files)

---

#### Task 20: Symlink management

**Description:** Criar endpoint `POST /api/harness/symlinks` que cria e verifica symlinks relativos entre `.agents/` e os diretórios de cada agent. Inclui status de symlinks nos managers.

**Acceptance criteria:**
- [ ] Endpoint cria symlinks relativos:
  - `.claude/skills → ../.agents/skills`
  - `.claude/commands → ../.agents/commands`
  - `.claude/agents → ../.agents/agents`
  - `.claude/rules → ../.agents/rules`
  - `.gemini/skills → ../.agents/skills`
  - `.gemini/agents → ../.agents/agents`
- [ ] Endpoint verifica status: symlink existe? aponta para o destino correto?
- [ ] Resposta inclui status por agent por tipo
- [ ] Symlinks sempre relativos (portável)

**Verification:**
- [ ] Chamar endpoint, verificar symlinks no disco
- [ ] `ls -la .claude/skills` aponta para `../.agents/skills`
- [ ] Re-chamar endpoint com symlinks existentes → idempotente

**Dependencies:** Task 2

**Files likely touched:**
- `src/server/routes/harness.ts`
- `src/server/agent/harness.ts` (lógica de symlink)

**Estimated scope:** Medium (2 files)

---

#### Task 21: Agent format conversion via ACP

**Description:** Implementar endpoint `POST /api/harness/sync` que usa o coding agent ACP para converter formato canônico (MD, JSON) para o formato específico de cada agent. Casos: commands MD→TOML (Gemini), subagents MD→TOML (Codex), rules MD→TOML (Gemini) + inject em config.toml (Codex), hooks JSON→merge em settings.json.

**Acceptance criteria:**
- [ ] Endpoint aceita `{ type, name }` e dispara conversão
- [ ] Para cada caso de conversão (ver spec D-3), envia conteúdo canônico ao agent ACP com prompt de conversão
- [ ] Resultado salvo no caminho correto do agent alvo
- [ ] Evento de hooks mapeia nomes de eventos entre agents (PreToolUse ↔ BeforeTool, etc.)
- [ ] Fallback gracioso se agent ACP não estiver disponível (log warning, skip)

**Verification:**
- [ ] Salvar rule MD, verificar `.gemini/policies/<name>.toml` gerado
- [ ] Salvar command MD, verificar `.gemini/commands/<name>.toml` gerado
- [ ] Salvar hook, verificar merge em `.claude/settings.json`

**Dependencies:** Task 2, Task 3

**Files likely touched:**
- `src/server/routes/harness.ts`
- `src/server/agent/harness.ts` (lógica de conversão)
- `src/server/agent/agent-file-map.ts` (NEW — mapeamento agent → paths)

**Estimated scope:** Large (3 files, lógica complexa de conversão multi-agent)

---

### Checkpoint: Phase 7 — Final

- [ ] **SC-1 a SC-21**: Todos os success criteria da spec estão atendidos
- [ ] File watcher atualiza UI em tempo real
- [ ] Symlinks criados como relativos
- [ ] Conversão via coding agent funciona
- [ ] Build compila sem erros
- [ ] App funciona end-to-end

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| CodeMirror bundle size grande | Med | Tree-shake; lazy import via React.lazy() |
| `fs.watch` inconsistente cross-platform | Med | Debounce + fallback para polling se necessário; Darwin é nosso target primário |
| Agent ACP pode não responder na conversão de formato | High | Timeout de 30s + fallback gracioso (skip conversão, log warning) |
| `available_commands_update` pode não ser emitido por todos os agents | Med | Fallback para filesystem discovery; UI mostra fonte dos dados |
| YAML frontmatter parsing pode ser frágil | Low | Usar regex simples para split, não parser YAML completo; CodeMirror mostra raw content |
| Cursor/teclado handling complexo no autocomplete | Med | Usar Radix/Popover existente; testar edge cases (cursor no meio, multi-linha) |

## Open Questions

- Nenhuma — todas as decisões foram resolvidas na spec (ver seção "Decisões Resolvidas")

## Parallelization Notes

**Seguro paralelizar:**
- Tasks 1, 4, 5, 6, 7 (sem dependências entre si)
- Tasks 10, 11, 12, 13 (todos seguem pattern do Task 9, independentes)
- Task 17 (attachments) vs Tasks 14-16 (autocomplete)

**Sequencial obrigatório:**
- Task 1 → Tasks 2, 3 (tipos precisam existir antes)
- Task 2 → Task 8 (backend CRUD antes do editor)
- Task 9 → Tasks 10-13 (pattern estabelecido primeiro)
- Task 14 → Tasks 15, 16 (hook/menu antes da integração)
- Task 17 → Task 18 (UI antes do backend)

## Success Criteria Mapping

| SC | Task(s) |
|----|---------|
| SC-1: Settings tabs | Task 7 |
| SC-2: Instructions editor | Task 8 |
| SC-3: Criar skill | Task 9 |
| SC-4: Criar slash command | Task 10 |
| SC-5: Criar hook | Task 12 |
| SC-6: Criar subagent | Task 13 |
| SC-7: Criar rule | Task 11 |
| SC-8: CodeMirror auto-detect | Task 6 |
| SC-9: available_commands_update | Task 3 |
| SC-10: `/` autocomplete | Task 15 |
| SC-11: `@` autocomplete | Task 16 |
| SC-12: `@arquivo` como contexto | Task 16, 18 |
| SC-13: Ctrl+V imagem | Task 17 |
| SC-14: Ctrl+V arquivo texto | Task 17 |
| SC-15: Drag & drop | Task 17 |
| SC-16: Tool em execução no footer | Task 5 |
| SC-17: Transições de estado | Task 5 |
| SC-18: Indicador de conexão | Task 5 |
| SC-19: File watcher | Task 19 |
| SC-20: Symlinks relativos | Task 20 |
| SC-21: Conversão via agent | Task 21 |
