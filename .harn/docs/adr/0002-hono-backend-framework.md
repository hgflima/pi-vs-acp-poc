# ADR-002: Hono as Backend Framework

## Status
Accepted

## Context
O backend proxy precisa de um framework HTTP para expor endpoints REST e SSE. Requisitos:

- TypeScript-first (consistencia com o frontend)
- Suporte nativo a streaming/SSE (core do produto)
- Leve e rapido para inicializar (POC de 2h)
- Compativel com Node.js

## Decision
Usar **Hono** como framework do backend.

## Consequences

### Positive
- API leve (~14KB) — nao adiciona overhead significativo
- Suporte nativo a SSE via `streamSSE()` helper
- TypeScript-first com types excelentes
- API similar ao Express (curva de aprendizado baixa)
- Edge-ready — se o POC evoluir para MVP, roda em Cloudflare Workers, Vercel, etc.
- Middleware ecosystem (cors, logger, etc.)

### Negative
- Menos maduro que Express (menor community)
- Menos middleware third-party disponivel
- Pode requerer adapters para integracao com pi-agent-core

### Neutral
- Performance superior ao Express nao e relevante para POC single-user

## Alternatives Considered

**Express**
- Rejeitado: SSE requer setup manual; mais verboso para TypeScript
- Considerado: Mais familiar, maior ecosystem

**Fastify**
- Rejeitado: Overhead de configuracao maior que Hono para POC simples
- Considerado: Performance excelente, bom TypeScript support

**Raw Node.js http**
- Rejeitado: Muito low-level para o prazo de 2h
- Considerado: Zero dependencias

## References
- https://hono.dev
