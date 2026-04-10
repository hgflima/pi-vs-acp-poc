# ADR-004: Server-Sent Events (SSE) for Streaming

## Status
Accepted

## Context
O chat com LLM requer streaming em tempo real — tokens de texto e eventos de tool calls devem chegar ao frontend conforme sao produzidos pelo agent loop. O protocolo de comunicacao server → client precisa ser definido.

## Decision
Usar **Server-Sent Events (SSE)** para streaming do backend para o frontend. O endpoint `POST /api/chat` retorna um stream SSE com eventos tipados (`text_delta`, `tool_start`, `tool_update`, `tool_end`, `done`).

## Consequences

### Positive
- Protocolo nativo do browser (`EventSource` API, ou `fetch` com `ReadableStream`)
- Unidirecional server → client, exatamente o que precisamos
- Reconexao automatica built-in no protocolo
- Formato texto simples — facil de debugar no DevTools
- Hono tem suporte nativo via `streamSSE()`
- Compativel com o modelo de eventos do pi-agent-core (`AgentEvent`)

### Negative
- Limite de ~6 conexoes simultaneas por dominio no HTTP/1.1 (irrelevante para single-user)
- Sem backpressure do client → server (client nao pode pedir para pausar)
- POST + SSE requer `fetch` API (nao `EventSource` nativo, que so suporta GET)

### Neutral
- Usar `fetch` + `ReadableStream` ao inves de `EventSource` para suportar POST

## Alternatives Considered

**WebSocket**
- Rejeitado: Bidirecional e overkill — streaming e unidirecional; mais complexo de implementar
- Considerado: Menor latencia teorica, suporta bidirecional

**Long Polling**
- Rejeitado: Latencia alta, nao suporta streaming incremental
- Considerado: Mais simples de implementar sem streaming real

**gRPC-Web**
- Rejeitado: Overhead de setup (protobuf, proxy) excessivo para POC
- Considerado: Streaming eficiente, types gerados

## References
- MDN: Server-Sent Events
- Hono: streamSSE helper
