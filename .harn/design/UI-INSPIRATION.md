# UI Inspiration

Last updated: 2026-04-03

## Primary Reference: Claude.ai

### Layout
- **Sidebar:** Lista de conversas à esquerda, colapsável
- **Chat area:** Central, largura máxima limitada (~720px), centralizada
- **Input:** Fixed no bottom, com bordas arredondadas, área de texto expansível
- **Header:** Minimal — nome do modelo/agente, poucas ações

### Visual Language
- **Background:** Branco/off-white (#FAFAF8 ou similar)
- **Cards:** Bordas sutis, sem sombras pesadas
- **Typography:** Sans-serif limpa (Inter, system-ui)
- **Spacing:** Generoso — breathing room entre mensagens
- **Colors:** Neutros predominam; accent color sutil para ações
- **User messages:** Background sutil para distinguir do assistant
- **Assistant messages:** Sem background, texto direto

### Tool Calls (Claude.ai pattern)
- Bloco inline com ícone do tipo de tool
- Estado: loading (spinner) → completo (resultado colapsável)
- Visual distinto do texto da resposta
- Expandir/colapsar para ver detalhes

### Interactions
- Streaming suave — tokens aparecem fluindo
- Transições sutis (fade-in para novas mensagens)
- Sem animações excessivas — foco na legibilidade

### Componentes-chave a replicar
1. **Message bubble** — Diferenciação user vs assistant
2. **Tool call card** — Tipo visual + status + expand/collapse
3. **Model/Agent selector** — Dropdown ou chip no header
4. **Input area** — Textarea auto-resize com botão de envio
5. **Streaming indicator** — Cursor piscando ou dots durante resposta
