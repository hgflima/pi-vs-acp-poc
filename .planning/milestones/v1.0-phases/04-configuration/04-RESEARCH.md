# Phase 4: Configuration - Research

**Researched:** 2026-04-04
**Domain:** Agent/model switching, harness loading, runtime configuration UI
**Confidence:** HIGH

## Summary

Phase 4 makes the currently hardcoded agent and model in ChatLayout dynamic. The codebase already has stubs in `AppState.agent` and `AppState.harness`, a parametrized `createAgent()`, and a multi-provider credential store. The main work is: (1) a popover in the header for agent/model switching, (2) a `/settings` page for harness file picking, (3) two new backend endpoints (`GET /api/models`, `POST /api/harness`), and (4) wiring dynamic state through the existing chat pipeline.

A critical discovery is that pi-ai's `"openai-codex"` provider uses OAuth (baseUrl: `chatgpt.com`), while the `"openai"` provider uses standard API keys (baseUrl: `api.openai.com/v1`) and includes models like `codex-mini-latest`. Since the user's D-11 decision specifies API-key-based auth for both agents, the "Codex" agent should map to the `"openai"` provider -- not `"openai-codex"`. The `"openai"` provider gives access to GPT and Codex models via standard API keys, which aligns with the POC's API-key-first approach (ADR-005).

**Primary recommendation:** Use `getModels(provider)` from pi-ai to dynamically populate model lists. Map Claude Code to `"anthropic"` provider and Codex to `"openai"` provider. Use shadcn/ui Popover for the header switcher. Use the browser File System Access API (`showDirectoryPicker`) for harness directory selection with `<input type="file" webkitdirectory>` as fallback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Nome do agente no header e clicavel, abre popover com secoes de agente e modelo -- estilo minimalista similar ao Cursor
- **D-02:** Icone do agente ativo visivel no header ao lado do nome -- identificacao visual rapida
- **D-03:** Icones por agente dentro do popover para diferenciacao visual
- **D-04:** Lista de modelos vem de `getModels(provider)` da pi-ai -- dinamica, nao hardcoded
- **D-05:** Qualquer troca (agente ou modelo) limpa o chat e comeca nova conversa -- sem preservar historico
- **D-06:** Troca e imediata ao clicar, sem dialog de confirmacao
- **D-07:** File picker com drag & drop em settings page separada (/settings) -- nao no popover do header
- **D-08:** Usuario aponta para diretorio unico; backend busca CLAUDE.md, AGENTS.md, .claude/skills/, .claude/hooks/ automaticamente
- **D-09:** Badge sutil no header indica harness ativo; click no badge navega para settings page
- **D-10:** Quando usuario troca para agente cujo provider nao esta autenticado, dialog inline aparece no popover com campo de API key e botao Connect
- **D-11:** Mapeamento fixo agente-provider: Claude Code = Anthropic, Codex = OpenAI -- sem escolha de provider ao trocar agente
- **D-12:** Erros de harness loading (arquivo nao encontrado, formato invalido, harness muito grande) aparecem inline na settings page com mensagem descritiva
- **D-13:** Harness carregado in-memory; se arquivo fonte for deletado/movido, continua funcionando ate proximo Load ou restart (sem file watching)

