# Phase 2: Streaming Chat - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 02-streaming-chat
**Areas discussed:** Chat layout & estilo de mensagens, Indicadores de streaming, Input area & interacao, Markdown & code blocks

---

## Chat layout & estilo de mensagens

### Message style

| Option | Description | Selected |
|--------|-------------|----------|
| Flat com fundo diferenciado | Mensagens full-width, user com bg-muted, assistant sem fundo. Similar ao Claude.ai/ChatGPT. | ✓ |
| Bubbles alinhadas | User a direita, assistant a esquerda, estilo WhatsApp/iMessage. Code blocks ficam apertados. | |
| Flat sem fundo | Mensagens full-width sem diferenciacao de fundo, separadas por linha/espaco. | |

**User's choice:** Flat com fundo diferenciado
**Notes:** None

### Identificacao visual

| Option | Description | Selected |
|--------|-------------|----------|
| Icones com label | Icone do usuario (lucide User) e assistant (lucide Bot/Sparkles) com nome ao lado | ✓ |
| So icones | Icone circular sem texto | |
| So label de texto | "You" e "Assistant" como text label sem icone | |

**User's choice:** Icones com label
**Notes:** None

### Header do chat

| Option | Description | Selected |
|--------|-------------|----------|
| Nome do agente + modelo ativo | Ex: 'Claude Code · claude-sonnet-4-6'. Botao de New Chat. | ✓ |
| Minimalista — so titulo | Apenas 'Pi AI Chat' no header | |
| Header com status de conexao | Titulo + indicador de conexao (Connected/Disconnected) | |

**User's choice:** Nome do agente + modelo ativo
**Notes:** None

---

## Indicadores de streaming

### Indicador "pensando"

| Option | Description | Selected |
|--------|-------------|----------|
| Dots animados | Tres pontos pulsando (•••) na area da mensagem. Desaparece quando primeiro token chega. | ✓ |
| Texto 'Thinking...' com spinner | Texto explicito com spinner ao lado | |
| Skeleton shimmer | Linhas de placeholder com animacao shimmer | |

**User's choice:** Dots animados
**Notes:** None

### Indicador durante stream

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor piscando no final do texto | Block cursor (█) piscando apos ultimo caractere. Desaparece quando stream termina. | ✓ |
| Botao Stop visivel = streaming ativo | Sem indicador visual no texto. Presenca do Stop indica geracao ativa. | |
| Borda pulsante na mensagem | Borda da mensagem pulsa suavemente enquanto streaming | |

**User's choice:** Cursor piscando no final do texto
**Notes:** None

### Stop Generation

| Option | Description | Selected |
|--------|-------------|----------|
| Icone de stop no input area | Botao stop substitui botao send durante streaming. Click aborta via AbortController. | ✓ |
| Botao separado abaixo da mensagem | Botao 'Stop generating' abaixo da mensagem em streaming | |
| Ambos | Icone no input + link na mensagem | |

**User's choice:** Icone de stop no input area
**Notes:** None

---

## Input area & interacao

### Textarea de input

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-grow com maximo | Comeca 1 linha, cresce ate ~6, depois scroll. Botao send a direita. | ✓ |
| Textarea fixa de 3 linhas | Altura fixa, scroll interno sempre | |
| Single-line com expand | Input de 1 linha que vira textarea ao clicar expand | |

**User's choice:** Auto-grow com maximo
**Notes:** None

### Empty state

| Option | Description | Selected |
|--------|-------------|----------|
| Greeting com sugestoes | Centralizado: icone + 'Como posso ajudar?' + 2-3 suggestion chips | ✓ |
| Minimalista — so input | Nada no centro. So area de input inferior. | |
| Greeting simples sem sugestoes | Logo + texto de boas-vindas centralizado, sem suggestion chips | |

**User's choice:** Greeting com sugestoes
**Notes:** None

---

## Markdown & code blocks

### Syntax highlighting theme

| Option | Description | Selected |
|--------|-------------|----------|
| Dark theme | Fundo escuro (github-dark). Code blocks se destacam. | ✓ |
| Seguir tema do app | Se app e light, code blocks light | |
| Voce decide | Claude escolhe | |

**User's choice:** Dark theme
**Notes:** None

### Markdown parcial durante streaming

| Option | Description | Selected |
|--------|-------------|----------|
| Renderizar progressivamente | react-markdown re-renderiza a cada token. Aceita imperfeicoes temporarias. | ✓ |
| Buffer ate completar | Bufferar markdown e renderizar quando bloco completo | |
| Voce decide | Claude escolhe estrategia | |

**User's choice:** Renderizar progressivamente
**Notes:** None

### Copy button em code blocks

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, copy button no hover | Icone copy no canto superior direito, aparece no hover | ✓ |
| Sim, sempre visivel | Botao sempre visivel | |
| Nao por agora | Sem copy button nesta fase | |

**User's choice:** Sim, copy button no hover
**Notes:** None

---

## Claude's Discretion

- Escolha exata do tema Shiki
- Conteudo dos suggestion chips
- Dimensoes exatas (max-width, paddings)
- Animacoes CSS
- Auto-scroll implementation
- Error inline layout

## Deferred Ideas

None — discussion stayed within phase scope
