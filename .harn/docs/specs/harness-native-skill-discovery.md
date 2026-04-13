# Harness Native Skill Discovery

**Status:** Spec ready for implementation
**Scope:** Claude Code (primary); Codex & Gemini designs frozen for later phases
**Relates to:** `harness-management-enhanced-chat.md` (replaces skill/command discovery section)
**Author date:** 2026-04-12

---

## 1. Problem

Today's implementation in `src/server/agent/harness.ts` and `src/server/routes/harness.ts` reads skill and command listings from a single canonical path (`.agents/skills`, `.agents/commands`) on the active project directory. This creates four concrete defects:

1. **Divergence risk.** The canonical model assumes a symlink/copy chain `.claude/skills → .agents/skills`. If that chain breaks for any reason (user ran a cleanup, symlink deleted, sync script failed), the chat UI keeps showing skills that Claude Code itself no longer sees. The chat and the harness diverge silently.
2. **Missing scopes.** Per Claude Code's official docs, skills and commands come from **three scopes** (personal, project, plugin) plus an enterprise tier. We only read one path from one scope. The user sees ~10% of what's actually available.
3. **No harness awareness.** Discovery is hardcoded for `.claude/` + `.agents/`. When the chat switches to Gemini CLI or Codex CLI, it reads the wrong paths. Each new harness multiplies the divergence.
4. **ACP early-return masks filesystem truth.** In `chat-input.tsx:113`, if the ACP runtime sends `available_commands_update` with its ~7 bundled commands, the filesystem fallback is skipped entirely. The user sees only the ACP list, not their installed skills.

**Principle this spec enforces:** *The chat must read the same sources of truth the underlying harness actually reads.* When the user is chatting with Claude Code, we read exactly what Claude Code reads — nothing more, nothing less.

---

## 2. Scope of this phase

| In-scope | Out-of-scope |
|---|---|
| Claude Code discovery (personal + project + plugin) | Codex CLI implementation (design frozen, implementation deferred) |
| Plugin enablement evaluation via `enabledPlugins` | Gemini CLI implementation (design frozen, implementation deferred) |
| Skill + command merge with official precedence | Enterprise-scope skills (UNVERIFIED path — deferred) |
| API endpoint changes (agent query param) | Bundled skill detection (UNVERIFIED path — hardcoded registry) |
| Frontend contract update (autocomplete source) | Multi-runtime chat at the same time (one harness per session) |
| Deterministic TOML parser spec for `~/.codex/config.toml` | Codex plugin discovery (use plugins path from Codex when shipped) |
| Writing CRUD stays confined to `.agents/` (project scope) | UI for user-scope writes or plugin installation |
| File watcher coverage of all read paths | Live settings.json change invalidation (manual reload OK) |

---

## 3. Glossary

- **Harness.** A coding agent CLI: `claude`, `codex`, `gemini`, or PI's internal runtime.
- **Scope.** Where a skill/command lives: `personal` (user home), `project` (repo), `plugin` (third-party bundle).
- **Canonical model.** The `.agents/` directory convention PI uses for editing. CRUD writes go here and are optionally symlinked/copied into each harness's native path.
- **Native paths.** The directories a given harness actually reads at runtime. For Claude Code: `~/.claude/skills/`, `<proj>/.claude/skills/`, `<installPath>/skills/`.
- **Invocable item.** A skill or command that appears in the `/` autocomplete. Corresponds to `user-invocable !== false`.
- **Bundled skills.** Prompt-based skills shipped inside Claude Code itself. Known list: `/simplify`, `/batch`, `/debug`, `/loop`, `/claude-api`. Their on-disk location is unverified, so we treat them as a hardcoded registry.

---

## 4. Data model

### 4.1 `DiscoveredItem`

Canonical shape returned by all discovery functions. Stable across harnesses so the frontend has one contract.

