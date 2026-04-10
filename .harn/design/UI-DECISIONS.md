# UI Decisions

## DEC-001: Style Preset
**Date:** 2026-04-03
**Decision:** Claude.ai Faithful
**Rationale:** Inspiração direta do Claude.ai conforme definido no BRIEF.md. Interface clean, minimalista, fundo claro com tipografia elegante.

## DEC-002: Primary Color
**Date:** 2026-04-03
**Decision:** Terra cotta (#C96442)
**Rationale:** Cor de assinatura do Claude.ai. Transmite calor e sofisticação sem ser agressiva. Escala de 50-950 gerada para uso em variantes.

## DEC-003: Font Family
**Date:** 2026-04-03
**Decision:** Inter (sans) + JetBrains Mono (mono)
**Rationale:** Inter é a fonte mais próxima do Claude.ai — moderna, limpa, excelente legibilidade em UI. JetBrains Mono para blocos de código e tool cards de terminal.

## DEC-004: Spacing Density
**Date:** 2026-04-03
**Decision:** Generous (espaçamento generoso)
**Rationale:** Segue o padrão Claude.ai com breathing room entre mensagens. Chat UIs se beneficiam de mais espaço entre elementos para legibilidade.

## DEC-005: Corner Radius
**Date:** 2026-04-03
**Decision:** Rounded (8-12px padrão)
**Rationale:** Alinhado com Claude.ai — cantos suavemente arredondados que dão sensação amigável sem ser infantil.

## DEC-006: Shadow Style
**Date:** 2026-04-03
**Decision:** Subtle (sombras leves)
**Rationale:** Claude.ai usa elevação mínima. Bordas sutis predominam sobre sombras. Sombras apenas em overlays e dropdowns.

## DEC-007: Component Library
**Date:** 2026-04-03
**Decision:** shadcn/ui
**Rationale:** Componentes headless com Tailwind — bom equilíbrio entre velocidade de desenvolvimento e qualidade visual para POC.

## DEC-008: Tool Card Colors
**Date:** 2026-04-03
**Decision:** Cores semânticas por tipo de tool
**Rationale:** bash → slate escuro (terminal), read/write → green sutil (arquivo), glob/grep → blue sutil (busca), subagent/skill → primary sutil (agente), genérico → neutral.
