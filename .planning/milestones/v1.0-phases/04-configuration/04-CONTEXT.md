# Phase 4: Configuration - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Agent switching (Claude Code / Codex), model switching within a provider, and harness loading -- completing the full POC feature set. User can change agent, model, and load harness files that modify the agent's system prompt. Proves the stack supports runtime configuration.

</domain>

<decisions>
## Implementation Decisions

### Agent/Model Switcher UI
- **D-01:** Nome do agente no header e clicavel, abre popover com secoes de agente e modelo -- estilo minimalista similar ao Cursor
- **D-02:** Icone do agente ativo visivel no header ao lado do nome -- identificacao visual rapida
- **D-03:** Icones por agente dentro do popover para diferenciacao visual
- **D-04:** Lista de modelos vem de `getModels(provider)` da pi-ai -- dinamica, nao hardcoded
- **D-05:** Qualquer troca (agente ou modelo) limpa o chat e comeca nova conversa -- sem preservar historico
- **D-06:** Troca e imediata ao clicar, sem dialog de confirmacao

### Harness Selection UX
- **D-07:** File picker com drag & drop em settings page separada (/settings) -- nao no popover do header
- **D-08:** Usuario aponta para diretorio unico; backend busca CLAUDE.md, AGENTS.md, .claude/skills/, .claude/hooks/ automaticamente
- **D-09:** Badge sutil no header indica harness ativo; click no badge navega para settings page

### Auth Prompt on Switch
- **D-10:** Quando usuario troca para agente cujo provider nao esta autenticado, dialog inline aparece no popover com campo de API key e botao Connect
- **D-11:** Mapeamento fixo agente-provider: Claude Code = Anthropic, Codex = OpenAI -- sem escolha de provider ao trocar agente

### Harness Error Feedback
- **D-12:** Erros de harness loading (arquivo nao encontrado, formato invalido, harness muito grande) aparecem inline na settings page com mensagem descritiva
- **D-13:** Harness carregado in-memory; se arquivo fonte for deletado/movido, continua funcionando ate proximo Load ou restart (sem file watching)

### Claude's Discretion
- Componentes shadcn/ui para o popover (Popover, RadioGroup, ou custom)
- Design exato da settings page (layout, secoes, espacamento)
- Icones especificos por agente (lucide icons ou custom)
- Implementacao do file picker (browser File API, input type=file, ou lib)
- Formato de armazenamento de harness no backend (in-memory object shape)
- Endpoint API para harness loading (POST /api/harness ou similar)
- Endpoint API para listar modelos (GET /api/models?provider=X ou similar)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & State
- `.harn/docs/ARCHITECTURE.md` -- Module structure, API surface, state shape, component dependency graph
- `.harn/docs/ARCHITECTURE.md` S7 -- State Management: AppState.agent and AppState.harness stubs to be expanded

### Agent Recreation
- `.harn/docs/adr/0006-agent-recreation-on-switch.md` -- Recreate Agent instance on switch, context via history (but D-05 means history is cleared, so new Agent starts fresh)

### Authentication
- `.harn/docs/adr/0005-api-key-first-oauth-stretch.md` -- API Key first approach, affects inline auth prompt design

### State Management
- `.harn/docs/adr/0003-react-local-state-management.md` -- useReducer + Context pattern for new agent/harness state

### Existing Types
- `src/client/lib/types.ts` -- AppState.agent stub (current, model, availableModels) and AppState.harness stub (applied) already defined

### Existing Components (to be modified)
- `src/client/components/chat/chat-header.tsx` -- Currently hardcoded "Claude Code" + "claude-sonnet-4-20250514", to be made dynamic with popover
- `src/client/components/chat/chat-layout.tsx` -- Currently hardcodes model/provider in handleSend/handleRetry, to use dynamic state

### Backend Agent Setup
- `src/server/agent/setup.ts` -- createAgent() already accepts provider/modelId/apiKey, ready for dynamic values
- `src/server/lib/credentials.ts` -- Multi-provider credential store, supports both Anthropic and OpenAI keys

### Project Context
- `.harn/docs/BRIEF.md` -- Product brief with original requirements
- `.harn/docs/JOURNEY.md` -- Customer journey through all phases

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/client/lib/types.ts` -- AppState.agent stub com `current: "claude-code" | "codex"`, `model: string | null`, `availableModels` ja definido; AppState.harness com `applied: boolean`
- `src/client/components/ui/button.tsx`, `card.tsx`, `input.tsx` -- shadcn/ui primitives disponiveis
- `src/client/hooks/use-auth.ts` -- Pattern de custom hook com state management; pode servir de template para useAgent/useHarness hooks
- `src/server/lib/credentials.ts` -- `storeCredentials()`, `getCredentials()`, `hasCredentials()` por provider; pronto para auth inline no popover
- `src/client/lib/api.ts` -- fetch helper pattern (API_BASE) para novos endpoints

### Established Patterns
- Hono routes em `src/server/routes/` com export de route group -- seguir para novos endpoints (models, harness)
- Custom hooks em `src/client/hooks/` (useAuth, useChat) -- seguir para useAgent, useHarness
- `useChat.sendMessage()` ja aceita `config: { model, provider }` -- pipeline pronto para valores dinamicos
- ChatLayout como orchestrator: chama hooks, distribui state para subcomponentes
- Vite proxy `/api/*` para backend

### Integration Points
- `src/client/components/chat/chat-header.tsx` -- Substituir hardcoded por popover com state dinamico
- `src/client/components/chat/chat-layout.tsx` -- Usar agent/model state dinamico em handleSend/handleRetry
- `src/server/agent/setup.ts` -- createAgent() ja parametrizado; precisa aceitar systemPrompt dinamico para harness
- `src/client/app.tsx` -- Adicionar rota /settings para harness management
- `src/server/index.ts` -- Registrar novos route groups (models, harness)

</code_context>

<specifics>
## Specific Ideas

- Popover do header deve ser minimalista estilo Cursor -- click no nome do agente abre, nao um botao separado
- Mapeamento agente-provider e fixo (Claude Code = Anthropic, Codex = OpenAI) -- simplifica o flow, POC nao precisa de flexibilidade aqui
- Troca limpa o chat imediatamente sem confirmacao -- prioriza velocidade de iteracao sobre protecao contra perda de contexto
- File picker com drag & drop para harness -- mais visual que input de texto, usuario pode arrastar pasta do Finder
- Harness aponta para diretorio de projeto e backend resolve os arquivos automaticamente -- usuario nao precisa saber quais arquivos existem

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 04-configuration*
*Context gathered: 2026-04-04*
