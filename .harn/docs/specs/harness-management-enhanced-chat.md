# Spec: Harness Management & Enhanced Chat (ACP)

## Status: Draft — aguardando review

## Objective

Transformar o sistema de harness atual (read-only discovery) em um sistema completo de **gerenciamento de configuracao por projeto** com editor visual, e aprimorar o chat com autocomplete de skills/slash commands/subagents, referencia de arquivos (@), anexo via clipboard, e statusline em tempo real.

**Tudo eh ACP-only** — o Pi runtime nao eh escopo.

### Usuarios

Desenvolvedor local (single-user) que usa o Pi AI Chat como interface unificada para os 3 coding agents (Claude, Codex, Gemini) via ACP.

### Problema

Hoje o harness so le diretorio e lista arquivos no system prompt. Nao ha como criar/editar configs pela UI, nem usar skills/commands no chat, nem ver o status do agent em tempo real. O desenvolvedor precisa alternar entre terminais e editores para configurar cada agent.

### Sucesso

1. O usuario escreve/edita harness configs em UM lugar so (`.agents/` e `AGENTS.md`)
2. O app converte e deposita nos caminhos corretos de cada agent, usando o proprio coding agent para conversao de formato
3. No chat, `/` abre autocomplete de skills e slash commands; `@` abre autocomplete de arquivos e subagents
4. Ctrl/Cmd+V de arquivos/imagens do clipboard insere como attachment na mensagem
5. Footer do chat mostra statusline em tempo real (tool em execucao, arquivo sendo lido, etc.)

---

## Tech Stack

Mesmo do projeto + nova dependencia:

- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4 + shadcn/ui
- **Backend:** Hono on Node.js (port 3001)
- **ACP:** `@agentclientprotocol/sdk` ^0.18.2
- **Streaming:** SSE via `fetch` + `ReadableStream`
- **Editor:** CodeMirror 6 (novo) — auto-deteccao de markdown, json, yaml, toml

## Commands

```
npm run dev              # Frontend (Vite :5173) + Backend (Hono :3001)
npm run build            # Build de producao
```

## Project Structure (areas impactadas)

```
src/
├── client/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── chat-input.tsx          # EDIT: autocomplete, @-mention, clipboard paste
│   │   │   ├── chat-layout.tsx         # EDIT: statusline no footer
│   │   │   ├── autocomplete-menu.tsx   # NEW: dropdown de sugestoes (/ e @)
│   │   │   └── statusline.tsx          # NEW: barra de status do agent
│   │   ├── settings/
│   │   │   ├── settings-page.tsx       # EDIT: expandir com tabs de config
│   │   │   ├── instructions-editor.tsx # NEW: editor de instrucoes (AGENTS.md)
│   │   │   ├── skills-manager.tsx      # NEW: CRUD de skills
│   │   │   ├── commands-manager.tsx    # NEW: CRUD de slash commands
│   │   │   ├── hooks-manager.tsx       # NEW: CRUD de hooks
│   │   │   ├── rules-manager.tsx       # NEW: CRUD de rules
│   │   │   └── subagents-manager.tsx   # NEW: CRUD de subagents
│   │   └── ui/                         # shadcn/ui primitives
│   ├── hooks/
│   │   ├── use-harness.ts              # EDIT: CRUD operations + file watcher
│   │   └── use-autocomplete.ts         # NEW: logica de autocomplete / e @
│   ├── contexts/
│   │   └── harness-context.tsx         # EDIT: expanded state (commands, available commands)
│   └── lib/
│       ├── api.ts                      # EDIT: novos endpoints
│       ├── types.ts                    # EDIT: novos types
│       └── agent-file-map.ts           # NEW: mapeamento agent → paths
└── server/
    ├── agent/
    │   ├── harness.ts                  # EDIT: write capabilities, deeper discovery, file watcher
    │   ├── acp-session.ts              # EDIT: capturar available_commands_update
    │   └── agent-file-map.ts           # NEW: mapeamento agent → paths (server-side)
    └── routes/
        ├── harness.ts                  # EDIT: CRUD endpoints, file listing, SSE watcher
        └── chat.ts                     # EDIT: attachments e fileRefs no body
```

