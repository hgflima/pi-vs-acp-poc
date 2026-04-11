# Pi AI Chat Web

POC que valida se `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core` sustentam uma experiência de chat similar ao Claude.ai/ChatGPT — streaming em tempo real, tool calls visíveis, troca de agentes e modelos. Uso pessoal, local-only, single-user.

## Tech Stack

- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4 + shadcn/ui
- **Backend:** Hono on Node.js (port 3001) — proxy obrigatório para API keys
- **Core (validation targets):** `@mariozechner/pi-ai` (LLM API) + `@mariozechner/pi-agent-core` (agent runtime)
- **Streaming:** SSE via `fetch` + `ReadableStream` (não EventSource — chat usa POST)
- **Markdown:** react-markdown + remark-gfm + react-shiki (syntax highlighting)

## Project Structure

```
src/
├── client/                — React SPA
│   ├── components/
│   │   ├── chat/          — Mensagens, input, code blocks, markdown
│   │   ├── config/        — Seleção de agent/modelo
│   │   ├── connection/    — Página de auth (API key + OAuth)
│   │   ├── settings/      — Harness picker, configurações
│   │   ├── tools/         — Cards de visualização de tool calls
│   │   └── ui/            — Primitivos shadcn/ui
│   ├── contexts/          — React contexts
│   ├── hooks/             — use-agent, use-auth, use-chat, use-harness
│   └── lib/               — API client, stream parser, types, utils
└── server/                — Hono backend proxy
    ├── agent/             — Setup do agent, harness, tools
    ├── lib/               — Credentials, stream adapter
    └── routes/            — auth, oauth, chat, models, harness
```

## Development

```bash
npm run dev              # Frontend (Vite :5173) + Backend (tsx watch :3001) via concurrently
npm run dev:frontend     # Apenas Vite
npm run dev:backend      # Apenas backend
npm run build            # Build de produção (Vite)
```

Vite faz proxy de `/api` → `http://localhost:3001`.

## Key Conventions

- **Path alias:** `@/` resolve para `./src`
- **API keys nunca no frontend** — toda comunicação LLM passa pelo backend proxy
- **Sem banco de dados** — sem persistência, local-only
- **Agent switching:** nova instância de Agent a cada troca (contexto via history, não estado)
- **shadcn/ui components** ficam em `src/client/components/ui/` — copiados, não importados de lib

## Permissions & Interactive Prompts

- **permission-bridge** (`src/server/agent/permission-bridge.ts`) é registry in-process compartilhado entre ACP e PI runtimes; chaveado por `promptId` com timeout de 5min e cache `allow_always` por `(toolKey, sessionKey)`.
- **4 novos SSE events:** `session_mode_state`, `permission_request`, `elicitation_request`, `prompt_expired`. Cliente responde via `POST /api/chat/respond` (stateless, lookup por id).
- **ModeChip** (`src/client/components/chat/mode-chip.tsx`) renderiza modos advertidos pelo runtime ativo. ACP muda modo via `POST /api/acp/:chatId/mode`; PI via `POST /api/pi/:chatSessionId/mode`.
- **askUserQuestion tool** (`src/server/agent/ask-user-tool.ts`) permite que o PI runtime dispare elicitation inline; reusa o bridge e o mesmo wire shape do ACP.