### Claude's Discretion
- Componentes shadcn/ui para o popover (Popover, RadioGroup, ou custom)
- Design exato da settings page (layout, secoes, espacamento)
- Icones especificos por agente (lucide icons ou custom)
- Implementacao do file picker (browser File API, input type=file, ou lib)
- Formato de armazenamento de harness no backend (in-memory object shape)
- Endpoint API para harness loading (POST /api/harness ou similar)
- Endpoint API para listar modelos (GET /api/models?provider=X ou similar)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-01 | Switcher na interface para trocar entre Claude Code e Codex | Popover component in header, agent state in useAgent hook, D-01/D-02/D-03 |
| AGENT-02 | Troca de agente cria nova instancia de Agent (ADR-006) with history as context | Agent.setModel() exists but D-05 clears chat, so fresh Agent per switch. createAgent() already parametrized |
| AGENT-03 | Indicador visual do agente ativo | Agent icon + name in header (D-02), hardcoded currently in chat-header.tsx |
| AGENT-04 | Se o provider do agente selecionado nao estiver autenticado, solicitar auth | Inline auth dialog in popover (D-10), reuse useAuth hook + connectProvider API |
| MODEL-01 | Dropdown com modelos disponiveis para o provider ativo (via getModels) | `getModels(provider)` returns Model[] with id, name, reasoning fields. Backend endpoint wraps this |
| MODEL-02 | Troca de modelo atualiza proximas interacoes | D-05 clears chat on model switch, new Agent created with new model via createAgent() |
| MODEL-03 | Lista de modelos atualiza ao trocar de agente/provider | Frontend fetches GET /api/models?provider=X when agent changes |
| MODEL-04 | Indicador visual do modelo ativo | Model badge in header (already exists as hardcoded span, make dynamic) |
| HARN-01 | Interface para selecionar/apontar arquivos de harness | Settings page at /settings with directory picker (D-07, D-08) |
| HARN-02 | Backend carrega e aplica harness ao system prompt do agente | POST /api/harness endpoint; createAgent() receives dynamic systemPrompt |
| HARN-03 | Indicador visual de que o harness esta ativo | Badge in header (D-09), click navigates to /settings |
| HARN-04 | Error handling para arquivo nao encontrado, formato invalido, harness muito grande | Inline errors on settings page (D-12), backend returns structured error per file |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mariozechner/pi-ai` | ^0.64.0 | `getModels(provider)` for dynamic model lists, `getModel(provider, id)` for model instances | Validation target -- model registry is built-in |
| `@mariozechner/pi-agent-core` | ^0.64.0 | `Agent` class with `setSystemPrompt()`, `setModel()` | Agent has mutation methods but D-05 means fresh instances |
| `react-router` | ^7.14.0 | Add `/settings` route for harness page | Already installed, just add route |
| `lucide-react` | ^1.7.0 | Agent icons (Bot, Cpu, Settings2, FolderOpen, etc.) | Already installed |

### New shadcn/ui Components Required
| Component | Purpose | Install Command |
|-----------|---------|----------------|
| `popover` | Header agent/model switcher popover (D-01) | `npx shadcn@latest add popover` |
| `dialog` | Inline auth prompt when switching to unauthenticated provider (D-10) | `npx shadcn@latest add dialog` |
| `label` | Form labels in settings page and auth dialog | `npx shadcn@latest add label` |

**Installation:**
```bash
npx shadcn@latest add popover dialog label
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn Popover | Custom dropdown div | Popover handles positioning, focus trap, escape dismiss; don't hand-roll |
| shadcn Dialog | Alert component inline | Dialog is the standard for modal auth prompts; alert lacks input |
| showDirectoryPicker API | Manual path text input | API gives native OS folder picker; text input is error-prone but works as fallback |

## Architecture Patterns

### Recommended Project Structure (new/modified files)
```
src/
├── client/
│   ├── app.tsx                          # ADD /settings route
│   ├── hooks/
│   │   ├── use-agent.ts                 # NEW: agent/model selection state
│   │   └── use-harness.ts              # NEW: harness loading state
│   ├── lib/
│   │   ├── api.ts                       # ADD: fetchModels(), loadHarness() helpers
│   │   └── types.ts                     # EXPAND: AgentId type, HarnessState shape
│   ├── components/
│   │   ├── chat/
│   │   │   ├── chat-header.tsx          # REWRITE: dynamic agent/model with popover
│   │   │   └── chat-layout.tsx          # MODIFY: use dynamic agent/model state
│   │   ├── config/
│   │   │   ├── agent-model-popover.tsx  # NEW: popover with agent + model sections
│   │   │   └── inline-auth.tsx          # NEW: inline API key form for unauthenticated providers
│   │   ├── settings/
│   │   │   ├── settings-page.tsx        # NEW: harness management page
│   │   │   └── harness-picker.tsx       # NEW: directory picker + file list
│   │   └── ui/
│   │       ├── popover.tsx              # NEW: shadcn/ui popover
│   │       ├── dialog.tsx               # NEW: shadcn/ui dialog
│   │       └── label.tsx                # NEW: shadcn/ui label
│   └── styles/globals.css               # No changes expected
├── server/
│   ├── index.ts                         # ADD: modelRoutes, harnessRoutes
│   ├── routes/
│   │   ├── models.ts                    # NEW: GET /api/models?provider=X
│   │   └── harness.ts                   # NEW: POST /api/harness/load
│   └── agent/
│       ├── setup.ts                     # MODIFY: accept systemPrompt param
│       └── harness.ts                   # NEW: file discovery + loading logic
```

### Pattern 1: Agent-Provider Mapping
**What:** Fixed mapping from UI agent names to pi-ai provider strings
**When to use:** Every agent switch, model fetch, auth check

```typescript
// Source: pi-ai models.generated.js (verified in node_modules)
const AGENT_CONFIG = {
  "claude-code": {
    provider: "anthropic" as const,
    label: "Claude Code",
    icon: "Bot",         // lucide icon name
    defaultModel: "claude-sonnet-4-20250514",
  },
  "codex": {
    provider: "openai" as const,
    label: "Codex",
    icon: "Cpu",         // lucide icon name
    defaultModel: "codex-mini-latest",
  },
} as const;

type AgentId = keyof typeof AGENT_CONFIG;
```

**CRITICAL NOTE on Provider Mapping:**
- pi-ai has TWO OpenAI-related providers: `"openai"` (API key, `api.openai.com`) and `"openai-codex"` (OAuth, `chatgpt.com`)
- `"openai-codex"` requires ChatGPT Plus OAuth flow -- NOT compatible with API keys
- `"openai"` uses standard `OPENAI_API_KEY` and includes `codex-mini-latest`, GPT-4o, GPT-4o-mini, etc.
- Per ADR-005 (API key first) and D-10/D-11, Codex agent maps to `"openai"` provider (API key auth)
- The `Provider` type in `types.ts` is already `"anthropic" | "openai"` which is correct

### Pattern 2: Dynamic Model Fetching
**What:** Backend endpoint wrapping `getModels()` from pi-ai
**When to use:** When user opens popover or switches agent

```typescript
// Source: pi-ai/dist/models.js (verified)
import { getModels } from "@mariozechner/pi-ai";

// Returns Model[] with { id, name, provider, reasoning, contextWindow, ... }
const models = getModels("anthropic");
// Returns ~20+ models for anthropic including all Claude variants

// For the frontend, send only what's needed:
const simplified = models.map(m => ({
  id: m.id,
  name: m.name,
  reasoning: m.reasoning,
}));
```

### Pattern 3: Harness File Discovery
**What:** Backend receives directory path, discovers harness files
**When to use:** When user selects a project directory for harness loading

```typescript
// Backend harness.ts pattern
interface HarnessResult {
  claudeMd: { content: string; size: number } | null;
  agentsMd: { content: string; size: number } | null;
  skills: { count: number; names: string[] } | null;
  hooks: { count: number; names: string[] } | null;
  errors: Array<{ file: string; error: string }>;
}

async function discoverHarness(dirPath: string): Promise<HarnessResult> {
  // Look for:
  // - {dirPath}/CLAUDE.md
  // - {dirPath}/AGENTS.md
  // - {dirPath}/.claude/skills/   (list subdirs)
  // - {dirPath}/.claude/hooks/    (list files)
}
```

### Pattern 4: System Prompt with Harness
**What:** Prepend harness content to system prompt when creating Agent
**When to use:** Every chat message when harness is active

```typescript
// Source: pi-agent-core/dist/agent.d.ts (verified)
// Agent constructor accepts initialState.systemPrompt
// Agent also has setSystemPrompt() for mutation

const BASE_SYSTEM_PROMPT = "You are a helpful assistant...";

function buildSystemPrompt(harness: HarnessResult | null): string {
  if (!harness) return BASE_SYSTEM_PROMPT;

  let prompt = BASE_SYSTEM_PROMPT;
  if (harness.claudeMd) {
    prompt += "\n\n## Project Instructions (CLAUDE.md)\n\n" + harness.claudeMd.content;
  }
  if (harness.agentsMd) {
    prompt += "\n\n## Agents Configuration (AGENTS.md)\n\n" + harness.agentsMd.content;
  }
  return prompt;
}
```