---

## Principio Central: Escrita Unica + Conversao via Agent

O usuario escreve/edita TUDO em formato canonico dentro de `.agents/` (e `AGENTS.md`).

Quando o harness precisa gerar arquivos para um agent especifico cujo formato difere do canonico, o app usa o **proprio coding agent ACP** para fazer a conversao. Isso elimina a necessidade de parsers customizados no app.

Exemplo de fluxo para rules:
1. Usuario escreve rule em Markdown em `.agents/rules/api-design.md`
2. App pede ao agent ACP: "Converta este conteudo Markdown para TOML no formato de policy do Gemini CLI"
3. Agent retorna o TOML convertido
4. App salva em `.gemini/policies/api-design.toml`

---

## Mapeamento Canonico → Agent

| Harness | Canonico | Claude | Codex | Gemini | Observacao |
|---------|----------|--------|-------|--------|------------|
| **Instructions** | `AGENTS.md` (raiz) | `CLAUDE.md` com `@AGENTS.md` | Le `AGENTS.md` nativo | `GEMINI.md` com `@AGENTS.md` | Zero copia. Todos referenciam o mesmo arquivo. |
| **Skills** | `.agents/skills/*/SKILL.md` | symlink `.claude/skills → ../.agents/skills` | Le `.agents/skills` nativo | symlink `.gemini/skills → ../.agents/skills` | Formato identico nos 3. Sem conversao. |
| **Slash Commands** | `.agents/commands/*.md` (YAML+MD) | symlink `.claude/commands → ../.agents/commands` | N/A | `.gemini/commands/*.toml` (convertido pelo agent) | Codex nao suporta custom commands. Gemini precisa TOML — agent converte. |
| **Subagents** | `.agents/agents/*.md` (YAML+MD) | symlink `.claude/agents → ../.agents/agents` | `.codex/agents/*.toml` (convertido pelo agent) | symlink `.gemini/agents → ../.agents/agents` | Claude e Gemini leem MD identico. Codex precisa TOML — agent converte. |
| **Rules** | `.agents/rules/*.md` (Markdown) | symlink `.claude/rules → ../.agents/rules` | `developer_instructions` em `.codex/config.toml` (convertido pelo agent) | `.gemini/policies/*.toml` (convertido pelo agent) | Usuario escreve MD. Agent converte para TOML (Gemini) ou injeta em config.toml (Codex). |
| **Hooks** | `.agents/hooks.json` (JSON) | merge em `.claude/settings.json` → `hooks` (convertido pelo agent) | `.codex/hooks.json` (convertido pelo agent) | merge em `.gemini/settings.json` → `hooks` (convertido pelo agent) | Usuario define em JSON canonico. Agent converte nomes de eventos e merge no arquivo correto. |
| **Settings** | N/A | `.claude/settings.json` | `.codex/config.toml` | `.gemini/settings.json` | Cada agent tem configs proprias. Nao compartilhavel. |
| **Statusline** | N/A | N/A | N/A | N/A | Nao eh arquivo. Derivado dos eventos SSE do chat (tool_start, text_delta, etc.). |

**Mecanismos:**
- **symlink** = app cria link simbolico relativo (ex: `.claude/skills → ../.agents/skills`)
- **le nativo** = agent ja le desse caminho sem acao do app
- **convertido pelo agent** = app envia conteudo canonico ao coding agent ACP para converter formato e deposita o resultado no caminho do agent
- **N/A** = agent nao suporta esse conceito

---

## Decisoes Arquiteturais

### D-1: AGENTS.md como source of truth

O conteudo de instrucoes vive em `AGENTS.md` na raiz do projeto. Os outros arquivos referenciam via import nativo:

- `CLAUDE.md` contem `@AGENTS.md` (import nativo do Claude Code)
- `GEMINI.md` contem `@AGENTS.md` (import nativo do Gemini CLI)
- `AGENTS.md` eh o arquivo que Codex le nativamente

Ao salvar instrucoes na UI, o backend:
1. Escreve `AGENTS.md` com o conteudo completo
2. Escreve `CLAUDE.md` com `@AGENTS.md` (se nao existir)
3. Escreve `GEMINI.md` com `@AGENTS.md` (se nao existir)

### D-2: `.agents/` como diretorio canonico compartilhado

Todo harness compartilhavel fica em `.agents/`:

```
.agents/
├── skills/           # Skills (SKILL.md por subdir)
├── commands/         # Slash commands (*.md com YAML frontmatter)
├── agents/           # Subagents (*.md com YAML frontmatter)
├── rules/            # Rules (*.md Markdown)
└── hooks.json        # Hooks (JSON canonico)
```

Symlinks relativos conectam os dirs dos agents:
- `.claude/skills → ../.agents/skills`
- `.claude/commands → ../.agents/commands`
- `.claude/agents → ../.agents/agents`
- `.claude/rules → ../.agents/rules`
- `.gemini/skills → ../.agents/skills`
- `.gemini/agents → ../.agents/agents`

### D-3: Conversao de formato via coding agent

Quando o formato canonico (MD, JSON) difere do que o agent espera, o app envia o conteudo ao coding agent ACP e pede a conversao. Casos:

| De (canonico) | Para (agent) | Quando |
|---------------|-------------|--------|
| Slash command `.md` (YAML+MD) | `.toml` | Gemini commands |
| Subagent `.md` (YAML+MD) | `.toml` | Codex agents |
| Rule `.md` (Markdown) | `.toml` | Gemini policies |
| Rule `.md` (Markdown) | string em `config.toml` | Codex developer_instructions |
| Hooks `.json` (canonico) | merge em `settings.json` | Claude e Gemini hooks |
| Hooks `.json` (canonico) | `.codex/hooks.json` | Codex hooks (com rename de eventos) |

**Mapeamento de nomes de eventos** (para hooks):
- Canonico `PreToolUse` = Gemini `BeforeTool` = Codex `PreToolUse`
- Canonico `PostToolUse` = Gemini `AfterTool` = Codex `PostToolUse`
- Canonico `SessionStart` = identico nos 3
- Canonico `UserPromptSubmit` = identico nos 3
- Canonico `Stop` = identico nos 3

### D-4: Autocomplete via `available_commands_update` do ACP

O protocolo ACP define `available_commands_update` — o agent envia a lista de commands/skills disponiveis apos criar sessao. Cada item tem: `name`, `description`, `input.hint`.

- **Fonte primaria**: evento ACP (garante que a lista eh o que o agent realmente suporta)
- **Fonte secundaria (fallback)**: discovery do filesystem `.agents/` (antes da sessao ser criada)
- **Estado atual**: `mapSessionUpdate()` em `acp-session.ts` ignora esse evento. Precisamos captura-lo.

### D-5: Invocacao — texto puro via ACP

Todos os agents usam `/command-name args` como texto no `session/prompt`. Nao existe RPC especial.

Fluxo:
1. Usuario digita `/` → autocomplete abre
2. Seleciona `/deploy production`
3. Mensagem enviada como texto: `"/deploy production"`
4. O agent ACP resolve internamente

### D-6: File watcher em tempo real

O backend usa `fs.watch` (recursivo) no diretorio do projeto. Mudancas em `.agents/`, `AGENTS.md`, `.claude/`, `.codex/`, `.gemini/` disparam:
- Re-discovery do harness
- Notificacao ao frontend via SSE (`/api/harness/watch`)

### D-7: CodeMirror 6 com auto-deteccao

Editor de configuracao com:
- Auto-deteccao por extensao: `.md` → Markdown, `.json` → JSON, `.yaml` → YAML, `.toml` → TOML
- Syntax highlighting, bracket matching, line numbers
- Theme escuro consistente com a UI

