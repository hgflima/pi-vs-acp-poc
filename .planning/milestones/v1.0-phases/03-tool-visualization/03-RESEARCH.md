# Phase 3: Tool Visualization - Research

**Researched:** 2026-04-03
**Domain:** pi-agent-core AgentEvent tool lifecycle, React tool card rendering, SSE event pipeline extension
**Confidence:** HIGH

## Summary

Phase 3 extends the existing streaming pipeline (Phase 2) to handle tool-related AgentEvents and render them as type-specific inline cards within assistant messages. The core challenge is three-fold: (1) extending the server-side stream adapter to emit tool_start/tool_update/tool_end SSE events from pi-agent-core's tool_execution_start/update/end AgentEvents plus toolcall_start/delta/end AssistantMessageEvents, (2) extending the client-side chat reducer and stream parser to manage ToolSegment lifecycle within the existing segment-based message model, and (3) building 6+ visually distinct React card components that update in real time during streaming.

The existing codebase is well-structured for this extension. The types already define `ToolSegment`, `ToolCardVariant`, and `ToolStatus` in `src/client/lib/types.ts`. The SSE event protocol already specifies `tool_start`, `tool_update`, and `tool_end` events. The `useChat` reducer already uses a segment-based model (`AssistantMessage.segments[]`) that naturally supports interleaved text and tool segments. The main implementation work is: (a) the server stream adapter currently only handles `message_update.text_delta` and `agent_end` -- it must be extended to handle `tool_execution_*` events, (b) the chat reducer needs new actions for tool lifecycle, (c) tool card components need to be built, and (d) server-side tools must be registered so the LLM actually uses them.

**Critical discovery:** The `@mariozechner/coding-agent` package (which contains bash, read, write, grep, etc. tools) is NOT installed and is too heavy for a POC. Server-side tools must be defined locally using the `AgentTool` interface from pi-agent-core. `@sinclair/typebox` v0.34.49 is available as a transitive dependency (verified). Simple proof-of-concept tools (a bash tool that runs commands, a read tool that reads files) are sufficient to exercise the full tool visualization pipeline.

**Primary recommendation:** Extend the existing pipeline bottom-up: first register server-side tools and add tool events to stream adapter, then add reducer actions and stream parser handling, then build the tool card components. Register at least 2-3 real tools server-side (bash + read/write) so the LLM actually triggers tool calls during conversation, exercising the full event flow.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOOL-01 | Tool calls rendered with differentiated UI by type during streaming | Segment-based model already supports interleaved segments; variant field on ToolSegment maps to card components |
| TOOL-02 | Card de bash with terminal visual (command + output) | AgentEvent.tool_execution_start carries args.command; tool_execution_end carries result with text content |
| TOOL-03 | Card de read/write with path highlighted and syntax highlighting | Tool args carry file_path; result carries file content; existing CodeBlock component can be reused |
| TOOL-04 | Card de glob/grep with formatted search results | Tool args carry pattern/path; result carries matching files/lines |
| TOOL-05 | Card de subagent/skill with name and status (running/done/error) | Can be rendered from tool_execution_start (name) + status transitions; no actual subagent tool needed for POC |
| TOOL-06 | Card de toolsearch with list of found tools | Simplest card variant -- just renders a list of tool names from result |
| TOOL-07 | Generic card for unknown tools (name + params JSON + result) | Fallback card renders raw JSON of args and result -- catches any tool not in the variant map |
| TOOL-08 | At least 6 tool types with distinct visual | 6 variants defined: bash, file, search, agent, toolsearch, generic. Each gets its own card component |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack:** pi-ai + pi-agent-core mandatory -- tool events must flow through these libraries
- **No database, no deploy, local-only** -- tools execute on local server
- **Single-user** -- no concurrency concerns for tool execution
- **API keys not exposed to frontend** -- proxy pattern maintained
- **GSD Workflow Enforcement** -- all edits through GSD workflow
- **Syntax highlighting:** highlight.js with github-dark theme (replaced Shiki in Phase 2 UAT fix)
- **Markdown:** react-markdown v10 + remark-gfm
- **State management:** useReducer pattern (no external state library)

## Standard Stack

