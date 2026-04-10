<div align="center">

# Pi AI Chat Web

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)](https://hono.dev/)

**POC de chat web para validar a stack pi-ai + pi-agent-core**

</div>

## Screenshot

<!-- Add a screenshot of your app here -->
<!-- ![Screenshot](screenshot.png) -->

## About

Pi AI Chat Web é um proof-of-concept que valida se [`@mariozechner/pi-ai`](https://www.npmjs.com/package/@mariozechner/pi-ai) + [`@mariozechner/pi-agent-core`](https://www.npmjs.com/package/@mariozechner/pi-agent-core) conseguem sustentar uma experiência de chat similar ao Claude.ai/ChatGPT. Uso pessoal do autor para decidir se a stack é viável para um produto futuro.

### Key Features

| Feature | Description |
|---------|-------------|
| **Real-time streaming** | SSE via `fetch` + `ReadableStream` com POST requests |
| **Tool call visualization** | Cards diferenciados por tipo (bash, file, search, agent) |
| **Agent & model switching** | Troca de agentes e modelos em tempo real |
| **Authentication** | Suporte a OAuth e API key |
| **Harness loading** | Sistema de carregamento de harness configuráveis |
| **Markdown rendering** | react-markdown + remark-gfm com syntax highlighting via Shiki |

## Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | React 19, Vite 6, Tailwind CSS 4, shadcn/ui |
| **Backend** | Hono 4 on Node.js (proxy para API keys) |
| **Core** | `@mariozechner/pi-ai` (LLM API) + `@mariozechner/pi-agent-core` (agent runtime) |
| **Streaming** | SSE via `fetch` + `ReadableStream` |
| **Markdown** | react-markdown, remark-gfm, react-shiki |
| **Routing** | React Router 7 (SPA) |
| **Icons** | Lucide React |
| **Language** | TypeScript 5.7 |

## Architecture

```
┌─────────────────────────────────────────────┐
│                Browser (SPA)                 │
│                                              │
│  React 19 + Tailwind CSS 4 + shadcn/ui      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Chat UI  │ │ Auth UI  │ │ Settings UI  │ │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│       │             │              │         │
│       └─────────────┼──────────────┘         │
│                     │                        │
│              fetch + SSE POST                │
└─────────────────────┼───────────────────────-┘
                      │ /api/*
┌─────────────────────┼───────────────────────-┐
│            Hono Backend (port 3001)           │
│                                              │
│  ┌──────┐ ┌──────┐ ┌────────┐ ┌───────────┐ │
│  │ Auth │ │ Chat │ │ Models │ │  Harness   │ │
│  └──┬───┘ └──┬───┘ └───┬────┘ └─────┬─────┘ │
│     │        │         │            │        │
│     └────────┼─────────┼────────────┘        │
│              │                               │
│     ┌────────┴────────────┐                  │
│     │  pi-ai + pi-agent   │                  │
│     │    (Agent Runtime)  │                  │
│     └─────────────────────┘                  │
└──────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── client/                  React SPA
│   ├── components/
│   │   ├── chat/            Mensagens, input, code blocks, markdown
│   │   ├── config/          Seleção de agent/modelo
│   │   ├── connection/      Auth (API key + OAuth)
│   │   ├── settings/        Harness picker, configurações
│   │   ├── tools/           Cards de visualização de tool calls
│   │   └── ui/              Primitivos shadcn/ui
│   ├── contexts/            React contexts
│   ├── hooks/               use-agent, use-auth, use-chat, use-harness
│   └── lib/                 API client, stream parser, types, utils
└── server/                  Hono backend proxy
    ├── agent/               Setup do agent, harness, tools
    ├── lib/                 Credentials, stream adapter
    └── routes/              auth, oauth, chat, models, harness
```

## Getting Started

### Prerequisites

- **Node.js** >= 24.x
- **npm** >= 11.x
- API key de um provider LLM suportado pelo pi-ai (Anthropic, OpenAI, etc.)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd pi-ai-poc

# Install dependencies
npm install
```

### Running

```bash
# Start both frontend and backend (recommended)
npm run dev

# Frontend only (Vite dev server on port 5173)
npm run dev:frontend

# Backend only (tsx watch on port 3001)
npm run dev:backend
```

Vite faz proxy automático de `/api` → `http://localhost:3001`.

### Build

```bash
npm run build
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## Acknowledgements

- [pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) & [pi-agent-core](https://www.npmjs.com/package/@mariozechner/pi-agent-core) by [@mariozechner](https://github.com/badlogic)
- [shadcn/ui](https://ui.shadcn.com/) — component primitives
- [Hono](https://hono.dev/) — lightweight web framework
- [React Shiki](https://www.npmjs.com/package/react-shiki) — syntax highlighting

---

<div align="center">

⭐ Star this repo if you find it useful!

</div>