```ts
export type DiscoveredItemType = "skill" | "command" | "subagent"
export type DiscoveredScope = "bundled" | "personal" | "project" | "plugin" | "enterprise"

export interface DiscoveredItem {
  /** Invocation name WITHOUT leading slash. Plugin items use `plugin-name:skill-name`. */
  name: string
  /** One-line description (frontmatter `description` or first markdown paragraph). Max 250 chars. */
  description: string | null
  /** Autocomplete hint (frontmatter `argument-hint`). */
  argumentHint: string | null
  /** Item kind. Skills and commands are both invocable via `/`; subagents are NOT. */
  type: DiscoveredItemType
  /** Where the item was found. */
  scope: DiscoveredScope
  /** Harness that owns this item in this session. */
  harness: "claude" | "codex" | "gemini"
  /** Absolute path to the item (SKILL.md, <cmd>.md, or <agent>.md). */
  path: string
  /** Human-readable origin label. E.g. "~/.claude/skills", "octo@nyldn-plugins", ".claude/commands". */
  origin: string
  /** Parsed invocability. If false, the item must NOT appear in the `/` autocomplete. */
  userInvocable: boolean
  /** For plugin items: plugin name (without marketplace suffix) used as namespace. */
  pluginName?: string
  /** For plugin items: "name@marketplace" key used to resolve enablement. */
  pluginKey?: string
  /** Timestamp of the underlying file's mtime (for cache invalidation). */
  mtimeMs: number
}
```

### 4.2 `DiscoveryResult`

What the API returns for a single request. Includes diagnostic metadata.

```ts
export interface DiscoveryResult {
  items: DiscoveredItem[]
  shadowed: ShadowedItem[]          // items hidden by precedence — kept for debug panel
  errors: DiscoveryError[]
  sources: DiscoverySource[]        // which paths were read; empty paths reported as { count: 0 }
  generatedAt: number               // Date.now()
}

export interface ShadowedItem {
  /** Item that was hidden. */
  item: DiscoveredItem
  /** Item that won precedence. */
  winner: DiscoveredItem
  /** Reason: "lower-scope", "skill-over-command", "duplicate-plugin-install". */
  reason: string
}

export interface DiscoveryError {
  path: string
  message: string
}

export interface DiscoverySource {
  path: string
  scope: DiscoveredScope
  exists: boolean
  itemsFound: number
}
```

---

## 5. Claude Code discovery algorithm

### 5.1 Paths scanned

| Scope | Skills | Commands | Subagents |
|---|---|---|---|
| Personal | `~/.claude/skills/*/SKILL.md` | `~/.claude/commands/**/*.md` | `~/.claude/agents/*.md` |
| Project | `<proj>/.claude/skills/*/SKILL.md` | `<proj>/.claude/commands/**/*.md` | `<proj>/.claude/agents/*.md` |
| Plugin | `<installPath>/skills/*/SKILL.md` | `<installPath>/commands/**/*.md` | `<installPath>/agents/*.md` |
| Enterprise | UNVERIFIED — see §11 | UNVERIFIED | UNVERIFIED |

Notes:
- `~/.claude/` is canonical. XDG `~/.config/claude/` is NOT documented — do not try it.
- Commands walk `**/*.md` to handle observed subdirectory namespacing (`commands/serena/setup.md` → `serena:setup`). Marked UNVERIFIED in §11 but implemented because live evidence supports it. A settings flag gates this behavior.
- Subagents appear in a separate autocomplete stream (`@` mentions), but go through the same discovery pipeline.

### 5.2 Plugin resolution — strict enablement

A plugin item is included **only if both** hold:

1. An entry exists in `~/.claude/plugins/installed_plugins.json` under `plugins["<name>@<marketplace>"]`, with an `installPath` whose `skills/` or `commands/` subdirectory exists AND the plugin's scope matches the active directory:
   - `scope === "user"` → always eligible
   - `scope === "local"` or `"project"` → eligible **only if** `projectPath === <activeDirectory>`
2. At least one of the following settings files sets `enabledPlugins["<name>@<marketplace>"] === true`, checked in order and taking the **first hit**:
   - `~/.claude/settings.json`
   - `<proj>/.claude/settings.json`
   - `<proj>/.claude/settings.local.json`
   - Managed settings (see §2 enterprise; if not readable, treated as "no opinion")

If the plugin appears in `installed_plugins.json` but no settings file sets `true`, it is **disabled**. We do NOT default to enabled on missing key.

A plugin item's `name` field is built as `<plugin-name>:<skill-or-command-name>`. Marketplace suffix is stripped.

### 5.3 Parsing files

Skill file parser (`SKILL.md`):
- Read UTF-8, max 256 KB (hard cap, larger files rejected with error).
- YAML frontmatter between the first two `---` lines (gray-matter style). Missing frontmatter is not an error.
- Fields of interest: `name`, `description`, `argument-hint`, `user-invocable`, `disable-model-invocation`. All optional.
- If `description` absent, use the first non-empty paragraph after frontmatter, collapsed to a single line, truncated to 250 chars.
- If `name` absent, use the parent directory name (for skills) or file stem (for commands).
- `user-invocable` defaults to `true`.
- `disable-model-invocation` is parsed but doesn't affect autocomplete (it only controls auto-load).