### Core (already installed, no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mariozechner/pi-agent-core` | ^0.64.0 | AgentEvent with tool_execution_start/update/end | Validation target, provides full tool lifecycle events |
| `@mariozechner/pi-ai` | ^0.64.0 | AssistantMessageEvent with toolcall_start/delta/end | Provides LLM-level tool call streaming |
| `@sinclair/typebox` | 0.34.49 | Tool parameter schema definitions (Type.Object, Type.String) | Transitive dependency of pi-agent-core, already installed |
| `react` | ^19.2.0 | UI framework | Already installed |
| `highlight.js` | installed | Syntax highlighting in tool cards (file content) | Already used for code blocks in Phase 2 |
| `lucide-react` | ^1.7.0 | Icons for tool card headers | Already installed, tree-shakable |

### No New Dependencies Required

Phase 3 requires zero new npm packages. All needed libraries are already installed from Phase 1 and Phase 2. The tool cards are built from existing shadcn/ui primitives (Card, Badge), Tailwind utilities, lucide-react icons, and highlight.js. `@sinclair/typebox` 0.34.49 is available as a transitive dependency for server-side tool parameter definitions.

## Architecture Patterns

### Event Flow: AgentEvent to SSE to React State

Understanding the exact event flow is critical. There are TWO phases per tool call:

**Phase A: LLM streams the tool call definition** (via message_update events)
```
LLM emits toolcall_start -> agent-loop emits message_update{assistantMessageEvent.type: "toolcall_start"}
LLM emits toolcall_delta -> agent-loop emits message_update{assistantMessageEvent.type: "toolcall_delta", delta: "partial JSON"}
LLM emits toolcall_end  -> agent-loop emits message_update{assistantMessageEvent.type: "toolcall_end", toolCall: {id, name, arguments}}
```

**Phase B: Agent executes the tool** (via tool_execution_* events)
```
Agent starts tool    -> tool_execution_start{toolCallId, toolName, args}
Tool sends updates   -> tool_execution_update{toolCallId, toolName, args, partialResult: {content, details}}
Tool finishes        -> tool_execution_end{toolCallId, toolName, result: {content, details}, isError}
```

**Key insight:** The SSE adapter should emit `tool_start` when it receives `tool_execution_start` (not `toolcall_start`), because that's when we have the validated args and the tool is actually running. The `toolcall_*` events are LLM-side argument streaming -- useful for showing "preparing tool..." but the actual tool identity and params are finalized at `tool_execution_start`.

### SSE Event Mapping (stream-adapter.ts)

```typescript
// AgentEvent -> SSE mapping
switch (event.type) {
  case "message_update": {
    const ame = event.assistantMessageEvent
    if (ame.type === "text_delta") {
      // Already handled in Phase 2
      stream.writeSSE({ event: "text_delta", data: JSON.stringify({ data: ame.delta }) })
    }
    break
  }
  case "tool_execution_start":
    stream.writeSSE({
      event: "tool_start",
      data: JSON.stringify({
        tool: event.toolName,
        id: event.toolCallId,
        params: event.args,
      }),
    })
    break
  case "tool_execution_update":
    stream.writeSSE({
      event: "tool_update",
      data: JSON.stringify({
        id: event.toolCallId,
        data: extractTextFromResult(event.partialResult),
      }),
    })
    break
  case "tool_execution_end":
    stream.writeSSE({
      event: "tool_end",
      data: JSON.stringify({
        id: event.toolCallId,
        result: extractTextFromResult(event.result),
        status: event.isError ? "error" : "done",
      }),
    })
    break
}
```

### Result Text Extraction Helper

AgentToolResult has shape `{ content: (TextContent | ImageContent)[], details: T }`. To get a string for the SSE event:

```typescript
function extractTextFromResult(result: any): string {
  if (!result) return ""
  if (typeof result === "string") return result
  if (result.content && Array.isArray(result.content)) {
    return result.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n")
  }
  return JSON.stringify(result)
}
```

### Chat Reducer Extensions

New actions needed in `use-chat.ts`:

```typescript
type ChatAction =
  | /* ... existing actions ... */
  | { type: "TOOL_START"; tool: string; id: string; params: Record<string, unknown> }
  | { type: "TOOL_UPDATE"; id: string; data: string }
  | { type: "TOOL_END"; id: string; result: string; status: "done" | "error" }
```

**TOOL_START** handler:
1. Get the last AssistantMessage
2. Push a new ToolSegment into its segments array
3. Map tool name to variant: bash -> "bash", read/write -> "file", glob/grep -> "search", subagent/skill -> "agent", toolsearch -> "toolsearch", everything else -> "generic"
4. Set status to "running"

**TOOL_UPDATE** handler:
1. Find the ToolSegment by toolId in the last AssistantMessage's segments
2. Append or replace result text (for streaming output)

**TOOL_END** handler:
1. Find the ToolSegment by toolId
2. Set result and status

**Critical:** After a tool_end, the agent may emit more text_delta events (the LLM's response to the tool result). The APPEND_TEXT_DELTA handler already correctly handles this -- it checks if the last segment is a TextSegment, and if not, pushes a new one. This means text after a tool call automatically becomes a new TextSegment, achieving the interleaving.

### Tool Name to Variant Mapping

```typescript
function toolNameToVariant(toolName: string): ToolCardVariant {
  const lower = toolName.toLowerCase()
  switch (lower) {
    case "bash":
      return "bash"
    case "read":
    case "read_file":
    case "write":
    case "write_file":
    case "edit":
      return "file"
    case "glob":
    case "grep":
    case "find":
    case "ls":
    case "list_files":
      return "search"
    case "subagent":
    case "skill":
    case "agent":
      return "agent"
    case "toolsearch":
    case "tool_search":
      return "toolsearch"
    default:
      return "generic"
  }
}
```

### Recommended Component Structure

```
src/client/components/tools/
  tool-card.tsx           # Router component: reads variant, renders correct card
  bash-card.tsx           # Terminal-style: command + output
  file-card.tsx           # File path header + content with syntax highlighting
  search-card.tsx         # Search pattern + results list
  agent-card.tsx          # Agent/skill name + status badge
  toolsearch-card.tsx     # List of found tools
  generic-card.tsx        # Fallback: name + JSON params + result
  tool-status-badge.tsx   # Shared running/done/error badge (Spinner, Check, X icons)
```

### AssistantMessage Rendering (segment iteration)

The existing `assistant-message.tsx` currently concatenates all text segments and renders as one markdown block. For Phase 3, it must iterate segments in order:

```tsx
{message.segments.map((segment, i) => {
  if (segment.type === "text") {
    return <MarkdownRenderer key={i} content={segment.content} />
  }
  if (segment.type === "tool") {
    return <ToolCard key={segment.toolId} segment={segment} />
  }
})}
```

This naturally achieves inline interleaving: text, then tool card, then more text.

### Server-Side Tool Registration

The agent currently has `tools: []`. For the LLM to actually use tools (and generate tool_execution_* events), at least a few tools must be registered. POC tools should be defined in `src/server/agent/tools.ts` and passed to the Agent constructor in `setup.ts`.

```typescript
import { Type } from "@sinclair/typebox"
import type { AgentTool } from "@mariozechner/pi-agent-core"
```

Minimum tools to register for POC:
1. **bash** -- exercises "bash" variant card (terminal visual)
2. **read_file** -- exercises "file" variant card (path + content)
3. **list_files** -- exercises "search" variant card (file list)

The remaining 3 visual variants (agent, toolsearch, generic) are card components with distinct visuals that render correctly when their variant is assigned. They can be verified by either: (a) the generic fallback catching an unknown tool name, or (b) adding additional simple tools that map to those variants.

### Anti-Patterns to Avoid

- **Separate tool messages:** Do NOT create tool calls as separate messages in the chat. They must be segments within the AssistantMessage, interleaved with text segments. The segment-based model was designed for this exact purpose.
- **Polling for tool status:** Do NOT poll for tool completion. The SSE stream pushes tool_update and tool_end events in real time.
- **Heavy tool card re-renders:** Wrap completed tool cards in React.memo. During streaming, only the active (running) tool card and the latest text segment should re-render.
- **Blocking tool execution UI:** Tool cards must render immediately at tool_start with "running" state. Do not wait for tool_end to show the card.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tool parameter schemas | Custom JSON schema validation | `@sinclair/typebox` Type.Object/Type.String | AgentTool interface requires TSchema; typebox 0.34.49 already installed |
| Terminal-style rendering | Custom ANSI parser | Pre-formatted text with monospace font + dark background | ANSI parsing is complex; command + output as plain text is sufficient for POC |
| Status badge animations | Custom CSS animations | Tailwind `animate-spin` for spinner + lucide icons | Tailwind has built-in animation utilities |
| Collapsible sections | Custom accordion | shadcn/ui Collapsible or simple state toggle | Phase 3 requirements don't include expand/collapse (that's TOOLX-01, v2) |

