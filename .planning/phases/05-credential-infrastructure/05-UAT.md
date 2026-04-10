---
status: complete
phase: 05-credential-infrastructure
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
started: 2026-04-05T00:00:00Z
updated: 2026-04-05T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Mate qualquer servidor em execução. Rode `npm run dev` do zero. Backend sobe sem erros, logs mostram "server listening" na porta esperada, e abrir o frontend mostra a página de conexão sem 500/CORS/network errors no console.
result: pass

### 2. Provider Toggle on Connection Page
expected: Na página de conexão, alternar o provider entre Anthropic e OpenAI atualiza o placeholder do input de API Key e mantém a UI consistente (sem piscar, sem erros no console).
result: pass

### 3. API Key Connect — Invalid Key Error
expected: Com provider selecionado, colar uma API Key inválida e submeter. UI mostra estado de erro (mensagem visível), não redireciona para o chat, e o provider continua desconectado.
result: pass

### 4. API Key Connect — Valid Key Success + Redirect
expected: Com provider selecionado, colar uma API Key válida e submeter. UI mostra estado "connected", redireciona automaticamente para a página de chat. Sem regressão vs v1.0.
result: pass

### 5. GET /api/auth/status Endpoint
expected: Executar `curl http://localhost:<port>/api/auth/status?provider=anthropic` (ou `provider=openai`). Retorna JSON com `{ hasApiKey, hasOAuth, activeMethod, oauthExpiry? }`. Quando só há API Key conectada, activeMethod é "apiKey" e oauthExpiry está ausente.
result: pass

### 6. Chat Streaming with API Key
expected: Com API Key conectada, enviar uma mensagem no chat. Resposta do modelo chega via streaming (tokens aparecendo em tempo real), sem erro 401/"no API key" e sem quebrar a sessão.
result: pass

### 7. Per-Provider Auth Independence
expected: Conectar API Key só para Anthropic (ou só OpenAI). Verificar via `/api/auth/status` que o outro provider ainda retorna `hasApiKey: false, hasOAuth: false, activeMethod: null`. Estados são independentes.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
