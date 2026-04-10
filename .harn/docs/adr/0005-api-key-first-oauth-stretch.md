# ADR-005: API Key First, OAuth as Stretch Goal

## Status
Accepted

## Context
O BRIEF define dois metodos de autenticacao no provider LLM: OAuth e API Key. O prazo do POC e 2 horas. OAuth requer:

- Implementar popup/redirect flow
- Gerenciar callback URL
- Lidar com token refresh
- Testar com credentials reais de cada provider

API Key requer apenas: receber string, validar com test request, armazenar in-memory.

## Decision
**Implementar API Key primeiro** como metodo primario de auth. OAuth e um stretch goal — implementar apenas se sobrar tempo apos as funcionalidades core (chat, streaming, tool cards).

## Consequences

### Positive
- Desbloqueaia o chat rapidamente (5 min vs 30+ min para OAuth)
- Validacao funcional identica — API key acessa os mesmos endpoints que OAuth
- Menor risco de bloqueio por issues de OAuth callback/redirect

### Negative
- OAuth nao sera testado inicialmente — um dos criterios do BRIEF
- Usuario precisa ter API key em maos (menos user-friendly que OAuth)

### Neutral
- A UI de SCR-01 ja suporta ambos os metodos; implementar OAuth depois e adicionar o handler no backend

## Trade-offs
Velocidade de implementacao priorizada sobre cobertura completa de auth. A hipotese central (streaming + tools) pode ser validada com API Key; OAuth e ortogonal.

## References
- BRIEF.md: Criterio "Autenticacao funciona — Conectar via OAuth ou API Key"
- Risk table: "OAuth flow complexo demais para POC de 2h — Prob: Alta"