---

## Feature 1: Config Editor (Settings Page)

### 1.1 Layout

Tabs horizontais:

```
[Instructions] [Skills] [Commands] [Rules] [Hooks] [Subagents] [Harness]
```

Tab **Harness** = pagina atual (directory picker + status). As demais sao novas.

### 1.2 Instructions Editor

- CodeMirror com modo Markdown
- Carrega conteudo de `AGENTS.md` (source of truth)
- Mostra status dos arquivos derivados (`CLAUDE.md` e `GEMINI.md` — se existem e contem `@AGENTS.md`)
- Botao **Save**: escreve `AGENTS.md` + gera `CLAUDE.md` e `GEMINI.md` se nao existirem
- Indicador de unsaved changes

### 1.3 Skills Manager

- Lista de skills em `.agents/skills/` (descoberta do filesystem)
- Cada skill mostra: nome, descricao (do frontmatter YAML), status dos symlinks
- **Criar**: form com nome, descricao, instrucoes, allowed-tools → gera `.agents/skills/<name>/SKILL.md`
- **Editar**: abre SKILL.md no CodeMirror (YAML frontmatter + Markdown)
- **Deletar**: remove diretorio com confirmacao
- **Symlink status**: mostra se `.claude/skills` e `.gemini/skills` apontam para `.agents/skills`; botao para criar symlinks faltantes
- Formato identico nos 3 agents — sem conversao

### 1.4 Slash Commands Manager