## Common Pitfalls

### Pitfall 1: Text Segment Split After Tool Call
**What goes wrong:** After a tool call finishes, the LLM emits more text_delta events. If the reducer doesn't handle the transition correctly, the text either gets lost or appended to a stale segment.
**Why it happens:** The APPEND_TEXT_DELTA handler needs to check if the last segment is a TextSegment. If the last segment is a ToolSegment (just completed), it must push a new TextSegment.
**How to avoid:** The existing Phase 2 reducer already has this logic -- it checks `lastSeg?.type === "text"` before appending. This naturally handles the interleaving. Just verify it works when tool segments are in the mix.
**Warning signs:** Text appearing before a tool card instead of after it.

### Pitfall 2: Tool Events Arriving Out of Order
**What goes wrong:** `tool_update` or `tool_end` arrives for a toolId that doesn't exist in the segments yet.
**Why it happens:** Race condition if `tool_start` SSE event is dropped or arrives late.
**How to avoid:** In the reducer, if a `TOOL_UPDATE` or `TOOL_END` arrives for an unknown toolId, either ignore it or create the segment on the fly with "generic" variant.
**Warning signs:** Console errors about missing tool segments; silent data loss.

### Pitfall 3: Multiple Tool Calls in Single Turn
**What goes wrong:** The LLM can request multiple tool calls in a single assistant message (pi-agent-core supports parallel tool execution). All tool_execution_start events fire before any tool_execution_end.
**Why it happens:** This is normal behavior -- the agent processes multiple tool calls per turn.
**How to avoid:** Each tool segment is identified by `toolId` (which maps to `toolCallId`). The reducer must look up segments by ID, not by position. Multiple tool segments can be "running" simultaneously.
**Warning signs:** Tool cards overwriting each other; only the last tool card visible.

### Pitfall 4: Stream Adapter Promise Anchor with Tool Events
**What goes wrong:** The SSE stream closes before all tool events are emitted.
**Why it happens:** The Phase 2 anchor pattern resolves the Promise on `agent_end`. This is correct -- `agent_end` fires after ALL tool executions complete. But if a tool throws an unhandled error, the agent_end might not fire.
**How to avoid:** The existing pattern is already safe. `agent_end` is emitted after the entire agent loop finishes, including all tool executions. Just ensure error events from tools are caught and forwarded.
**Warning signs:** Stream closing mid-tool-execution; incomplete tool cards stuck in "running" state.

### Pitfall 5: React Memo and Segment Mutation
**What goes wrong:** AssistantMessage is wrapped in React.memo (Phase 2 decision). If the memo comparison is too shallow, tool card updates don't trigger re-renders.
**Why it happens:** React.memo does shallow comparison. If the message reference doesn't change, the component won't re-render.
**How to avoid:** The Phase 2 reducer already creates new object references at every nesting level (it uses spread operators). As long as the same pattern is followed for tool actions, React.memo will correctly detect changes.
**Warning signs:** Tool cards stuck in "running" state even though the reducer received TOOL_END.

### Pitfall 6: Agent System Prompt Does Not Encourage Tool Use
**What goes wrong:** The LLM responds with text only and never invokes tools, even when tools are registered.
**Why it happens:** The current system prompt is "You are a helpful assistant." -- it doesn't mention tools. While Anthropic models will use tools when they're registered, a system prompt that mentions the tools and encourages their use improves reliability.
**How to avoid:** Update the system prompt in `setup.ts` to describe the available tools and instruct the LLM to use them when appropriate (e.g., "You have access to bash, read_file, and list_files tools. Use them to help the user.").
**Warning signs:** Multiple conversations without any tool calls being triggered.

