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

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes