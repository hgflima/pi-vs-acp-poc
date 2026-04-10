# ADR-001: SPA with Backend Proxy

## Status
Accepted

## Context
O Pi AI Chat Web precisa consumir APIs de LLM (Anthropic, OpenAI) com streaming em tempo real. O browser nao pode chamar essas APIs diretamente por tres razoes:

1. **CORS**: APIs LLM nao permitem chamadas cross-origin do browser
2. **Seguranca**: API keys e OAuth tokens nao devem ficar expostos no frontend
3. **Tool execution**: O agent loop do pi-agent-core executa tools (bash, read/write files) que requerem acesso ao sistema operacional — impossivel no browser

O pi-agent-core fornece `streamProxy`, um componente projetado exatamente para este cenario.

## Decision
Usar o padrao **SPA + Backend Proxy**: React SPA no frontend comunicando com um servidor Node.js que encapsula o agent loop, credenciais e chamadas LLM. O backend expoe endpoints REST + SSE (Server-Sent Events) para streaming.

## Consequences

### Positive
- API keys e tokens ficam no servidor, nunca no browser
- Tool execution (bash, read/write) roda server-side com acesso ao OS
- SSE fornece streaming unidirecional eficiente do server para o client
- `streamProxy` do pi-agent-core e utilizado como projetado
- Separacao clara: frontend = UI, backend = logica de agente

### Negative
- Dois processos para gerenciar em dev (Vite + Node.js backend)
- Latencia adicional de ~1-2ms por hop (negligivel para este caso)
- Mais codigo de infraestrutura (API client, SSE parser, routes)

### Neutral
- Vite proxy resolve o problema de dois processos em dev (proxy de `/api/*` para o backend)

## Alternatives Considered

**Frontend-only (browser calls LLM directly)**
- Rejeitado: API keys expostas, sem tool execution, CORS blocking
- Considerado: Simplicidade maxima para POC

**WebSocket bidirecional**
- Rejeitado: Complexidade desnecessaria — streaming e unidirecional (server → client)
- Considerado: Melhor para cenarios bidirecionais em tempo real

**Vercel AI SDK (RSC streaming)**
- Rejeitado: Requer Next.js (fora da stack obrigatoria pi-ai + pi-agent-core)
- Considerado: Excelente DX para streaming, mas nao valida a stack alvo

## References
- pi-agent-core `streamProxy` documentation
- BRIEF.md: Stack obrigatoria