## Code Examples

### Example 1: Tool Card Router Component

```tsx
// src/client/components/tools/tool-card.tsx
import type { ToolSegment } from "@/client/lib/types"
import { BashCard } from "./bash-card"
import { FileCard } from "./file-card"
import { SearchCard } from "./search-card"
import { AgentCard } from "./agent-card"
import { ToolsearchCard } from "./toolsearch-card"
import { GenericCard } from "./generic-card"

interface ToolCardProps {
  segment: ToolSegment
}

export function ToolCard({ segment }: ToolCardProps) {
  switch (segment.variant) {
    case "bash":
      return <BashCard segment={segment} />
    case "file":
      return <FileCard segment={segment} />
    case "search":
      return <SearchCard segment={segment} />
    case "agent":
      return <AgentCard segment={segment} />
    case "toolsearch":
      return <ToolsearchCard segment={segment} />
    case "generic":
    default:
      return <GenericCard segment={segment} />
  }
}
```

### Example 2: Bash Card (Terminal Style)

```tsx
// src/client/components/tools/bash-card.tsx
import { Terminal, Loader2, Check, X } from "lucide-react"
import type { ToolSegment } from "@/client/lib/types"
import { cn } from "@/client/lib/cn"

interface BashCardProps {
  segment: ToolSegment
}

export function BashCard({ segment }: BashCardProps) {
  const command = (segment.args as { command?: string })?.command || ""
  const StatusIcon = segment.status === "running" ? Loader2
    : segment.status === "error" ? X : Check

  return (
    <div className="my-3 rounded-lg border border-zinc-700 overflow-hidden bg-zinc-900">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 text-xs">
        <Terminal className="h-3.5 w-3.5" />
        <span className="font-medium">Terminal</span>
        <StatusIcon className={cn("h-3.5 w-3.5 ml-auto",
          segment.status === "running" && "animate-spin text-blue-400",
          segment.status === "done" && "text-green-400",
          segment.status === "error" && "text-red-400",
        )} />
      </div>
      {/* Command */}
      <div className="px-3 py-2 font-mono text-sm text-zinc-200">
        <span className="text-zinc-500">$ </span>{command}
      </div>
      {/* Output */}
      {(segment.result || segment.error) && (
        <div className={cn(
          "border-t border-zinc-700 px-3 py-2 font-mono text-xs whitespace-pre-wrap max-h-64 overflow-auto",
          segment.status === "error" ? "text-red-400" : "text-zinc-400"
        )}>
          {segment.error || segment.result}
        </div>
      )}
    </div>
  )
}
```

### Example 3: Updated AssistantMessage with Segment Iteration

```tsx
// Updated assistant-message.tsx pattern
export const AssistantMessage = memo(function AssistantMessage({ message }: AssistantMessageProps) {
  return (
    <div className="flex gap-3 py-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium mb-1">Assistant</p>
        <div>
          {message.streaming && message.segments.length === 0 && <ThinkingIndicator />}
          {message.segments.map((segment, i) => {
            if (segment.type === "text" && segment.content) {
              return (
                <div key={i}>
                  <MarkdownRenderer content={segment.content} />
                </div>
              )
            }
            if (segment.type === "tool") {
              return <ToolCard key={segment.toolId} segment={segment} />
            }
            return null
          })}
          {message.streaming && <StreamingCursor />}
        </div>
      </div>
    </div>
  )
})
```

### Example 4: Reducer TOOL_START Action

```typescript
case "TOOL_START": {
  const msgs = [...state.messages]
  const last = msgs[msgs.length - 1] as AssistantMessage
  const segments = [...last.segments]
  segments.push({
    type: "tool",
    toolId: action.id,
    toolName: action.tool,
    variant: toolNameToVariant(action.tool),
    status: "running",
    args: action.params,
  })
  msgs[msgs.length - 1] = { ...last, segments }
  return { ...state, messages: msgs }
}
```

### Example 5: Simple Server-Side Bash Tool

