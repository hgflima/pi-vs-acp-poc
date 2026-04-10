# ADR-003: React Local State (useReducer + Context)

## Status
Accepted

## Context
O app precisa gerenciar estado de: autenticacao, agente/modelo ativo, mensagens de chat (incluindo streaming incremental), e configuracao de harness. 

A questao e se precisamos de uma biblioteca de state management (Zustand, Jotai, Redux) ou se React state nativo basta.

## Decision
Usar **useReducer + React Context** como unica solucao de state management. Sem bibliotecas externas.

## Consequences

### Positive
- Zero dependencias adicionais
- Simplicidade maxima — todo dev React conhece useReducer
- Suficiente para o escopo: 1 usuario, 3 telas, sem persistencia
- useReducer lida bem com updates complexos de streaming (append tokens, update tool status)
- Facil de migrar para Zustand/Jotai no MVP se necessario

### Negative
- Re-renders podem afetar performance se o state tree crescer (mensagens longas com muitos tool cards)
- Context nao tem selectors nativos — componentes podem re-renderizar desnecessariamente

### Neutral
- Para MVP futuro, avaliar Zustand (API similar, melhor performance com selectors)

## Alternatives Considered

**Zustand**
- Rejeitado: Dependencia extra sem necessidade clara para POC single-user
- Considerado: API elegante, selectors, devtools

**Jotai**
- Rejeitado: Atomic state adiciona complexidade conceitual sem beneficio para POC
- Considerado: Granularidade fina de re-renders

**Redux Toolkit**
- Rejeitado: Overhead excessivo para POC de 3 telas
- Considerado: Industria padrao, devtools excelentes

## References
- React docs: useReducer
- BRIEF.md: "State management: A definir (provavelmente React state — POC)"
