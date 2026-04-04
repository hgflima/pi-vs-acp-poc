# Phase 4: Configuration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 04-configuration
**Areas discussed:** Agent/Model switcher UI, Harness selection UX, Auth prompt on switch, Harness error feedback

---

## Agent/Model Switcher UI

### Switcher appearance

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown combo | Um dropdown unico "Claude Code . sonnet-4" com secoes agente + modelo | |
| Dois controles separados | Segmented control para agente + dropdown separado para modelo | |
| Nome clicavel + popover | Nome do agente no header clicavel, abre popover minimalista | ✓ |

**User's choice:** Nome clicavel + popover (estilo Cursor)

### Chat behavior on switch

| Option | Description | Selected |
|--------|-------------|----------|
| Mantem conversa | Troca silenciosa, proxima mensagem usa novo agente/modelo | |
| Confirma e mantem | Dialog de confirmacao antes de trocar | |
| Nova conversa | Trocar limpa o chat e comeca do zero | ✓ |

**User's choice:** Nova conversa

### Model swap behavior

| Option | Description | Selected |
|--------|-------------|----------|
| So agente limpa | Trocar modelo mantem conversa, trocar agente limpa | |
| Ambos limpam | Qualquer troca limpa o chat | ✓ |
| Voce decide | Claude escolhe | |

**User's choice:** Ambos limpam

### Model list source

| Option | Description | Selected |
|--------|-------------|----------|
| getModels() da pi-ai | Buscar modelos dinamicamente via API | ✓ |
| Lista hardcoded | Lista fixa de modelos conhecidos | |
| Voce decide | Claude escolhe | |

**User's choice:** getModels() da pi-ai (Recommended)

### Popover content

| Option | Description | Selected |
|--------|-------------|----------|
| Simples -- so nome | Lista so com nomes | |
| Com provider badge | Agente mostra provider associado | |
| Voce decide | Claude decide | |

**User's choice:** (Other) Agente e o Icone dos agentes
**Notes:** Usuario quer icones por agente no popover

### Confirmation on switch

| Option | Description | Selected |
|--------|-------------|----------|
| Imediato | Click troca na hora, sem fricção | ✓ |
| Confirmacao se chat ativo | Pede confirmacao se ha mensagens no chat | |
| Sempre confirma | Sempre mostra dialog | |

**User's choice:** Imediato

### Header icon

| Option | Description | Selected |
|--------|-------------|----------|
| So no popover | Icone so dentro do popover | |
| Icone + nome no header | Icone do agente visivel no header | ✓ |
| Voce decide | Claude decide | |

**User's choice:** Icone + nome no header

---

## Harness Selection UX

### Selection method

| Option | Description | Selected |
|--------|-------------|----------|
| Input de path | Campo de texto para digitar caminho | |
| File picker (drag & drop) | Drag & drop de arquivos/pastas | ✓ |
| Lista de presets | Harness pre-configurados | |
| Voce decide | Claude escolhe | |

**User's choice:** File picker (drag & drop)

### Placement

| Option | Description | Selected |
|--------|-------------|----------|
| No popover do header | Secao extra no popover de agente/modelo | |
| Settings page separada | Nova pagina /settings | ✓ |
| Botao dedicado no header | Botao separado que abre dialog proprio | |

**User's choice:** Settings page separada

### Harness scope

| Option | Description | Selected |
|--------|-------------|----------|
| Diretorio unico | Aponta para diretorio, backend busca arquivos | ✓ |
| Arquivos individuais | Seleciona cada arquivo separadamente | |
| Voce decide | Claude escolhe | |

**User's choice:** Diretorio unico (Recommended)

### Active indicator

| Option | Description | Selected |
|--------|-------------|----------|
| Badge sutil | Pequeno badge/dot no header | ✓ |
| Nome do harness | Texto pequeno tipo "harness: my-project" | |
| Sem indicador no header | So visivel na settings page | |
| Voce decide | Claude decide | |

**User's choice:** Badge sutil

---

## Auth Prompt on Switch

### Auth flow

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog inline no popover | Campo de API key aparece no popover | ✓ |
| Redirect para connection page | Redireciona para / com provider pre-selecionado | |
| Bloqueia com mensagem | Mensagem com link para connection page | |

**User's choice:** Dialog inline no popover

### Provider mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Sim -- mapeamento fixo | Claude Code = Anthropic, Codex = OpenAI | ✓ |
| Usuario escolhe | Mostra qual provider usar ao trocar | |
| Voce decide | Claude decide | |

**User's choice:** Sim -- mapeamento fixo (Recommended)

---

## Harness Error Feedback

### Error display

| Option | Description | Selected |
|--------|-------------|----------|
| Inline na settings page | Erro aparece na secao de harness | ✓ |
| Toast notification | Toast no canto da tela | |
| Dialog modal | Modal com detalhes do erro | |

**User's choice:** Inline na settings page (Recommended)

### Stale harness

| Option | Description | Selected |
|--------|-------------|----------|
| Mantem ate reload | Harness in-memory, continua ate proximo Load/restart | ✓ |
| Voce decide | Claude decide | |

**User's choice:** Mantem ate reload

---

## Claude's Discretion

- Componentes shadcn/ui para o popover
- Design da settings page
- Icones especificos por agente
- Implementacao do file picker
- Formato de armazenamento de harness no backend
- Endpoints API (models, harness)

## Deferred Ideas

None -- discussion stayed within phase scope