- Lista de commands em `.agents/commands/` (descoberta do filesystem)
- Cada command mostra: nome, descricao, preview do prompt, compatibilidade por agent
- **Criar**: form com nome, descricao, prompt template → gera `.agents/commands/<name>.md`
- **Editar**: abre no CodeMirror (YAML frontmatter + Markdown)
- **Deletar**: remove arquivo canonico + derivados (.gemini/commands/*.toml)
- **Ao salvar**: app pede ao coding agent para converter MD → TOML e salva em `.gemini/commands/<name>.toml`
- Badge **"Claude: symlink"**, **"Gemini: convertido"**, **"Codex: N/A"**

### 1.5 Rules Manager

- Lista de rules em `.agents/rules/` (descoberta do filesystem)
- **Criar**: form com nome + conteudo Markdown → gera `.agents/rules/<name>.md`
- **Editar**: abre no CodeMirror (Markdown)
- **Deletar**: remove canonico + derivados
- **Ao salvar**: app pede ao coding agent para:
  - Claude: nada extra (symlink resolve)
  - Gemini: converter MD → TOML e salvar em `.gemini/policies/<name>.toml`
  - Codex: extrair conteudo e inserir/atualizar `developer_instructions` em `.codex/config.toml`
- Status de sync por agent visivel na lista

### 1.6 Hooks Manager

- Lista de hooks do `.agents/hooks.json` (JSON canonico)
- Agrupados por evento (dropdown dos 5 comuns por padrao; toggle para expandir)
- **Criar**: evento + matcher (regex) + command (path) + timeout → adiciona ao JSON canonico
- **Editar/Deletar**: inline na lista
- **Preview**: mostra como o hook fica no formato de cada agent
- **Ao salvar**: app pede ao coding agent para:
  - Claude: merge em `.claude/settings.json` → `hooks`
  - Codex: converter para `.codex/hooks.json` (com rename de eventos se necessario)
  - Gemini: merge em `.gemini/settings.json` → `hooks` (com rename de eventos)

### 1.7 Subagents Manager

- Lista de subagents em `.agents/agents/` (descoberta do filesystem)
- Cada subagent mostra: nome, descricao, model, tools
- **Criar**: form com nome, descricao, tools, model, system prompt → gera `.agents/agents/<name>.md`
- **Editar**: abre no CodeMirror (YAML frontmatter + Markdown)
- **Deletar**: remove canonico + derivados
- **Ao salvar**: app pede ao coding agent para converter MD → TOML e salvar em `.codex/agents/<name>.toml`
- Claude e Gemini: symlinks resolvem (formato identico)

---

## Feature 2: Chat Autocomplete

### 2.1 Fonte de dados

**Primaria**: evento `available_commands_update` do ACP (emitido apos criar sessao):

```typescript
interface AvailableCommand {
  name: string
  description: string
  input?: { hint: string } | null
}
```

**Mudancas necessarias**:
1. `acp-session.ts` → `mapSessionUpdate()`: novo case para `available_commands_update`
2. Novo `RuntimeEvent`: `{ type: "available_commands", commands: AvailableCommand[] }`
3. `use-chat.ts`: capturar evento e armazenar no state
4. `harness-context.tsx`: disponibilizar commands para autocomplete

**Fallback**: discovery do filesystem `.agents/skills/` + `.agents/commands/` (antes da sessao iniciar).

### 2.2 Slash Commands & Skills (`/`)

- Ao digitar `/` como primeiro caractere, abre dropdown
- Items: combinacao de `available_commands_update` + discovery
- Cada item mostra: icone (Skill `[S]` vs Command `[C]` vs Built-in `[B]`), nome, descricao, hint
- Filtro por digitacao (fuzzy match no nome e descricao)
- Enter ou click seleciona → substitui `/partial` por `/nome-completo `
- Envio: mensagem como texto ao agent ACP — agent resolve internamente

### 2.3 File References (`@`)

- Ao digitar `@`, abre dropdown com:
  1. **Subagents**: `@agent-name` — listados primeiro, icone de robot
  2. **Arquivos do projeto**: listagem recursiva do dir do harness (respeitando .gitignore)
- Filtro por digitacao (fuzzy match)
- Enter ou click → insere `@path/to/file.ts` no input
- **No envio**: backend le conteudo dos arquivos referenciados e inclui como contexto no prompt ACP
- Limite: max 100KB por arquivo, max 5 referencias por mensagem

### 2.4 Autocomplete Menu (componente)

```
┌──────────────────────────────────┐
│ Skills & Commands                │
│ ──────────────────────────────── │
│ ▸ /deploy — Deploy app      [S] │ ← selected
│   /test — Run unit tests     [C] │
│   /review — Code review      [S] │
│   /compact — Summarize chat  [B] │
└──────────────────────────────────┘
  [S] = Skill  [C] = Command  [B] = Built-in
```

- Posicionado acima do chat input (popover)
- Navegacao: ↑↓ mover, Enter selecionar, Esc fechar, Tab completar
- Max 10 itens visiveis com scroll
- Fecha ao perder foco ou mover cursor antes do trigger

---

## Feature 3: File Attachment (Clipboard Paste)

### 3.1 Comportamento

- **Ctrl/Cmd+V** no chat input:
  - Texto simples → paste normal
  - Arquivo/imagem → cria attachment
- **Drag & Drop** de arquivo → cria attachment
- **Display**: chip abaixo do textarea com nome + botao X

### 3.2 Tipos suportados

- **Imagens**: PNG, JPG, GIF, WebP → preview thumbnail no chip
- **Texto**: .ts, .js, .py, .md, .json, .toml, etc. → conteudo lido como contexto
- **Limite**: max 1MB por arquivo, max 5 attachments por mensagem

### 3.3 Envio

- Imagens: base64 como content block no prompt ACP
- Texto: conteudo inserido como contexto textual no prompt
- Backend monta prompt ACP com content blocks adequados

---

## Feature 4: Statusline

### 4.1 Posicao

Footer fixo abaixo do chat input:

```
┌─────────────────────────────────────┐
│     MessageList                      │
├─────────────────────────────────────┤
│  [Attachments chips]                 │
│  [ChatInput textarea]               │
├─────────────────────────────────────┤
│ ● Reading src/utils.ts    2.3s  🟢  │  ← Statusline
└─────────────────────────────────────┘
```

### 4.2 Estados

| Estado | Indicador | Texto |
|--------|-----------|-------|
| Idle | dot cinza | "Ready" (ou oculto) |
| Thinking | dot azul pulsante | "Thinking..." |
| Reasoning | dot roxo pulsante | "Reasoning..." |
| Tool execution | dot amarelo | "{tool_name} {param}" + timer |
| Waiting permission | dot laranja | "Waiting for approval..." |
| Error | dot vermelho | "Error: {msg}" |
| Connected | dot verde (direita) | — |
| Disconnected | dot vermelho (direita) | — |

### 4.3 Fonte de dados

Derivado dos eventos SSE existentes (sem novas APIs):
- `text_delta` → "Thinking..."
- `thinking_delta` → "Reasoning..."
- `tool_start { tool, params }` → "{tool} {params.file or params.command}" + timer
- `tool_end` → idle
- `permission_request` → "Waiting for approval..."
- `done` → idle

### 4.4 Animacao

- Fade 150ms entre estados
- Dot pulsante (CSS) durante thinking/reasoning
- Timer incremental (useInterval a cada segundo)

---

## Boundaries

### Always

- Toda escrita passa pelo backend
- Validar caminhos (path traversal prevention)
- Respeitar .gitignore na listagem de arquivos
- Symlinks sempre relativos
- Manter backward compatibility com harness discovery existente

### Ask First

- Sobrescrever arquivo existente (CLAUDE.md, AGENTS.md, GEMINI.md)
- Deletar skill/command/hook/subagent/rule
- Adicionar dependencias npm (CodeMirror)

### Never

- Escrever fora do diretorio do projeto
- Expor API keys nos arquivos gerados
- Modificar `node_modules/` ou `.git/`
- Executar skills/commands no servidor

---

## Code Style

```typescript
// Hooks: desestruturacao, sem default exports
export function useAutocomplete(options: AutocompleteOptions) {
  const [items, setItems] = useState<AutocompleteItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  return { items, selectedIndex, select, dismiss }
}

// Componentes: interface de props explicita
interface StatuslineProps {
  status: AgentStatus
  toolName?: string
  elapsed?: number
}

export function Statusline({ status, toolName, elapsed }: StatuslineProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground border-t">
      {/* ... */}
    </div>
  )
}
```

- Path alias: `@/` → `./src`
- shadcn/ui em `src/client/components/ui/`
- Sem barrel exports
- Tipos compartilhados em `types.ts`

---

## Testing Strategy

- **Tipo**: Manual via browser (POC)
- **Checklist**:
  1. Config Editor: criar/editar/deletar cada tipo, verificar conversao multi-agent
  2. Autocomplete `/`: dropdown com skills E commands, selecionar item
  3. Autocomplete `@`: dropdown com arquivos E subagents, selecionar
  4. Clipboard: Ctrl+V imagem e texto, drag & drop, chips
  5. Statusline: observar durante tool execution, transicoes
  6. Symlinks: verificar links relativos criados corretamente
  7. File watcher: editar externamente, UI atualiza em tempo real
  8. Conversao via agent: salvar rule MD, verificar TOML gerado para Gemini

---

## Success Criteria

### Config Editor
- [ ] **SC-1**: Settings page tem tabs: Instructions, Skills, Commands, Rules, Hooks, Subagents, Harness
- [ ] **SC-2**: Instructions editor carrega AGENTS.md e ao salvar gera CLAUDE.md e GEMINI.md com `@AGENTS.md`
- [ ] **SC-3**: Criar skill gera `.agents/skills/<name>/SKILL.md` + symlinks
- [ ] **SC-4**: Criar slash command gera `.agents/commands/<name>.md` + conversao TOML para Gemini
- [ ] **SC-5**: Criar hook adiciona ao `.agents/hooks.json` + merge convertido nos settings de cada agent
- [ ] **SC-6**: Criar subagent gera `.agents/agents/<name>.md` + conversao TOML para Codex
- [ ] **SC-7**: Criar rule gera `.agents/rules/<name>.md` + conversao TOML para Gemini + inject para Codex
- [ ] **SC-8**: CodeMirror auto-detecta linguagem com syntax highlighting

### Chat Autocomplete
- [ ] **SC-9**: `available_commands_update` do ACP capturado e emitido como SSE event
- [ ] **SC-10**: `/` abre autocomplete com skills E slash commands (diferenciados por icone)
- [ ] **SC-11**: `@` abre autocomplete com arquivos do projeto E subagents
- [ ] **SC-12**: Selecionar `@arquivo` inclui conteudo como contexto na mensagem

### Clipboard & Attachments
- [ ] **SC-13**: Ctrl/Cmd+V de imagem cria attachment com preview
- [ ] **SC-14**: Ctrl/Cmd+V de arquivo texto cria attachment
- [ ] **SC-15**: Drag & Drop de arquivo cria attachment

### Statusline
- [ ] **SC-16**: Footer mostra tool em execucao com nome + parametro + timer
- [ ] **SC-17**: Transicoes entre estados (idle → thinking → tool → idle)
- [ ] **SC-18**: Indicador de conexao (dot verde/vermelho)

### Infrastructure
- [ ] **SC-19**: File watcher atualiza UI em tempo real
- [ ] **SC-20**: Symlinks criados como relativos
- [ ] **SC-21**: Conversao de formato via coding agent funciona para rules, commands, subagents, hooks

---

## API Endpoints

### Harness Discovery (expandido)

```
POST   /api/harness/load                  → discovery expandido (skills, commands, rules, subagents, hooks)
GET    /api/harness/status                → status com contagens por tipo
```

### Harness CRUD

```
GET    /api/harness/items?type=<type>     → lista items (skills|commands|rules|subagents|hooks)
GET    /api/harness/item?type=<type>&name=<name>  → le conteudo
POST   /api/harness/item                  → cria/atualiza item no canonico (.agents/)
         body: { type, name, content }
