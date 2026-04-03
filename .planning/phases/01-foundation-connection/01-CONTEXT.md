# Phase 1: Foundation + Connection - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold both apps (Vite + React frontend, Hono backend), define shared types, validate pi-agent-core via spike, and implement API Key auth flow so the user can connect to a provider and navigate to an empty chat screen. Proves the frontend-backend pipeline works end-to-end.

</domain>

<decisions>
## Implementation Decisions

### Connection Page Design
- **D-01:** Provider selection via segmented control (Anthropic | OpenAI) -- alinhado com `segmented-control.tsx` definido na ARCHITECTURE.md
- **D-02:** API key input como password field com toggle show/hide -- padrao de seguranca, nao expor key durante digitacao
- **D-03:** Feedback de conexao inline no proprio formulario (estados: idle, connecting, connected, error) -- sem modais ou toasts separados
- **D-04:** Apos conexao bem-sucedida, auto-redirect para /chat apos breve feedback visual (1-2s com status "connected")
- **D-05:** Botao de conectar mostra spinner durante validacao, checkmark no sucesso, mensagem de erro inline no falha

### Dev Workflow Setup
- **D-06:** Single `npm run dev` usando `concurrently` para iniciar Vite (frontend :5173) e Hono (backend :3001) simultaneamente
- **D-07:** Vite proxy config: `/api/*` redireciona para `localhost:3001` -- sem CORS issues no dev
- **D-08:** Backend roda com `tsx watch` para hot-reload do servidor durante desenvolvimento

### pi-agent-core Spike (FOUND-04)
- **D-09:** Spike como script standalone em `spike/validate-agent.ts`, executado com `npx tsx spike/validate-agent.ts`
- **D-10:** Spike valida: criacao de Agent, subscription de eventos, stream lifecycle (text_delta, tool events, done), pelo menos 1 tool execution
- **D-11:** Spike usa API key real do ambiente (env var) -- nao e mock, valida conexao end-to-end com provider

### Shared Types (FOUND-03)
- **D-12:** Definir tipos completos de Message (UserMessage, AssistantMessage com segments), SSEEvent, e auth state shape no `src/client/lib/types.ts`
- **D-13:** AssistantMessage usa modelo de segments (`segments[]`) para suportar interleaving de texto e tool calls em fases futuras -- definir a estrutura agora evita refactor em Phase 2/3
- **D-14:** AppState shape com auth slice totalmente tipado; chat/tool/harness slices como stubs iniciais que fases futuras expandem
- **D-15:** ToolCardVariant e ToolStatus definidos como union types desde Phase 1, mesmo que tool cards sejam implementados em Phase 3

### Claude's Discretion
- Escolha de componentes shadcn/ui especificos para a connection page (Button, Input, Card, etc.)
- Estrutura exata de pastas dentro de src/client e src/server (seguir ARCHITECTURE.md como guia, ajustar conforme necessario)
- Organizacao interna do spike script
- Configuracao de tsconfig.json (paths, target, module resolution)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture and Structure
- `.harn/docs/ARCHITECTURE.md` -- Module structure, API surface, state shape, data flows, component dependency graph
- `.harn/docs/ARCHITECTURE.md` S7 -- State Management section: AppState shape, Message types, ToolCardVariant definitions

### Architecture Decisions
- `.harn/docs/adr/0001-spa-with-backend-proxy.md` -- SPA + Backend Proxy pattern decision
- `.harn/docs/adr/0002-hono-backend-framework.md` -- Hono as backend framework
- `.harn/docs/adr/0003-react-local-state-management.md` -- useReducer + Context for state management
- `.harn/docs/adr/0004-sse-for-streaming.md` -- SSE for streaming (affects type definitions in FOUND-03)
- `.harn/docs/adr/0005-api-key-first-oauth-stretch.md` -- API Key first, OAuth as stretch goal
- `.harn/docs/adr/0006-agent-recreation-on-switch.md` -- Agent recreation on switch (affects spike design)

### Project Context
- `.harn/docs/BRIEF.md` -- Product brief with original requirements
- `.harn/docs/JOURNEY.md` -- Customer journey through all phases

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum -- projeto greenfield, sem codigo fonte existente
- shadcn/ui CLI disponivel para gerar componentes primitivos (Button, Input, Card, etc.)

### Established Patterns
- Nenhum padrao estabelecido ainda -- Phase 1 define os padroes que fases subsequentes seguem
- ARCHITECTURE.md define padroes recomendados: hooks custom por dominio (useAuth, useChat), lib/ para utilitarios, routes/ para endpoints

### Integration Points
- Vite proxy config conecta frontend (:5173) ao backend (:3001) via `/api/*`
- Backend importa `@mariozechner/pi-ai` e `@mariozechner/pi-agent-core` -- validar que imports funcionam corretamente no Node.js
- `concurrently` conecta ambos dev servers via single `npm run dev`

</code_context>

<specifics>
## Specific Ideas

- Segment-based message model (AssistantMessage.segments[]) DEVE ser definido em Phase 1 para evitar Pitfall 4 identificado na pesquisa (STATE.md concern)
- Hono streamSSE premature closure requer Promise anchor pattern -- definir no stream-adapter.ts desde o inicio (STATE.md concern)
- Connection page deve ser simples e funcional -- o foco da Phase 1 e provar que o pipeline funciona, nao polish visual

</specifics>

<deferred>
## Deferred Ideas

None -- analise permaneceu dentro do escopo da Phase 1

</deferred>

---

*Phase: 01-foundation-connection*
*Context gathered: 2026-04-03*