### Pattern 5: Chat Clear on Switch (D-05)
**What:** Any agent or model change immediately clears messages
**When to use:** In useAgent hook when agent or model changes

```typescript
// In ChatLayout or useAgent:
const switchAgent = (agentId: AgentId) => {
  clearMessages();  // from useChat
  setAgent(agentId);
  // Model list will be re-fetched via useEffect
};

const switchModel = (modelId: string) => {
  clearMessages();  // from useChat
  setModel(modelId);
};
```

### Anti-Patterns to Avoid
- **Reusing Agent instance across switches:** D-05 means chat clears; create fresh Agent per request in chat route (already the pattern -- Agent created inside streamSSE callback)
- **Hardcoding model IDs in frontend:** Use `getModels()` API; pi-ai adds models frequently
- **Using `"openai-codex"` provider:** Requires ChatGPT OAuth, not API keys. Use `"openai"` provider which has Codex models accessible via standard API keys
- **File watching for harness:** D-13 explicitly says no file watching; load once, keep in memory
- **Storing harness on client:** Harness files are server-side concern; client sends directory path, server loads and stores

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Popover positioning | Manual absolute positioning + click-outside | shadcn/ui Popover (Radix) | Handles viewport edges, focus trap, accessibility, ESC dismiss |
| Model registry | Hardcoded model list | `getModels(provider)` from pi-ai | Registry maintained by pi-mono team, always current |
| Directory file discovery | Custom recursive walker | `fs.readdir` + `fs.stat` with known paths | Only 4 fixed file locations to check; no need for deep traversal |
| Form validation | Manual state checking | HTML5 required + pattern attributes | Sufficient for single-field API key form |
| Auth state per provider | New credential system | Existing `credentials.ts` (hasCredentials, storeCredentials) | Already built and tested in Phase 1 |

**Key insight:** This phase is primarily UI wiring and API plumbing. The heavy lifting (Agent creation, streaming, credential management) is already done. Don't over-engineer.

## Common Pitfalls

### Pitfall 1: Provider Type Mismatch
**What goes wrong:** Using `"openai"` in the Provider type but calling `getModels("openai-codex")` or vice versa
**Why it happens:** pi-ai has both `"openai"` (API key) and `"openai-codex"` (OAuth) as distinct providers. It's easy to confuse them.
**How to avoid:** Keep the existing `Provider = "anthropic" | "openai"` type. The "Codex" agent maps to the `"openai"` provider. Never reference `"openai-codex"`.
**Warning signs:** Models list returns GPT-5.x with chatgpt.com baseUrl; auth fails because OAuth is expected

### Pitfall 2: Stale Model List After Agent Switch
**What goes wrong:** User switches from Claude Code to Codex, but model dropdown still shows Anthropic models
**Why it happens:** Model list not refreshed when agent changes, or async fetch hasn't completed
**How to avoid:** Re-fetch models whenever `agent.current` changes (useEffect dependency). Show loading state while fetching. Set model to `null` during transition, then to defaultModel once list arrives.
**Warning signs:** Sending request with Anthropic model to OpenAI provider (400/404 errors)

### Pitfall 3: Chat Not Clearing on Switch
**What goes wrong:** User switches model but old messages remain, next message uses wrong model
**Why it happens:** Missing clearMessages() call before state update, or clearMessages and setModel are not batched
**How to avoid:** Per D-05/D-06, call clearMessages() FIRST, then update agent/model state. Both in the same user action handler.
**Warning signs:** Messages from different models interleaved in the same conversation

### Pitfall 4: Harness Path Security (Path Traversal)
**What goes wrong:** Frontend sends arbitrary path that reads files outside intended scope
**Why it happens:** Backend trusts client-provided directory path without validation
**How to avoid:** Validate that path is an absolute path. Resolve symlinks. Only read the 4 known file locations (CLAUDE.md, AGENTS.md, .claude/skills/, .claude/hooks/). Set a max file size (e.g., 100KB per file).
**Warning signs:** Backend reads /etc/passwd or ~/.ssh/id_rsa

### Pitfall 5: Popover Doesn't Close on Selection
**What goes wrong:** User clicks a model in the popover but it stays open
**Why it happens:** Radix Popover doesn't auto-close on child clicks; need explicit `onOpenChange(false)`
**How to avoid:** Call setOpen(false) in the agent/model click handlers alongside the state change
**Warning signs:** User has to click outside or press Escape after every selection