DELETE /api/harness/item                  → deleta item (canonico + derivados)
         body: { type, name }
POST   /api/harness/sync                  → dispara conversao via agent para todos os agents
         body: { type, name }             → converte e deposita nos dirs de cada agent
POST   /api/harness/symlinks              → cria/verifica symlinks
```

### File Listing (para @-mention)

```
GET    /api/harness/project-files?query=<partial>
       → lista arquivos do projeto (respeitando .gitignore), max 50
```

### File Watcher

```
GET    /api/harness/watch                 → SSE stream de mudancas
       events: { type: "file_changed", path, action: "created"|"modified"|"deleted" }
```

### Chat (alterado)

```
POST   /api/chat
       body: { 
         ...existing,
         attachments?: Array<{ content: string, filename: string, mimeType: string }>,
         fileRefs?: string[]
       }
```

### SSE Events (novo)

```
{ type: "available_commands", commands: Array<{ name, description, hint? }> }
```

---

## Dependencias Novas

```
@codemirror/view
@codemirror/state
@codemirror/lang-markdown
@codemirror/lang-json
@codemirror/lang-yaml
codemirror-lang-toml        # community package
@codemirror/theme-one-dark
```

---

## Decisoes Resolvidas

| # | Pergunta | Decisao |
|---|----------|---------|
| 1 | Editor de texto | CodeMirror 6 com auto-deteccao (md, json, yaml, toml) |
| 2 | Invocacao de skills/commands | `/name args` como texto via ACP; agent resolve |
| 3 | Cross-agent sync de instrucoes | `AGENTS.md` source of truth; CLAUDE.md e GEMINI.md usam `@AGENTS.md` |
| 4 | File watcher | `fs.watch` em tempo real + SSE para frontend |
| 5 | Shared dir | `.agents/` canonico + symlinks relativos |
| 6 | Formatos incompativeis | Conversao via coding agent ACP (nao parsers customizados) |
| 7 | Codex slash commands | N/A — Codex nao suporta custom slash commands |