```typescript
import { Type } from "@sinclair/typebox"
import type { AgentTool } from "@mariozechner/pi-agent-core"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export const bashTool: AgentTool = {
  name: "bash",
  label: "Bash",
  description: "Execute a bash command on the local machine and return stdout/stderr",
  parameters: Type.Object({
    command: Type.String({ description: "The bash command to execute" }),
  }),
  execute: async (toolCallId, params, signal) => {
    try {
      const { stdout, stderr } = await execAsync(params.command, {
        timeout: 30000,
        signal: signal ?? undefined,
      })
      return {
        content: [{ type: "text" as const, text: stdout || stderr || "(no output)" }],
        details: { exitCode: 0 },
      }
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: err.stderr || err.message }],
        details: { exitCode: err.code || 1 },
      }
    }
  },
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate "tool" message role | Segment-based model (ToolSegment within AssistantMessage) | Architecture design (Phase 1) | Tools render inline, not as separate chat bubbles |
| Shiki for syntax highlighting | highlight.js (github-dark theme) | Phase 2 UAT fix | Simpler, no async loading issues during streaming |
| EventSource API | fetch + ReadableStream | Phase 2 | Supports POST requests needed for chat endpoint |

## Open Questions

1. **System prompt for tool use**
   - What we know: The current system prompt is "You are a helpful assistant." which doesn't instruct the LLM to use tools
   - What's unclear: Whether the LLM will reliably use tools without explicit instruction
   - Recommendation: Update the system prompt to mention available tools and encourage their use. Anthropic models use tools well when tools are registered, but a system prompt hint improves reliability.

2. **Tool execution output size**
   - What we know: Tool results (like reading a large file or running a command with verbose output) can be very large
   - What's unclear: Whether large results will cause SSE parsing issues or UI rendering problems
   - Recommendation: Truncate tool results in the stream adapter to a reasonable limit (e.g., 10KB). Show a "truncated" indicator in the UI. This is a POC concern, not a v1 concern.

3. **How many real tools to register**
   - What we know: Need to exercise 6+ visual variants. Some variants (subagent, skill, toolsearch) don't have natural tool implementations in a simple POC.
   - What's unclear: Whether the LLM will trigger all 6 tool types in normal conversation.
   - Recommendation: Register 2-3 real tools (bash, read_file, list_files) that exercise bash/file/search variants. For the remaining variants (agent, toolsearch), demonstrate with the generic fallback or consider adding simple mock tools. The requirement is 6 card *types* with distinct visuals, not 6 distinct server-side tools -- the generic card counts as one, and tool cards can be visually verified with fewer actual tools.

## Sources

### Primary (HIGH confidence)
- `node_modules/@mariozechner/pi-agent-core/dist/types.d.ts` -- AgentEvent type union, AgentTool interface, tool_execution_start/update/end event shapes
- `node_modules/@mariozechner/pi-ai/dist/types.d.ts` -- AssistantMessageEvent with toolcall_start/delta/end, ToolCall shape, AgentToolResult shape
- `node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js` -- Actual emission of tool_execution_start/update/end events with data shapes
- `node_modules/@sinclair/typebox/package.json` -- Version 0.34.49 confirmed as transitive dependency
- `src/client/lib/types.ts` -- Existing ToolSegment, ToolCardVariant, ToolStatus, SSEEvent type definitions
- `src/server/lib/stream-adapter.ts` -- Current stream adapter handling only text_delta + agent_end
- `src/client/hooks/use-chat.ts` -- Current reducer with segment-based message model

### Secondary (MEDIUM confidence)
- [pi-web-ui reference implementation](https://github.com/badlogic/pi-mono/tree/main/packages/web-ui) -- Tool renderer registry pattern, BashRenderer and DefaultRenderer implementations
- [pi-mono coding-agent tools](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/src/core/tools) -- Tool names and patterns used by the reference agent (bash, read, write, edit, find, grep, ls)
- `.harn/docs/ARCHITECTURE.md` -- Data flow diagram showing tool_start/update/end SSE events, module structure with tools/ component directory

### Tertiary (LOW confidence)
- None -- all findings verified against source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All dependencies already installed, types already defined, typebox verified
- Architecture: HIGH - Event flow verified by reading pi-agent-core source code; segment-based model already designed for this
- Pitfalls: HIGH - Identified from actual code analysis of existing reducer, stream adapter, and agent-loop event emission patterns

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable -- no moving parts, all verified against installed packages)
