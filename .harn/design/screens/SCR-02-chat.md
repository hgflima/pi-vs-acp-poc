# SCR-02: Chat

## 1. Meta
- **Route:** `/chat`
- **Requirements:** BRIEF (Chat, Agent Switcher, Model Switcher, Tool Calls, Streaming), JOURNEY Phases 2-5
- **Status:** Draft
- **Last Updated:** 2026-04-03

## 2. Purpose

Tela principal da aplicacao. Exibe a conversa com o LLM em tempo real via streaming, com visualizacao diferenciada de tool calls, controles de agente/modelo no header, e campo de input fixo no bottom. Esta tela concentra ~90% da funcionalidade do POC.

## 3. Wireframe

**Estado inicial (sem mensagens)**

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Pi AI Chat    [Claude Code ▾] [claude-opus-4 ▾]   [⚙ Har] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                         Pi AI Chat                              │
│                   Start a conversation                          │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │  Message...                                          [Send] │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Estado com conversa ativa**

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Pi AI Chat    [Claude Code ▾] [claude-opus-4 ▾]   [⚙ Har] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│         ┌─────────────────────────────────────────┐             │
│         │ Read the file src/main.ts and explain   │  ← user    │
│         └─────────────────────────────────────────┘             │
│                                                                 │
│  ┌─ Read ──────────────────────────────────────────┐            │
│  │ 📄 src/main.ts                            [▾]  │  ← tool   │
│  │ ┌────────────────────────────────────────────┐  │            │
│  │ │ import { stream } from '@mariozechner/...' │  │            │
│  │ │ import { Agent } from '...'                │  │            │
│  │ │ ...                                        │  │            │
│  │ └────────────────────────────────────────────┘  │            │
│  └─────────────────────────────────────────────────┘            │
│                                                                 │
│  This file is the entry point of the application.    ← assist  │
│  It imports the streaming API and sets up the                   │
│  agent loop with tool definitions...                            │
│  █  ← streaming cursor                                         │
│                                                                 │
│         ┌─────────────────────────────────────────┐             │
│         │ Now run the tests                       │  ← user    │
│         └─────────────────────────────────────────┘             │
│                                                                 │
│  ┌─ Bash ──────────────────────────────────────────┐            │
│  │ $ npm test                                 [▾]  │  ← tool   │
│  │ ┌────────────────────────────────────────────┐  │            │
│  │ │▌ Running tests...                         │  │            │
│  │ │  PASS src/main.test.ts                    │  │            │
│  │ └────────────────────────────────────────────┘  │            │
│  └─────────────────────────────────────────────────┘            │
│                                                                 │
│  ┌─ Agent ─────────────────────────────────────────┐            │
│  │ 🤖 code-reviewer           ◐ Running...   [▸]  │  ← tool   │
│  └─────────────────────────────────────────────────┘            │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │  Message...                                          [Send] │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Layout Structure
- **Page:** Full viewport height, flex column
- **Header:** Fixed top, full width, height ~56px, background `color.background.default`, border-bottom `color.border.default`
- **Chat area:** Flex grow, overflow-y auto, padding-bottom for input clearance
- **Message container:** Max-width 720px (`layout.chat-max-width`), centered horizontally, padding spacing.6
- **Input area:** Fixed bottom, full width, background `color.background.default`, border-top `color.border.muted`, padding spacing.4
- **Input container:** Max-width 720px, centered

## 5. Components

### Header

| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| Logo/Text | brand | size=sm, weight=semibold | "Pi AI Chat" — left aligned |
| Select | dropdown | options=agents | Agent switcher — "Claude Code" / "Codex" |
| Select | dropdown | options=models | Model switcher — dynamic per provider via `getModels()` |
| IconButton | ghost | icon=settings | Opens Harness Config modal (SCR-03) |

### Message Area

| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| UserMessage | bubble | bg=color.background.user-msg | Right-aligned or left with bg, border-radius.lg |
| AssistantMessage | plain | - | Left-aligned, no background, markdown rendered |
| StreamingCursor | blink | - | Block cursor or animated dots during streaming |

### Tool Call Cards

| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| ToolCard | bash | bg=color.tool.bash, text=inverse | Terminal style — dark bg, mono font, `$` prefix |
| ToolCard | file | bg=color.tool.file | Read/Write — file icon, path in header, content preview |
| ToolCard | search | bg=color.tool.search | Glob/Grep — search icon, pattern in header, results list |
| ToolCard | agent | bg=color.tool.agent | Subagent/Skill — bot icon, name, status badge, expandable |
| ToolCard | toolsearch | bg=color.tool.generic | ToolSearch — list of discovered tools |
| ToolCard | generic | bg=color.tool.generic | Fallback — tool name, params as JSON, result |
| Chevron | toggle | expanded/collapsed | Expand/collapse tool card details |
| StatusBadge | inline | running/done/error | Tool execution status |
| Spinner | sm | - | During tool_execution_start/update |

### Input Area

| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| Textarea | auto-resize | maxHeight=200px, placeholder="Message..." | Auto-grows up to input-max-height |
| IconButton | primary | icon=send, disabled when empty | Send button — right side of textarea |

### Empty State

| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| Heading | h2 | size=2xl, weight=semibold, color=text.muted | "Pi AI Chat" |
| Text | muted | size=sm | "Start a conversation" |

## 6. States

### Empty State
- No messages in conversation
- Centered placeholder with app name + prompt
- Input focused and ready

### Streaming State
- Last assistant message actively receiving tokens
- Streaming cursor (blinking block `█`) at end of text
- Send button disabled / replaced with stop button
- Input disabled during streaming

### Tool Execution State
- Tool card appears with type-specific styling
- Status: `running` with spinner
- Progress updates via `tool_execution_update` events
- On completion: status changes to `done`, result revealed
- On error: status changes to `error`, error message shown

### Tool Card Expanded
- Full content visible (command output, file contents, search results)
- Scrollable if content exceeds max-height (~300px)

### Tool Card Collapsed
- Single line: tool type icon + name/path + status badge
- Click to expand

### Error State (streaming)
- Error alert inline below last user message
- "Something went wrong" + retry button
- Previous messages remain visible

### Disconnected State
- Banner at top: "Connection lost. Reconnecting..."
- Or redirect to `/` if auth expired

## 7. Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| Type in textarea | Auto-resize height | Textarea grows up to 200px |
| Enter (no shift) | Send message | Message appears as user bubble, streaming begins |
| Shift+Enter | New line in textarea | Line break inserted |
| Click Send | Send message | Same as Enter |
| Agent change | Update provider + model list | Header updates, model dropdown refreshes via `getModels()` |
| Model change | Update active model | Header indicator updates |
| Click Harness button | Open SCR-03 modal | Modal overlay appears |
| Click tool card chevron | Toggle expand/collapse | Card content shows/hides with transition.fast |
| Scroll up during stream | Pause auto-scroll | Auto-scroll resumes when user scrolls to bottom |
| Click retry (on error) | Resend last message | Error cleared, streaming restarts |

## 8. Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| Desktop (all) | Chat max-width 720px centered — POC is desktop-only |

## 9. Accessibility

- Focus: Input textarea on page load
- Tab order: Agent selector -> Model selector -> Harness button -> Chat area -> Input
- New messages announced via `aria-live="polite"` region
- Tool cards: `role="region"`, `aria-expanded` for collapse state
- Keyboard: Enter to send, Shift+Enter for newline, Escape to cancel streaming
- Streaming status announced: "Assistant is responding..."

## 10. Content

| Element | Text | Notes |
|---------|------|-------|
| Header title | "Pi AI Chat" | App name, left |
| Agent default | "Claude Code" | Default agent selection |
| Model default | (from `getModels()`) | First available model |
| Harness button tooltip | "Harness configuration" | On hover |
| Input placeholder | "Message..." | Textarea placeholder |
| Empty state title | "Pi AI Chat" | Centered |
| Empty state subtitle | "Start a conversation" | Below title |
| Streaming indicator | `█` (blinking cursor) | At end of streaming text |
| Tool status running | "Running..." | Badge text |
| Tool status done | "Done" | Badge text |
| Tool status error | "Error" | Badge text |
| Error inline | "Something went wrong. Please try again." | Below user message |
| Retry button | "Retry" | In error state |
| Disconnected banner | "Connection lost" | Top banner |

---

## Tool Card Specifications

### Bash Tool Card
- **Header:** `$ {command}` in mono font
- **Background:** `color.tool.bash` (#1E293B) — dark terminal look
- **Text:** `color.text.inverse` (#FFFFFF)
- **Content:** Command output in mono, scrollable
- **Status:** Spinner while running, exit code on completion

### Read/Write Tool Card
- **Header:** `📄 {file_path}` — file icon + path
- **Background:** `color.tool.file` (#F0FDF4) — soft green
- **Content:** File content preview with syntax highlighting (if feasible), line numbers
- **Write variant:** Shows diff or "wrote N lines" summary

### Glob/Grep Tool Card
- **Header:** `🔍 {pattern}` — search icon + pattern/query
- **Background:** `color.tool.search` (#EFF6FF) — soft blue
- **Content:** List of matching files/lines, match highlights

### Subagent/Skill Tool Card
- **Header:** `🤖 {agent_name}` or `⚡ {skill_name}`
- **Background:** `color.tool.agent` (#FDF5F2) — warm primary tint
- **Content:** Agent description, progress events, final result
- **Collapsed default:** Shows name + status only (expand to see details)

### ToolSearch Tool Card
- **Header:** `🔧 ToolSearch`
- **Background:** `color.tool.generic` (#F5F5F0)
- **Content:** List of discovered tools with names and descriptions

### Generic Tool Card
- **Header:** `🔧 {tool_name}`
- **Background:** `color.tool.generic` (#F5F5F0)
- **Content:** Parameters as formatted JSON, result below