### Pitfall 6: Credentials Check Race Condition
**What goes wrong:** User switches to Codex, the model list loads, but auth dialog flashes briefly then disappears
**Why it happens:** Checking `hasCredentials` on the client vs server gets out of sync
**How to avoid:** The server endpoint GET /api/models should return a 401 if the provider is not authenticated. Let the frontend handle the 401 by showing inline auth. Single source of truth: the server's credential store.
**Warning signs:** Auth dialog appears and disappears, or auth succeeds but models still show empty

## Code Examples

### Backend: GET /api/models endpoint
```typescript
// Source: pi-ai/dist/models.js getModels() verified in node_modules
import { Hono } from "hono";
import { getModels } from "@mariozechner/pi-ai";
import { hasCredentials } from "../lib/credentials";

const modelRoutes = new Hono();

modelRoutes.get("/", (c) => {
  const provider = c.req.query("provider") as "anthropic" | "openai";

  if (!provider || !["anthropic", "openai"].includes(provider)) {
    return c.json({ error: "Invalid provider" }, 400);
  }

  if (!hasCredentials(provider)) {
    return c.json({ error: "Not authenticated", needsAuth: true }, 401);
  }

  const models = getModels(provider);
  return c.json({
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
    })),
  });
});

export { modelRoutes };
```

### Backend: POST /api/harness/load endpoint
```typescript
// Source: Node.js fs API
import { Hono } from "hono";
import fs from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 100 * 1024; // 100KB per file

const harnessRoutes = new Hono();

harnessRoutes.post("/load", async (c) => {
  const { directory } = await c.req.json<{ directory: string }>();

  if (!directory || !path.isAbsolute(directory)) {
    return c.json({ error: "Absolute directory path required" }, 400);
  }

  const result = { claudeMd: null, agentsMd: null, skills: null, hooks: null, errors: [] };

  // Discover files at known locations
  for (const [key, relPath] of [
    ["claudeMd", "CLAUDE.md"],
    ["agentsMd", "AGENTS.md"],
  ]) {
    const fullPath = path.join(directory, relPath);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.size > MAX_FILE_SIZE) {
        result.errors.push({ file: relPath, error: `File too large (${stat.size} bytes, max ${MAX_FILE_SIZE})` });
        continue;
      }
      const content = await fs.readFile(fullPath, "utf-8");
      result[key] = { content, size: stat.size };
    } catch {
      // File not found -- not an error, just absent
    }
  }

  // Check for skills and hooks directories
  // ... (similar pattern for .claude/skills/ and .claude/hooks/)

  return c.json(result);
});
```

### Frontend: useAgent hook pattern
```typescript
// Source: Follows use-auth.ts pattern in existing codebase
import { useState, useCallback, useEffect } from "react";

type AgentId = "claude-code" | "codex";

const AGENT_PROVIDER_MAP = {
  "claude-code": "anthropic",
  "codex": "openai",
} as const;

const DEFAULT_MODELS = {
  "claude-code": "claude-sonnet-4-20250514",
  "codex": "codex-mini-latest",
} as const;

export function useAgent() {
  const [current, setCurrent] = useState<AgentId>("claude-code");
  const [model, setModel] = useState<string>(DEFAULT_MODELS["claude-code"]);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  const provider = AGENT_PROVIDER_MAP[current];

  // Fetch models when agent changes
  useEffect(() => {
    setLoading(true);
    fetch(`/api/models?provider=${provider}`)
      .then(res => res.json())
      .then(data => {
        setAvailableModels(data.models || []);
        setModel(DEFAULT_MODELS[current]);
      })
      .catch(() => setAvailableModels([]))
      .finally(() => setLoading(false));
  }, [current, provider]);

  const switchAgent = useCallback((id: AgentId) => {
    setCurrent(id);
    // D-05: clearMessages called by ChatLayout
  }, []);

  const switchModel = useCallback((id: string) => {
    setModel(id);
    // D-05: clearMessages called by ChatLayout
  }, []);

  return { current, model, provider, availableModels, loading, switchAgent, switchModel };
}
```

