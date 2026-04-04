# Phase 2: Streaming Chat - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the complete streaming pipeline from pi-agent-core Agent through SSE adapter through frontend parser to rendered messages. User can send a message and see the assistant's response arrive token-by-token in real time, with markdown rendering, stop generation, error handling, and smooth scroll. Validates the core hypothesis that pi-ai + pi-agent-core sustain a streaming chat experience.

</domain>

<decisions>
## Implementation Decisions

### Chat layout & message style
- **D-01:** Flat com fundo diferenciado — mensagens full-width, user com `bg-muted` rounded, assistant sem fundo. Code blocks ocupam largura total. Similar ao Claude.ai/ChatGPT.
- **D-02:** Icones com label para identificacao — icone do usuario (lucide User) e do assistant (lucide Bot ou Sparkles) com nome ao lado ("You" / "Assistant").
- **D-03:** Header exibe nome do agente + modelo ativo (ex: "Claude Code · claude-sonnet-4-6") + botao New Chat. Agent/model switching UI vem na Phase 4, por agora so exibe info estatica.

### Streaming indicators
- **D-04:** Indicador "pensando" antes do primeiro token: tres dots animados pulsando (•••) na area da mensagem do assistant. Desaparece quando o primeiro token chega.
- **D-05:** Durante streaming: cursor piscando (█) apos o ultimo caractere do texto. Desaparece quando stream termina.
- **D-06:** Botao Stop substitui botao Send no input area durante streaming. Click aborta via AbortController. Texto ja recebido e mantido na mensagem.

### Input area & interaction
- **D-07:** Textarea auto-grow: comeca com 1 linha, cresce ate ~6 linhas conforme digita, depois scroll interno. Botao send/stop a direita. Enter envia, Shift+Enter newline (CHAT-10).
- **D-08:** Empty state do chat: greeting centralizado com icone + "Como posso ajudar?" + 2-3 suggestion chips clicaveis (ex: "Explique este codigo", "Escreva um teste").

### Markdown & code blocks
- **D-09:** Dark theme para syntax highlighting — Shiki com tema github-dark ou similar. Code blocks com fundo escuro se destacam do texto.
- **D-10:** Renderizacao progressiva durante streaming — react-markdown re-renderiza a cada token. Code blocks abertos mostram texto raw ate fechar, depois aplica syntax highlighting. Aceita imperfeicoes temporarias.
- **D-11:** Copy button no hover no canto superior direito de code blocks. Aparece no hover, copia conteudo para clipboard.

### Claude's Discretion
- Escolha exata do tema Shiki (github-dark, one-dark-pro, ou similar)
- Conteudo exato dos suggestion chips no empty state
- Dimensoes exatas (max-width do chat, paddings, spacing)
- Animacao dos dots e cursor (CSS keyframes, duracoes)
- Handling de markdown edge cases durante streaming (nested blocks, listas parciais)
- Implementacao do auto-scroll com pause on scroll-up (CHAT-07)
- Layout exato do error inline com retry button (CHAT-09)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Data Flow
- `.harn/docs/ARCHITECTURE.md` — Module structure, API surface, state shape, data flows, component dependency graph
- `.harn/docs/ARCHITECTURE.md` S7 — State Management: AppState shape, Message types, segment-based model

### Streaming & SSE
- `.harn/docs/adr/0004-sse-for-streaming.md` — SSE streaming decision, fetch + ReadableStream (not EventSource)

### State Management
- `.harn/docs/adr/0003-react-local-state-management.md` — useReducer + Context pattern

### Agent Architecture
- `.harn/docs/adr/0006-agent-recreation-on-switch.md` — Agent recreation on switch, context via history

### Project Context
- `.harn/docs/BRIEF.md` — Product brief with original requirements
- `.harn/docs/JOURNEY.md` — Customer journey through all phases

### Existing Types (Phase 1)
- `src/client/lib/types.ts` — Message, SSEEvent, AppState, TextSegment, ToolSegment type definitions already established

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/client/lib/types.ts` — Message types (UserMessage, AssistantMessage with segments[]), SSEEvent union type, AppState com chat slice ja definidos
- `src/client/lib/api.ts` — fetch helper pattern (API_BASE, JSON responses) — extender para streaming endpoint
- `src/client/lib/cn.ts` — cn() utility para Tailwind class merging
- `src/client/components/ui/button.tsx`, `card.tsx`, `input.tsx` — shadcn/ui primitives disponiveis
- `src/server/lib/credentials.ts` — getCredentials() para recuperar API key no backend ao criar Agent
- `src/server/routes/auth.ts` — Pattern de Hono route com pi-ai imports (getModel, streamSimple)

### Established Patterns
- Hono routes em `src/server/routes/` com export de route group
- React Router com routes em `src/client/app.tsx`
- Custom hooks em `src/client/hooks/` (useAuth pattern)
- Vite proxy `/api/*` → localhost:3001

### Integration Points
- `src/client/app.tsx` — ChatPage placeholder precisa ser substituido pelo componente real
- `src/server/index.ts` — Novo route group para chat/streaming precisa ser registrado
- `src/client/hooks/use-auth.ts` — AuthState pode ser necessario no chat para verificar conexao ativa

</code_context>

<specifics>
## Specific Ideas

- Hono streamSSE premature closure requer Promise anchor pattern — implementar desde o inicio no stream adapter (STATE.md concern da Phase 1 research)
- AssistantMessage.segments[] ja definido em Phase 1 — usar este modelo para acumular text deltas em TextSegment e converter para tool segments em Phase 3
- Stop generation deve manter texto ja recebido e marcar `streaming: false` na AssistantMessage
- Suggestion chips no empty state sao decorativos para o POC — conteudo hardcoded e aceitavel

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-streaming-chat*
*Context gathered: 2026-04-03*