Command file parser (`<name>.md` in `.claude/commands/`):
- Same frontmatter rules as skills — docs explicitly say command files support the skill frontmatter.
- **Name source of truth is the frontmatter `name:` field.** Subdirectory structure is walked for discovery but does NOT determine the invocation name. A file at `.claude/commands/foo/bar.md` with `name: foo-bar` appears as `/foo-bar`, not `/foo:bar` or `/foo/bar`. This matches Claude Code's actual behavior.
- Fallback when `name:` is absent from frontmatter: use the file stem (`bar` for `foo/bar.md`). Parent directories are NOT prepended. Collisions from two files with the same stem in different subdirectories are resolved by the merge step and surfaced in `shadowed`.
- Files starting with `.` or ending in `.local.md` are skipped.
- Discovery walks `.claude/commands/**/*.md` but the walk is purely for finding files — it has no namespacing side effects.

Subagent file parser (`<name>.md` in `.claude/agents/`):
- Same frontmatter rules. Emitted with `type: "subagent"` and `userInvocable: false` (they never appear in `/`).

### 5.4 Precedence and merging

Run all three scopes' discoveries, flatten into a candidate list, then resolve conflicts in this order:

**Step 1 — Skill vs command at same scope.**
If `{scope, name}` matches between a skill and a command, the skill wins. The command is moved to `shadowed` with reason `"skill-over-command"`.

**Step 2 — Scope precedence across non-plugin items.**
Walk the candidates in order `personal → project`. For each `{name}` collision, the **higher-priority wins**. Official order: `enterprise > personal > project`. The loser goes to `shadowed` with reason `"lower-scope"`.

**Step 3 — Plugin items never conflict.**
Plugin items keep their full `plugin-name:skill-name` key and are never shadowed by non-plugin items with similar names. Two plugin installs with the same `plugin-name` (rare — version conflict) shadow the older install.

**Step 4 — Bundled skills.**
Hardcoded registry is appended to the end of the items list with `scope: "bundled"`, AFTER user/project items. Bundled skills never shadow user/project items — if the user created a `/simplify` skill in `~/.claude/skills/simplify/`, theirs wins. The bundled entry is shadowed with reason `"user-override-bundled"`.

Final output order (for UI): `personal → project → plugin → bundled`. Within each group, alphabetical.

### 5.5 Bundled skill registry

Hardcoded list (UNVERIFIED on-disk location, so we ship our own metadata):

```ts
export const CLAUDE_BUNDLED_SKILLS: Array<Omit<DiscoveredItem, "mtimeMs" | "path">> = [
  { name: "simplify",  description: "Review changed code for reuse, quality, and efficiency, then fix issues",
    argumentHint: "[focus]", type: "skill", scope: "bundled", harness: "claude", origin: "Claude Code",
    userInvocable: true },
  { name: "batch",     description: "Research and plan a large-scale codebase change, then execute in parallel",
    argumentHint: "<instruction>", type: "skill", scope: "bundled", harness: "claude", origin: "Claude Code",
    userInvocable: true },
  { name: "debug",     description: "Enable debug logging for this session and analyze the session log",
    argumentHint: "[description]", type: "skill", scope: "bundled", harness: "claude", origin: "Claude Code",
    userInvocable: true },
  { name: "loop",      description: "Run a prompt or slash command on a recurring interval",
    argumentHint: "[interval] [prompt]", type: "skill", scope: "bundled", harness: "claude", origin: "Claude Code",
    userInvocable: true },
  { name: "claude-api", description: "Build, debug, and optimize Claude API / Anthropic SDK apps",
    argumentHint: null, type: "skill", scope: "bundled", harness: "claude", origin: "Claude Code",
    userInvocable: true },
]
```

---

## 6. Module layout

```
src/server/agent/
├── harness.ts                    # kept — still owns AGENTS.md/CLAUDE.md reading
├── discovery/
│   ├── types.ts                  # DiscoveredItem, DiscoveryResult, DiscoveredScope
│   ├── claude.ts                 # discoverClaudeItems(activeDirectory, options)
│   ├── claude-plugins.ts         # resolveEnabledClaudePlugins(activeDirectory)
│   ├── claude-bundled.ts         # CLAUDE_BUNDLED_SKILLS registry
│   ├── codex.ts                  # DESIGN ONLY — function signature + stub
│   ├── codex-config-parser.ts    # DESIGN ONLY — see §9
│   ├── gemini.ts                 # DESIGN ONLY — function signature + stub
│   ├── parse-skill-file.ts       # Shared frontmatter parser (skill.md, commands *.md, agents *.md)
│   ├── merge-and-shadow.ts       # Precedence resolution (§5.4)
│   └── index.ts                  # dispatchDiscovery(harness, activeDirectory, options)
```

Keep `harness.ts` focused on CLAUDE.md/AGENTS.md/GEMINI.md parsing — it's the source for instructions, not items.

`fetchHarnessItems` in `src/client/lib/api.ts` stays but routes through the new endpoint with an `agent` param.

---

## 7. API contract

### 7.1 Endpoint: `GET /api/harness/items/:type`

**Query params:**
- `agent` (required for correct results): `claude` | `codex` | `gemini`. If omitted, defaults to `claude` with a deprecation header.
- `scope` (optional): `personal` | `project` | `plugin` | `bundled` | `all`. Default `all`.
- `includeShadowed` (optional): `true` | `false`. Default `false`. When true, response includes the `shadowed` array.

**Types:**
- `skills`, `commands`, `subagents` — return `DiscoveredItem[]`
- `rules`, `hooks` — unchanged from current (project-only, read from `.agents/`)
- `agents-md`, `claude-md` — unchanged

**Response body:**
```json
{
  "items": [/* DiscoveredItem[] */],
  "shadowed": [/* only if includeShadowed=true */],
  "errors": [/* DiscoveryError[] */],
  "sources": [/* DiscoverySource[] */],
  "generatedAt": 1734025200000
}
```

**Cache headers:** `Cache-Control: no-store`. The response is cheap to compute (<50ms for typical projects) and the file watcher invalidates client state already.

**Auth/safety:**
- `activeDirectory` must be set (same guard as today). 401-equivalent error if not.
- Plugin paths are validated to live inside `~/.claude/plugins/cache/**` before reading. Symlink escapes are rejected.
- File size cap: 256 KB per markdown file. Over-cap files land in `errors`, not `items`.

### 7.2 Endpoint: `GET /api/harness/sources`

New diagnostic endpoint returning the `sources` array without reading files. Cheap existence check for the settings "Discovery" panel in the UI so the user can see *which directories were scanned* for the current harness.

### 7.3 Endpoint: `POST /api/harness/reload`

Invalidates any in-memory cache and replays discovery. Needed because settings.json changes (manual edit) aren't watched in this phase.

### 7.4 Endpoint: `GET /api/harness/plugin-status`

Returns the resolved plugin table for the active harness + directory:

```json
{
  "plugins": [
    { "key": "octo@nyldn-plugins", "name": "octo", "scope": "user",
      "installed": true, "enabled": true, "enabledBy": "~/.claude/settings.json",
      "skillCount": 38, "commandCount": 0 }
  ]
}
```

This powers a "Plugins" sub-tab in the settings page.

### 7.5 Writing (CRUD)

Writing endpoints (`POST/PUT/DELETE /api/harness/items/:type/:name`) **do not change**. They continue to write to `<activeDirectory>/.agents/<type>/...`. The canonical model remains the **write** target, and sync links (already in harness routes) keep `.claude/`, `.codex/`, `.gemini/` pointed at `.agents/` when the user asks for them.

This keeps the UI simple: the user only ever edits project-scoped items, and symlinks propagate them to whichever harness they run. **Reading** uses native paths; **writing** uses `.agents/`. The two sides are intentionally asymmetric and that's the right model.

---

## 8. Frontend contract changes

### 8.1 `chat-input.tsx`

The early-return against `availableCommands` at line 113 is **removed**. New flow:

```ts
useEffect(() => {
  let cancelled = false
  async function load() {
    const agent = getActiveHarnessId(runtime)   // "claude" | "codex" | "gemini"
    if (!agent) { setSlashItems([]); return }

    const [skillsResult, commandsResult] = await Promise.all([
      fetchHarnessItems("skills", { agent }),
      fetchHarnessItems("commands", { agent }),
    ])
    if (cancelled) return

    const items = mergeSkillsAndCommands(skillsResult.items, commandsResult.items)
    setSlashItems(items.filter(i => i.userInvocable))
  }
  load()
  return () => { cancelled = true }
}, [runtime.runtime, runtime.acpAgent, harnessRevision])
```

