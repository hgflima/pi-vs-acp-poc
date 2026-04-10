# ADR-006: Recreate Agent Instance on Agent/Model Switch

## Status
Accepted

## Context
O usuario pode trocar de agente (Claude Code ↔ Codex) e de modelo em runtime. O `Agent` do pi-agent-core e uma classe stateful — nao esta claro se suporta troca de modelo mid-session.

A questao: manter uma instancia de Agent e reconfigurar, ou destruir e recriar?

## Decision
**Recriar a instancia do Agent** a cada troca de agente ou modelo. O historico de mensagens e mantido no frontend e reenviado como contexto na proxima chamada.

## Consequences

### Positive
- Evita bugs de estado residual entre agentes/modelos diferentes
- Simples de implementar — `new Agent(config)` com novo modelo
- Contexto (historico) e gerenciado explicitamente, sem estado oculto
- Cada agente pode ter tools e system prompt diferentes

### Negative
- Re-enviar historico completo aumenta tokens consumidos
- Se o historico for longo, pode exceder context window

### Neutral
- Para MVP, avaliar se pi-agent-core suporta `setModel()` ou similar para evitar recriacao

## Trade-offs
Corretude e simplicidade priorizadas sobre eficiencia de tokens. Para POC single-session, o historico nao sera longo o suficiente para ser problema.

## References
- BRIEF.md: "Agent switcher — trocar entre Claude Code e Codex em runtime"
- pi-agent-core: Agent class documentation