### Frontend: AgentModelPopover structure
```typescript
// Source: shadcn/ui Popover pattern
import { Popover, PopoverContent, PopoverTrigger } from "@/client/components/ui/popover";

// Trigger: agent name + icon in header (clickable)
// Content: two sections
//   1. Agent section: radio-like list (Claude Code / Codex) with icons
//   2. Model section: scrollable list of models for current provider
// If provider not authenticated: show inline auth form instead of model list
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded model in ChatLayout | Dynamic model from useAgent hook | This phase | All future messages use selected model |
| Single provider (Anthropic) | Multi-provider with credential check | This phase | Must check auth before each provider switch |
| No harness support | System prompt injection from files | This phase | Agent behavior customizable per project |

**Deprecated/outdated:**
- ADR-006 mentions "context via history" but D-05 clears history on switch, so every agent switch starts a fresh conversation. No history re-sending needed for this POC.

## Open Questions

1. **Default model for OpenAI provider**
   - What we know: `getModels("openai")` returns 20+ models including codex-mini-latest, gpt-4o, gpt-4o-mini
   - What's unclear: Which model should be the default when user first switches to Codex agent
   - Recommendation: Use `codex-mini-latest` as default (cheapest Codex model, good for testing)

2. **Harness file size limits**
   - What we know: CLAUDE.md files can be large (10KB+), AGENTS.md can be very large
   - What's unclear: What's a reasonable max per file for system prompt injection
   - Recommendation: 100KB per file, warn if total harness > 200KB (context window concerns)

3. **Skills and hooks in harness**
   - What we know: D-08 says discover .claude/skills/ and .claude/hooks/ directories
   - What's unclear: What exactly to do with skills/hooks -- load as text into system prompt? Or register as tools?
   - Recommendation: For POC, load skill SKILL.md files as system prompt context. Hooks are informational only (list names, don't execute). Full integration is beyond POC scope.

## Sources

### Primary (HIGH confidence)
- `node_modules/@mariozechner/pi-ai/dist/models.js` -- getModels() implementation, returns Model[] from MODELS registry
- `node_modules/@mariozechner/pi-ai/dist/models.d.ts` -- getModels(), getModel(), getProviders() signatures
- `node_modules/@mariozechner/pi-ai/dist/types.d.ts` -- Model interface (id, name, provider, reasoning, contextWindow, etc.), KnownProvider type
- `node_modules/@mariozechner/pi-ai/dist/models.generated.js` -- Full model registry: "anthropic" (20+ Claude models), "openai" (GPT + codex-mini), "openai-codex" (OAuth-only GPT-5.x)
- `node_modules/@mariozechner/pi-ai/dist/env-api-keys.js` -- API key environment variable mapping: "openai" uses OPENAI_API_KEY, "openai-codex" NOT in envMap (OAuth only)
- `node_modules/@mariozechner/pi-agent-core/dist/agent.d.ts` -- Agent class: setSystemPrompt(), setModel(), constructor(AgentOptions)
- `node_modules/@mariozechner/pi-agent-core/dist/types.d.ts` -- AgentState with systemPrompt, model, tools
- `src/server/agent/setup.ts` -- createAgent() already accepts provider, modelId, apiKey
- `src/server/lib/credentials.ts` -- storeCredentials(), getCredentials(), hasCredentials() per provider
- `src/client/lib/types.ts` -- AppState.agent and AppState.harness stubs already defined
- `.harn/docs/ARCHITECTURE.md` -- Module structure, API surface, state management plan

### Secondary (MEDIUM confidence)
- `.harn/docs/adr/0006-agent-recreation-on-switch.md` -- ADR for agent recreation; D-05 simplifies this (no history)
- `.harn/docs/adr/0005-api-key-first-oauth-stretch.md` -- API key is primary auth method

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed, APIs verified in source code
- Architecture: HIGH - Existing patterns (hooks, routes, components) clearly established; new code follows same structure
- Pitfalls: HIGH - Provider type mismatch verified directly in source; popover behavior known from Radix docs
- Provider mapping: HIGH - Verified directly in pi-ai/dist/models.generated.js and env-api-keys.js

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- pi-ai model registry may add models but API is stable)