`availableCommands` from the ACP event is **still consumed**, but only as a "bundled-hint" signal: it doesn't replace filesystem discovery, and it doesn't populate the autocomplete on its own. If there's overlap between ACP's list and our filesystem list, we prefer our filesystem version (which has scope/origin/namespace info the ACP event doesn't).

### 8.2 Harness context

`HarnessContext` gains a `harnessRevision` counter that increments whenever the file watcher fires any event matching a discovery path. This triggers autocomplete re-fetches without full reloads.

### 8.3 Autocomplete menu grouping

`AutocompleteMenu` receives items already sorted by `(scope, name)`. It renders group headers when scope changes (`Personal`, `Project`, `Plugin: octo`, `Bundled`). Descriptions truncate at 80 chars in the menu; full description shows on hover.

---

## 9. Codex CLI `config.toml` parser (deterministic spec)

### 9.1 Purpose and limits

**Important correction from research:** Codex's `[[skills.config]]` block in `~/.codex/config.toml` is **for disabling discovered skills, not for registering external paths**. External skill distribution goes through Codex plugins, not config.toml. This parser's job is:

1. Read every `[[skills.config]]` entry.
2. For each entry, look up the skill that Codex itself would have discovered at that `path`.
3. Apply the `enabled` field as an override.

The parser is the authoritative source for Codex disable state and MUST NOT be replaced with ad-hoc regex matching.

### 9.2 TOML shape

```toml
[[skills.config]]
path = "/absolute/path/to/skill/SKILL.md"
enabled = false

[[skills.config]]
path = "/another/path/SKILL.md"
# enabled omitted → implicit true
```

### 9.3 Parser interface

```ts
export interface CodexConfigParseResult {
  /** Absolute path of the config.toml file, for error messages. */
  configPath: string
  /** Parsed overrides, ordered as they appear in the file. */
  overrides: CodexSkillOverride[]
  /** Hard parse errors (invalid TOML). Populated = overrides is empty. */
  fatalError: string | null
  /** Per-entry warnings (missing path, relative path, unreadable file). */
  warnings: CodexConfigWarning[]
}

export interface CodexSkillOverride {
  /** Absolute, normalized path to SKILL.md. */
  path: string
  /** Explicit enable state. Defaults to true when `enabled` key omitted. */
  enabled: boolean
  /** 1-indexed line number in config.toml for debug surfaces. */
  sourceLine: number
}

export interface CodexConfigWarning {
  sourceLine: number
  message: string
}

export function parseCodexConfig(configPath: string): Promise<CodexConfigParseResult>
```

### 9.4 Parsing rules (deterministic)

The parser is a thin wrapper over `@iarna/toml` (already determined to be pinned for the monorepo). Steps, in order:

1. **File read.** If `configPath` doesn't exist, return `{ configPath, overrides: [], fatalError: null, warnings: [] }`. Missing file is NOT an error — it's the common case.
2. **Size cap.** Reject files >1 MB with `fatalError: "Config file too large"`.
3. **TOML parse.** On parse failure, return `{ overrides: [], fatalError: err.message, warnings: [] }`. Do not attempt recovery.
4. **Extract `skills.config`.** If missing, empty, or not an array, return `{ overrides: [] }` with no warnings.
5. **Per-entry validation.** For each entry (in file order):
   - If `path` is missing or not a string → warning `"Entry N: missing path"`, skip.
   - If `path` is not absolute → warning `"Entry N: path must be absolute"`, skip. (No `~` expansion. No relative-to-cwd. Absolute means absolute.)
   - Normalize with `path.normalize()` and resolve symlinks with `fs.realpath` (best effort — fallback to normalized path on failure).
   - If `enabled` is present and not a boolean → warning `"Entry N: enabled must be boolean"`, coerce to `true`.
   - If `enabled` is absent → default `true`.
   - Push `{ path, enabled, sourceLine }` where `sourceLine` comes from the TOML AST (pinned library exposes line info; if unavailable, use 0).
6. **Duplicate paths.** If two entries target the same normalized path, the **last one wins**. Emit warning `"Duplicate path; using last entry"`. This matches Codex's own last-wins convention for config.
7. **Return result.** No side effects, no caching — callers cache as needed.

### 9.5 Integration with Codex discovery (DESIGN ONLY)

```ts
async function discoverCodexItems(activeDirectory: string): Promise<DiscoveryResult> {
  const overrides = await parseCodexConfig(path.join(os.homedir(), ".codex", "config.toml"))
  const overrideMap = new Map(overrides.overrides.map(o => [o.path, o.enabled]))

  const rawItems = [
    ...await scanCodexPath(path.join(os.homedir(), ".codex/skills"), "personal"),
    ...await scanCodexPath(path.join(os.homedir(), ".codex/skills/.system"), "bundled"),
    ...await walkUpCodexProject(activeDirectory),   // .agents/skills/ walk-up
  ]

  const items = rawItems
    .filter(item => overrideMap.get(item.path) !== false)
    .map(item => ({ ...item, harness: "codex" as const }))

  return mergeAndShadow(items)
}
```

This design freezes the interface; implementation lands in a later phase.

### 9.6 Test vectors for the parser

| Input | Expected `overrides` | Expected `warnings` |
|---|---|---|
| Missing file | `[]` | `[]` |
| Empty file | `[]` | `[]` |
| `[[skills.config]]\npath = "/a/SKILL.md"\nenabled = false` | `[{path: "/a/SKILL.md", enabled: false, sourceLine: 2}]` | `[]` |
| `[[skills.config]]\npath = "/a/SKILL.md"` | `[{path: "/a/SKILL.md", enabled: true, sourceLine: 2}]` | `[]` |
| `[[skills.config]]\npath = "relative/SKILL.md"` | `[]` | `["Entry 1: path must be absolute"]` |
| `[[skills.config]]\npath = "/a"\n[[skills.config]]\npath = "/a"\nenabled = false` | `[{path: "/a", enabled: false, ...}]` | `["Duplicate path; using last entry"]` |
| Broken TOML (stray `}`) | `[]` with `fatalError` set | `[]` |

These become the first unit tests when the parser is implemented.

---

## 10. Gemini CLI discovery (DESIGN ONLY)

Function signature and path set, no implementation this phase.

```ts
async function discoverGeminiItems(activeDirectory: string): Promise<DiscoveryResult>
```

**Paths:**
- Personal: `~/.gemini/skills/*/SKILL.md` (alias `~/.agents/skills/` if present — confirm with Gemini docs before implementing)
- Project: `<proj>/.gemini/skills/*/SKILL.md`
- Extensions: `~/.gemini/extensions/*/skills/*/SKILL.md`

**Extensions enablement:** not yet researched. Presence-based for now; add enablement check when implementing.

**Namespace format:** Gemini uses a different invocation syntax; verify against `https://geminicli.com/docs/cli/skills/` at implementation time. This spec does NOT commit to a namespace shape.

---

## 11. UNVERIFIED items / deferred decisions

| Item | Current treatment | Trigger to resolve |
|---|---|---|
| Enterprise-scope SKILL.md on-disk path | Skipped entirely in §5.1 | Doc or source that defines a concrete path |
| Bundled skill on-disk location | Hardcoded registry in §5.5 | Same, or willingness to scan the Claude Code npm package |
| Command name fallback when frontmatter `name:` is absent | Use file stem, ignore parent dirs | User report of a discrepancy in observed Claude Code behavior |
| Codex external skill registration (non-default paths) | Not supported; rely on plugins | Codex doc update |
| `~/.config/claude/` XDG support | Not scanned | Doc update |
| `installed_plugins.json` formal schema | Observed-only | Anthropic publishes schema |
| Settings.json `enabledPlugins` live-watch | Not watched; `/reload` required | Phase 2 UX demand |
| Gemini enablement / alias paths | Design only | Phase 2 implementation |

Each unverified item is quoted in-code so future maintainers can grep for them.

---

## 12. File watcher implications

The existing SSE file watcher in `src/server/routes/harness.ts` watches `<activeDirectory>` only. New watch set for Claude Code chat sessions:

- `<activeDirectory>/.claude/skills/**`
- `<activeDirectory>/.claude/commands/**`
- `<activeDirectory>/.claude/agents/**`
- `<activeDirectory>/.claude/settings.json`
- `<activeDirectory>/.claude/settings.local.json`
- `<activeDirectory>/.agents/**` (still — canonical writes)
- `~/.claude/skills/**`
- `~/.claude/commands/**`
- `~/.claude/agents/**`
- `~/.claude/settings.json`
- `~/.claude/plugins/installed_plugins.json`

Plugin `installPath/skills/**` directories are **not** actively watched (too many for chokidar on busy machines). Instead:

- `installed_plugins.json` is watched — any change triggers full plugin rediscovery.
- Plugin content changes between rediscoveries are accepted as stale for up to 5 seconds; `/api/harness/reload` forces a refresh.

Watcher emits a new SSE event `discovery_invalidated` with `{ scopes: string[] }`. The frontend treats this as "bump `harnessRevision`".

Debounce: 200 ms per scope to coalesce bursty file operations (npm installs, git checkouts).

---

## 13. Implementation plan (this phase: Claude Code only)

### Tasks

1. **T1 — Types and module skeleton.** Create `src/server/agent/discovery/` with `types.ts`, `index.ts`, empty stubs for all files. No logic. Verification: `npm run build` succeeds.

2. **T2 — Shared frontmatter parser.** Implement `parse-skill-file.ts`. Handles SKILL.md, command .md, agent .md — they all share the same frontmatter contract. Unit tests cover: missing frontmatter, missing description, `user-invocable: false`, oversized files, UTF-8 BOMs. No downstream callers yet.

3. **T3 — Claude plugin resolver.** Implement `claude-plugins.ts`:
   - Read `~/.claude/plugins/installed_plugins.json`
   - Read `~/.claude/settings.json` + `<proj>/.claude/settings.json` + `<proj>/.claude/settings.local.json`
   - Merge into `Array<{ pluginKey, pluginName, installPath, enabled, enabledBy }>`
   - Filter by scope/projectPath rules from §5.2
   Unit tests: plugin in `installed_plugins.json` but not enabled → excluded; enabled at user scope → included; scope "local" matching activeDir → included; scope "local" wrong projectPath → excluded.

4. **T4 — Claude discovery core.** Implement `claude.ts`:
   - Scan personal/project skill, command, agent dirs
   - For each enabled plugin, scan `<installPath>/{skills,commands,agents}`
   - Emit `DiscoveredItem[]` pre-merge
   - Accumulate `sources` and `errors`
   Unit tests: fixture project with 1 personal skill, 1 project skill, 1 plugin skill → 3 items.

5. **T5 — Merge and shadow logic.** Implement `merge-and-shadow.ts` per §5.4. Unit tests: skill vs command same name → skill wins; personal vs project same name → personal wins; plugin never conflicts; bundled shadowed by user override.

6. **T6 — Bundled registry.** Implement `claude-bundled.ts` with the 5 hardcoded entries from §5.5.

7. **T7 — API endpoint wiring.** Update `src/server/routes/harness.ts`:
   - `GET /items/:type` honors `?agent=claude&scope=all&includeShadowed=false`
   - `GET /sources` returns source diagnostics
   - `GET /plugin-status` returns plugin table
   - `POST /reload` invalidates cache
   Backward compat: requests without `?agent` return the legacy `.agents/` listing and set a `Deprecation` header.

8. **T8 — File watcher expansion.** Add the new watch paths from §12 to the existing watcher. Emit `discovery_invalidated` SSE event.

9. **T9 — Frontend api.ts updates.** `fetchHarnessItems(type, { agent })` → new signature. Keep old signature working by defaulting `agent` to the active harness from runtime context.

10. **T10 — Frontend chat-input wiring.** Remove the ACP early-return. Consume the new discovery endpoint. Filter `userInvocable === true` for `/`. Re-fetch on `discovery_invalidated`. Group items in `AutocompleteMenu` by scope.

11. **T11 — Settings "Discovery" panel.** New sub-tab under Settings showing `/sources` + `/plugin-status` output. Read-only for now; useful for debugging.

12. **T12 — Integration test.** End-to-end: set active directory → request skills for `?agent=claude` → assert count matches `find ~/.claude/skills .claude/skills -type d -name 'SKILL.md' -parent` + enabled plugins + bundled. Run on a fixture that includes at least one of each scope.

13. **T13 — Codex parser skeleton.** Implement `codex-config-parser.ts` per §9 with full test vectors from §9.6. No Codex discovery implementation; parser is ready for future phase.

Dependencies: T2 → T4 → T5 → T7 → T10. T3 is parallel to T2 until T4. T6, T11, T12, T13 are parallel after T7.

### Out of this phase

- Codex discovery implementation (just the parser)
- Gemini discovery implementation
- Enterprise skill discovery
- Bundled skill scanning from disk
- Settings.json live-watch
- UI for user-scope or plugin-scope CRUD

---

## 14. Acceptance criteria

**AC-1** (replaces the bug the user reported): On the pi-ai-poc project with Claude Code active, typing `/` in the chat must list:
- All bundled skills (5 hardcoded entries)
- All user-scope skills under `~/.claude/skills/` whose SKILL.md has `user-invocable !== false`
- All project-scope skills under `.claude/skills/`
- All commands under `~/.claude/commands/` and `.claude/commands/`
- All plugin skills and commands from plugins enabled for this project

The observed count in the live chat must match (within 1 item, for parsing edge cases) the count the same user would see if they typed `/` directly in Claude Code on the same project.

**AC-2:** If the user deletes the symlink `.claude/skills → .agents/skills`, the chat's `/` menu for a Claude Code session NO LONGER shows the canonical `.agents/skills/` items. The chat reflects reality.

**AC-3:** A plugin installed in `installed_plugins.json` but absent from any `enabledPlugins` map is NOT listed.

**AC-4:** Skill-vs-command name collision inside one scope yields exactly one entry (the skill). The command is in `shadowed` when `includeShadowed=true`.

**AC-5:** A user-scope skill with the same name as a project-scope skill yields exactly one entry (personal). Project entry is in `shadowed`.

**AC-6:** Plugin skills appear as `pluginname:skillname`. Two plugins with the same skill short-name are both listed with distinct full names.

**AC-7:** Writing a new skill via settings UI creates the file at `<proj>/.agents/skills/<name>/SKILL.md`. It does NOT appear in Claude Code's `/` until the user triggers a sync into `.claude/skills/` (existing sync behavior, unchanged).

**AC-8:** Touching any skill/command/settings file fires `discovery_invalidated` within 300 ms and the frontend autocomplete refreshes on next open.

**AC-9:** `GET /api/harness/items/skills?agent=claude` completes in <100 ms on a project with 200 items across all scopes (measured on the dev machine).

**AC-10:** `parseCodexConfig` passes all 6 test vectors from §9.6.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| Plugin cache directories contain 1000s of files; scanning on every request is slow | Read-through cache keyed on `installed_plugins.json` mtime; bust on `discovery_invalidated` |
| User has broken YAML frontmatter in a SKILL.md | Push to `errors`, never throw. Show in Discovery panel. |
| Settings.json `enabledPlugins` has a typo for the marketplace suffix | Emit a warning in `errors` when an `installed_plugins.json` entry has no matching settings key anywhere — it's either disabled or typo'd |
| Plugin `installPath` points to a directory that was deleted | Warning, skip, continue |
| Two commands with the same `name:` (or same fallback stem) in different subdirectories | Higher-scope wins per §5.4; intra-scope collisions resolved deterministically by discovery order (first wins) and loser surfaced in `shadowed` |
| Frontend fetches discovery twice (skills + commands) on every keystroke | Coalesce: one debounced call every 150ms while menu is open |
| ACP-reported commands confuse the user because they're absent from our list | Merge ACP entries into the bundled section with origin `"ACP"` when they don't match anything we discovered. Low-priority enhancement. |

---

## 16. References

- https://code.claude.com/docs/en/skills — canonical skills doc, merges slash-commands
- https://code.claude.com/docs/en/commands — bundled skill inventory
- https://code.claude.com/docs/en/plugins — plugin authoring
- https://code.claude.com/docs/en/plugins-reference — full plugin schema, `enabledPlugins`, path overrides
- https://code.claude.com/docs/en/settings — managed-settings paths, precedence, enabledPlugins format
- https://developers.openai.com/codex/skills — Codex CLI skills, `[[skills.config]]`
- https://geminicli.com/docs/cli/skills/ — Gemini CLI skills (deferred)
- https://geminicli.com/docs/extensions/reference/ — Gemini extensions (deferred)
- `/Users/henriquelima/.claude/plugins/installed_plugins.json` — observed schema used in §5.2
- `src/server/routes/harness.ts:208` — current `.agents/`-only listing, replaced in T7
- `src/client/components/chat/chat-input.tsx:113` — ACP early-return, removed in T10
- `src/server/agent/harness.ts:27` — current `discoverHarness`, kept for CLAUDE.md/AGENTS.md only
