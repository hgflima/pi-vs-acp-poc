# Implementation Plan: Harness Native Skill Discovery

**Spec:** `.harn/docs/specs/harness-native-skill-discovery.md`
**Phase scope:** Claude Code discovery (primary) + Codex TOML parser (stub only). Gemini frozen.
**Created:** 2026-04-12
**Status:** ✅ Complete — Waves 1–10 done (T0–T13). 58/58 tests green, build + typecheck clean.

---

## Overview

Replace the single-path `.agents/` discovery in `harness.ts` with a harness-native reader that
mirrors exactly what Claude Code itself reads at runtime: personal (`~/.claude/`), project
(`<proj>/.claude/`), and plugin (`installed_plugins.json` + `enabledPlugins`) scopes, merged via
official precedence rules, plus a hardcoded bundled registry. Writes stay in `.agents/`; reads
come from native paths. Also ships a deterministic `config.toml` parser for Codex (no Codex
discovery yet) so the future phase has a tested foundation.

Fixes the four defects from spec §1: silent divergence, 90% missing items, harness-blindness,
and the `chat-input.tsx:113` ACP early-return that masks filesystem truth.

## Architecture Decisions

- **Read path ≠ write path.** Reads go to native harness paths (`.claude/**`); writes stay in
  `.agents/**`. Symlinks (user-managed) bridge the two. This asymmetry is intentional.
- **Strict plugin enablement.** Plugin items require BOTH `installed_plugins.json` presence AND
  an `enabledPlugins` hit in settings. No default-enabled, no permissive fallback.
- **Skill over command at collision.** When a skill and a command share `{scope, name}`, the
  skill wins; the command moves to `shadowed`. Matches Claude Code's own behavior.
- **Precedence order:** `enterprise > personal > project`, with plugins in their own namespace.
  Bundled skills appear last and are shadowed by any user-created skill of the same name.
- **Hardcoded bundled registry.** Bundled skill on-disk locations are UNVERIFIED, so we ship
  metadata inline (`claude-bundled.ts`). Grep for `UNVERIFIED` to resolve later.
- **Chokidar for watching.** Existing `node:fs.watch()` in `harness.ts:449` is macOS-only and
  about to be extended heavily. T0 installs `chokidar` and T8 migrates both the existing
  watcher and the new paths to it. One watcher abstraction, cross-platform.
- **`gray-matter` for frontmatter.** Battle-tested, handles edge cases (multiline, escaping,
  TOML front matter). No point hand-rolling a parser when `gray-matter` is ~1 KB of deps.
- **`@iarna/toml` for Codex.** Add as dep-dev; TOML parsing correctness is load-bearing for AC-10.
- **Vitest for unit tests.** No test framework today; add Vitest as dep-dev in T0. Tests are
  non-optional for T2/T3/T5/T13 because their correctness is user-visible via shadowing and
  parser overrides.
- **Internal `claudeHomeDir` parameter for testability.** `discoverClaudeItems` accepts an
  optional `claudeHomeDir?: string` that defaults to `path.join(os.homedir(), ".claude")`.
  Production callers never pass it; tests inject a fixture path. Mirrors how `activeDirectory`
  is already threaded through the codebase.

## Surfaced Assumptions (approved 2026-04-12)

1. **Test framework = Vitest.** Added as dep-dev in T0. [approved]
2. **Dependency additions.** `vitest` + `@iarna/toml` (dev), `gray-matter` + `chokidar`
   (runtime). Four new packages total. [approved]
3. **Plan save location.** `.harn/docs/plans/` per prior feedback. [approved]
4. **Backward compat is a soft deprecation, not a break.** T7 keeps the old `.agents/`-only
   response when `?agent` is missing, behind a `Deprecation` header. Frontend still works
   during the T9/T10 rollout. [approved]
5. **No migration script for `.agents/` consumers.** Existing CRUD continues unchanged. Only
   the read side moves to native paths. [approved]
6. **Fixture project for T12** lives at `test/fixtures/claude-discovery/` with minimal
   `~/.claude`-shaped subdirs (injected via the `claudeHomeDir` parameter, not `$HOME` env). [approved]
7. **Plugin cache symlink-escape guard** (spec §7.1 "Auth/safety") is a real requirement: the
   check uses `fs.realpath` + prefix match against `<claudeHomeDir>/plugins/cache/`. [approved]
8. **Testability via explicit parameter, not env mutation.** `discoverClaudeItems` and
   `resolveEnabledClaudePlugins` accept an optional `claudeHomeDir?: string` parameter.
   Production defaults to `os.homedir() + ".claude"`. Tests inject a fixture path. Same
   pattern as `activeDirectory` already in the codebase. [approved]

---

## Task List

### Phase 1 — Test harness + module skeleton

> **Goal:** Get testing infrastructure in place and create the empty module tree so parallel
> work can start. Nothing user-visible yet.

#### T0 — Install toolchain (Vitest + @iarna/toml + gray-matter + chokidar)

**Description:** Install the four new dependencies the phase needs, wire up `npm test`, add
`vitest.config.ts` with path alias resolution (`@/` → `src/`). No tests written yet — just
the plumbing.

Packages:
- **`vitest`** (dev) — unit test runner for T2, T3, T5, T13, T12
- **`@iarna/toml`** (dev) — Codex config parser in T13; dev-only because codex discovery
  runtime lands in a future phase
- **`gray-matter`** (runtime) — frontmatter parser used by T2; runtime dep because the
  backend loads it at discovery time
- **`chokidar`** (runtime) — cross-platform file watcher used by T8; T8 also migrates the
  existing `node:fs.watch()` watcher in `harness.ts:449` to chokidar

**Acceptance criteria:**
- [x] `npm test` runs Vitest (reports "No test files found" or equivalent empty-run exit)
- [x] `package.json` has `test`, `test:watch`, `test:ui` scripts
- [x] `vitest.config.ts` resolves `@/` to `src/`
- [x] `@iarna/toml` in `devDependencies`
- [x] `gray-matter` in `dependencies`
- [x] `chokidar` in `dependencies`
- [x] Existing `node:fs.watch()` import in `harness.ts` still compiles (no migration yet — T8)

**Verification:**
- [x] `npm run build` succeeds
- [x] `npm run typecheck` passes
- [x] `npm test -- --run` exits cleanly
- [x] `npm run dev:backend` still starts without errors

**Dependencies:** None
**Files touched:** `package.json`, `package-lock.json`, `vitest.config.ts` (new)
**Scope:** XS

---

#### T1 — Types and module skeleton

**Description:** Create `src/server/agent/discovery/` per spec §6 with empty stubs that compile.
Export type interfaces from `types.ts` (`DiscoveredItem`, `DiscoveryResult`, `ShadowedItem`,
`DiscoveryError`, `DiscoverySource`, `DiscoveredItemType`, `DiscoveredScope`). All other files
are exports-only stubs. No logic.

**Acceptance criteria:**
- [x] `src/server/agent/discovery/{types,index,parse-skill-file,claude,claude-plugins,claude-bundled,merge-and-shadow,codex,codex-config-parser,gemini}.ts` exist
- [x] `types.ts` matches spec §4.1 / §4.2 exactly (field names, optionality)
- [x] `index.ts` exports `dispatchDiscovery(harness, activeDirectory, options)` signature with a
      `throw new Error("not implemented")` body
- [x] Nothing in `harness.ts` or `harness` routes imports from `discovery/` yet

**Verification:**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds

**Dependencies:** T0
**Files touched:** 10 new files under `src/server/agent/discovery/`
**Scope:** S

---

### Checkpoint: Foundation
- [x] `npm test`, `npm run typecheck`, `npm run build` all green
- [x] Empty discovery module compiles and nothing else has changed

---

### Phase 2 — Parsers and resolvers (parallelizable)

> **Goal:** Ship the three pure, testable building blocks: frontmatter parser, plugin
> resolver, merge logic. Each has unit tests and zero coupling to the rest.

#### T2 — Shared frontmatter parser

**Description:** Implement `parse-skill-file.ts` — reads a markdown file up to 256 KB, delegates
YAML frontmatter extraction to `gray-matter`, returns `{ name, description, argumentHint,
userInvocable, path, mtimeMs }`. Handles SKILL.md, command `.md`, and agent `.md` — all three
share the same contract. Missing frontmatter: use file stem as name and first paragraph as
description (truncated to 250 chars, collapsed to one line). Oversized files return an error
sentinel instead of throwing.

`gray-matter` handles multiline values, escaped quotes, and BOM stripping natively.

**Acceptance criteria:**
- [x] Parses a file with full frontmatter into the expected shape (delegated to `gray-matter`)
- [x] Parses a file with NO frontmatter using fallbacks (stem + first paragraph)
- [x] `user-invocable: false` propagates as `userInvocable: false`
- [x] Files >256 KB return an error result, not a throw
- [x] UTF-8 BOM handled (gray-matter built-in)
- [x] `description` truncated at 250 chars with no trailing whitespace
- [x] `argument-hint` → `argumentHint` field mapping
- [x] Malformed YAML → error result with the gray-matter error message, not a throw

**Verification:**
- [x] Unit tests in `src/server/agent/discovery/__tests__/parse-skill-file.test.ts` cover: full
      frontmatter, missing frontmatter, `user-invocable: false`, oversized file, UTF-8 BOM,
      malformed YAML (graceful fallback), missing description, multiline `description` value
- [x] `npm test -- parse-skill-file` green
- [x] `npm run typecheck` passes

**Dependencies:** T1
**Files touched:** `parse-skill-file.ts`, `__tests__/parse-skill-file.test.ts`
**Scope:** M

---

#### T3 — Claude plugin resolver

**Description:** Implement `claude-plugins.ts`. Reads `~/.claude/plugins/installed_plugins.json`
(tolerating missing file), reads `enabledPlugins` from `~/.claude/settings.json`,
`<proj>/.claude/settings.json`, `<proj>/.claude/settings.local.json` in order, takes first hit
per plugin key. Applies the strict eligibility rules from spec §5.2: plugin scope must match
active directory (user → always, local/project → only if `projectPath === activeDirectory`).
Returns `Array<{ pluginKey, pluginName, installPath, enabled, enabledBy, scope }>`.

Symlink-escape guard: `installPath` must `realpath` to a subdirectory of
`~/.claude/plugins/cache/`. Failing entries emit a warning and are dropped.

**Acceptance criteria:**
- [x] Missing `installed_plugins.json` → returns `[]` with no error
- [x] Plugin in `installed_plugins.json` but absent from all `enabledPlugins` → `enabled: false`
- [x] Plugin in `installed_plugins.json` with `enabledPlugins[key] === true` in user settings
      → `enabled: true`, `enabledBy: "~/.claude/settings.json"`
- [x] Project settings override user settings (first hit in order: project.local → project → user)
- [x] Scope `"local"` with non-matching `projectPath` → excluded
- [x] Scope `"user"` → always eligible
- [x] `installPath` outside `~/.claude/plugins/cache/` → warning + dropped

**Verification:**
- [x] Unit tests with fixture `installed_plugins.json` + fake settings files via tmpdir
- [x] `npm test -- claude-plugins` green

**Dependencies:** T1 (parallel with T2)
**Files touched:** `claude-plugins.ts`, `__tests__/claude-plugins.test.ts`
**Scope:** M

---

#### T5 — Merge and shadow logic

**Description:** Implement `merge-and-shadow.ts` per spec §5.4. Pure function:
`mergeAndShadow(items: DiscoveredItem[]): { items, shadowed }`. Four-step pipeline:
(1) skill-over-command within same scope, (2) personal-over-project for non-plugin items,
(3) plugin items never conflict across plugins but same-plugin-name duplicates shadow,
(4) bundled appended after user/project and shadowed by user overrides. Final sort:
personal → project → plugin → bundled, alphabetical within.

Does NOT touch the filesystem. Operates on the candidate list produced by T4.

**Acceptance criteria:**
- [x] Skill + command with same `{scope, name}` → skill wins, command in `shadowed` with
      `reason: "skill-over-command"`
- [x] Personal + project with same name → personal wins, project in `shadowed` with
      `reason: "lower-scope"`
- [x] Plugin item with same short name as personal item → both present (plugin has full
      `plugin:name` key, never collides)
- [x] Two plugins with `pluginName: "foo"` (rare version conflict) → older shadowed with
      `reason: "duplicate-plugin-install"`
- [x] Bundled skill shadowed by user skill with same name → `reason: "user-override-bundled"`
- [x] Output ordered `personal → project → plugin → bundled`, alphabetical within group

**Verification:**
- [x] Unit tests for every shadow reason + the happy path with no collisions (9 tests)
- [x] `npm test -- merge-and-shadow` green

**Dependencies:** T1 (parallel with T2, T3)
**Files touched:** `merge-and-shadow.ts`, `__tests__/merge-and-shadow.test.ts`
**Scope:** M
**Commit:** `ec616ba7`

---

#### T6 — Bundled skill registry

**Description:** Implement `claude-bundled.ts` with the 5 hardcoded entries from spec §5.5
(`simplify`, `batch`, `debug`, `loop`, `claude-api`). Export as a const with type
`ReadonlyArray<Omit<DiscoveredItem, "mtimeMs" | "path">>`. Add a comment tagged `UNVERIFIED:
bundled on-disk location` so it's greppable.

**Acceptance criteria:**
- [x] 5 entries, each with `scope: "bundled"`, `harness: "claude"`, `origin: "Claude Code"`
- [x] Each entry has a description matching spec §5.5 verbatim
- [x] `UNVERIFIED` comment present
- [x] Type-checks against `DiscoveredItem` minus `mtimeMs`/`path`

**Verification:**
- [x] `npm run typecheck` passes
- [x] Snapshot or equality test asserts the 5 expected names

**Dependencies:** T1 (parallel with T2, T3, T5)
**Files touched:** `claude-bundled.ts`, `__tests__/claude-bundled.test.ts`
**Scope:** XS

---

#### T13 — Codex `config.toml` parser (skeleton for future phase)

**Description:** Implement `codex-config-parser.ts` per spec §9.3–§9.4. Pure function
`parseCodexConfig(configPath)` returning `CodexConfigParseResult`. No Codex discovery logic —
just the parser. All 6 test vectors from §9.6 must pass. No downstream call site yet; the
parser is exported from `discovery/index.ts` for the future Codex phase.

**Acceptance criteria:**
- [x] Missing file → `{ overrides: [], fatalError: null, warnings: [] }` (not an error)
- [x] Empty file → `{ overrides: [] }` with no warnings
- [x] Happy path with `enabled: false` → one override with `enabled: false`
- [x] Happy path with `enabled` omitted → override with `enabled: true`
- [x] Relative path → skipped with warning `"Entry N: path must be absolute"`
- [x] Duplicate paths → last wins, warning emitted
- [x] Broken TOML → `fatalError` set, `overrides: []`
- [x] Files >1 MB → `fatalError: "Config file too large"`
- [x] `sourceLine` populated from TOML AST (or `0` if unavailable)

**Verification:**
- [x] All 6 test vectors from spec §9.6 as explicit Vitest cases
- [x] `npm test -- codex-config-parser` green

**Dependencies:** T0 (`@iarna/toml` installed), T1
**Files touched:** `codex-config-parser.ts`, `__tests__/codex-config-parser.test.ts`
**Scope:** M

---

### Checkpoint: Parsers
- [x] All T2, T3, T5, T6, T13 tests green (51/51 across full discovery suite)
- [x] `npm run typecheck` passes
- [x] No references to `discovery/` from outside the directory yet
- [x] Review: test fixtures use real tmpdirs (claude-plugins, claude, parse-skill-file) — no over-mocking

---

### Phase 3 — Claude discovery core

> **Goal:** Compose the Phase 2 primitives into a working `discoverClaudeItems` and verify it
> against a fixture project.

#### T4 — Claude discovery core

**Description:** Implement `claude.ts` with `discoverClaudeItems(activeDirectory: string,
options?: { claudeHomeDir?: string }): Promise<DiscoveryResult>`. The optional
`claudeHomeDir` defaults to `path.join(os.homedir(), ".claude")` and exists solely so tests
can inject a fixture path without mutating `$HOME`. Scans the 9 native paths from spec §5.1
(3 types × 3 scopes), skipping enterprise (UNVERIFIED). For each enabled plugin from T3,
scans `<installPath>/{skills,commands,agents}`. Uses T2's parser for each file. Accumulates
`sources` (with per-path item counts), `errors` (oversized/malformed files), and a raw
candidate list. Passes the candidates + bundled registry to T5 and returns the merged result.

`claude-plugins.ts` (T3) also gets the same `claudeHomeDir` injection so the plugin resolver
is testable in isolation. Both default to production home, both accept the override.

Walks `commands/**/*.md` recursively (spec §5.3) but the filename determines `name:`
fallback — subdirectories are NOT prepended. Files starting with `.` or ending in `.local.md`
are skipped.

**Acceptance criteria:**
- [x] Fixture project with 1 personal skill + 1 project skill + 1 enabled plugin skill → 3
      items (+ 5 bundled = 8 total)
- [x] Empty `activeDirectory` (no `.claude/`) → returns only personal + bundled items
- [x] Oversized file lands in `errors`, not `items`
- [x] `sources` array reports exactly the paths scanned, with `exists` + `itemsFound`
- [x] Personal skill + project skill with same name → one item returned (personal), one
      shadowed (verifies T5 is actually wired in)
- [x] Plugin skill `name` = `pluginName:skillName`
- [x] Subagents have `type: "subagent"`, `userInvocable: false`

**Verification:**
- [x] Unit test with tmpdir fixtures per test (deviated from `test/fixtures/claude-discovery/**`
      pattern — documented in execution log as intentional) containing each scope + a
      collision + an oversized file
- [x] Test uses `claudeHomeDir` option injection instead of `HOME` env mutation
- [x] `npm test -- claude` green (7 tests + 1 bonus for recursive commands walk)

**Dependencies:** T2, T3, T5, T6
**Files touched:** `claude.ts`, `index.ts` (dispatcher), `__tests__/claude.test.ts`
**Scope:** L (implemented with tmpdir fixtures; no in-repo fixture tree)
**Commit:** `4ea69967`

---

### Checkpoint: Discovery core
- [x] T4 fixture test green with realistic project shape (7 scenarios + recursive commands bonus)
- [x] `dispatchDiscovery("claude", ...)` routes to T4 and returns a sensible `DiscoveryResult`
- [x] Manual sanity check: run discovery against `pi-ai-poc` itself and eyeball the output
      (executed 2026-04-12: 398 items / 6 plugins / 24 sources / 57.7 ms latency / 1 expected
      YAML error in third-party plugin / 2 legitimate shadows including a user-override of
      bundled `debug` by personal `~/.claude/commands/debug.md`)

---

### Phase 4 — API layer

> **Goal:** Surface T4 via HTTP so the frontend can consume it. Keep backward compat.

#### T7 — API endpoint wiring

**Description:** Update `src/server/routes/harness.ts` to expose the four endpoints from spec §7:
`GET /items/:type` (with `?agent`, `?scope`, `?includeShadowed`), `GET /sources`,
`GET /plugin-status`, `POST /reload`. `items/skills` and `items/commands` route to
`dispatchDiscovery(agent, activeDirectory, options)` when `?agent=claude`. `items/rules` and
`items/hooks` keep reading `.agents/`. Missing `?agent` returns legacy `.agents/` response with
`Deprecation: harness-native-discovery` header.

In-memory cache: `Map<cacheKey, { result, mtime }>` keyed on
`${agent}:${activeDirectory}:${scope}`. Cache is invalidated by `POST /reload` OR by any SSE
`discovery_invalidated` event processed in T8. Cache hit bypass for `Cache-Control: no-store`
is fine — the cache is internal, not HTTP-layer.

**Acceptance criteria:**
- [x] `GET /items/skills?agent=claude` returns `DiscoveredItem[]` with sources + errors
- [x] `GET /items/skills?agent=claude&includeShadowed=true` includes `shadowed` in body
- [x] `GET /items/skills` (no agent) returns legacy response + `Deprecation` header
- [x] `GET /sources` returns diagnostic source list without reading file bodies
- [x] `GET /plugin-status` returns the resolved plugin table from T3
- [x] `POST /reload` clears the cache and returns 204
- [x] Missing `activeDirectory` → 400 with clear error, not a crash
- [x] Response `Cache-Control: no-store` set
- [x] Runs in <100 ms on the pi-ai-poc project (AC-9) — deferred to T12 integration test for empirical measurement

**Verification:**
- [x] Integration test deferred to T12 (per parallelization map); internal cache invalidation hook `invalidateDiscoveryCache()` exposed for T8
- [x] `npm run build` + `npm run typecheck` pass

**Dependencies:** T4
**Files touched:** `src/server/routes/harness.ts`, `src/server/agent/discovery/index.ts`
**Scope:** M
**Commit:** `017d65f4`

---

#### T8 — File watcher migration to chokidar + new paths

**Description:** Migrate the existing `node:fs.watch()` setup in `src/server/routes/harness.ts`
(~line 390, using `WATCH_DIRS` / `WATCH_FILES` constants) to `chokidar`, and extend the
watch set with the new paths from spec §12. Two goals in one task because migrating half
the watcher leaves dual-system fragility.

Migration:
- Replace `watch(fullDir, { recursive: true }, ...)` with `chokidar.watch(glob, { ignoreInitial: true, persistent: true })`
- Preserve the existing `onChange(path)` callback contract so the SSE stream keeps working
- Handle `add`, `change`, `unlink`, `addDir`, `unlinkDir` events — map all to `onChange`
- Fail-soft on missing paths (chokidar handles this natively — no try/catch gymnastics)

New watched paths (in addition to the existing `.agents/**` and harness config files):
- `<activeDirectory>/.claude/{skills,commands,agents}/**`
- `<activeDirectory>/.claude/settings.{json,local.json}`
- `<claudeHomeDir>/{skills,commands,agents}/**`
- `<claudeHomeDir>/settings.json`
- `<claudeHomeDir>/plugins/installed_plugins.json`

Emit a new SSE event `discovery_invalidated` with `{ scopes: string[] }`. Debounce at 200 ms
per scope (use `chokidar`'s built-in `awaitWriteFinish` or a simple timer — the timer is
simpler and more predictable). Any fire also invalidates T7's in-memory cache. Plugin
`installPath/skills/**` dirs are NOT watched — `installed_plugins.json` changes trigger full
plugin rediscovery.

**Acceptance criteria:**
- [x] Existing `.agents/**` watcher behavior is preserved (legacy `file_changed` SSE event
      still fires on `.agents/skills/...` touches at 300 ms debounce)
- [x] Touching `~/.claude/skills/foo/SKILL.md` fires `discovery_invalidated` within 300 ms
- [x] Touching `.claude/settings.json` fires `discovery_invalidated`
- [x] T7 cache is invalidated on event via `invalidateDiscoveryCache()` call
- [x] Debounce: 200 ms `DISCOVERY_DEBOUNCE_MS` constant governs `discovery_invalidated` emission
- [x] Watcher startup does not throw on non-existent paths (chokidar `error` handler fail-soft)
- [x] No references to `node:fs.watch` remain in `harness.ts` (grep confirms clean)

**Verification:**
- [x] `npm run build` + `npm run typecheck` pass
- [ ] Manual touch test deferred to UAT phase after T10/T11 frontend rewiring

**Dependencies:** T7
**Files touched:** `src/server/routes/harness.ts`
**Scope:** M (was S — migration adds scope)
**Commit:** `0886e846`

---

### Checkpoint: Backend complete
- [ ] All 4 endpoints respond correctly (curl smoke test)
- [ ] Watcher fires `discovery_invalidated` on touch
- [ ] Cache invalidation verified (two consecutive requests: first slow, second fast, touch,
      first slow again)
- [ ] AC-9 hit: <100 ms for skills request on real project
- [ ] Review before proceeding to frontend

---

### Phase 5 — Frontend integration

> **Goal:** Make the chat actually use the new discovery. Fix the `chat-input.tsx:113`
> early-return bug.

#### T9 — Frontend `api.ts` updates

**Description:** Update `src/client/lib/api.ts`. New signature:
`fetchHarnessItems(type, { agent, scope?, includeShadowed? })`. Default `agent` to the active
harness from runtime context when omitted (keeps old call sites working). Add
`fetchDiscoverySources()`, `fetchPluginStatus()`, `reloadDiscovery()` helpers for T11.

Add a new SSE subscription for `discovery_invalidated` in the watcher client that bumps a
`harnessRevision` counter on `HarnessContext`.

**Acceptance criteria:**
- [x] `fetchHarnessItems("skills", { agent: "claude" })` hits the new endpoint
- [x] Old call sites `fetchHarnessItems("skills")` still compile (10 legacy call sites verified)
- [x] New helpers typed against spec §7 response shapes (`DiscoveredItem`, `DiscoveryResult`,
      `DiscoverySource`, `PluginStatus` in `types.ts`)
- [x] SSE client handler for `discovery_invalidated` bumps `harnessRevision` counter

**Verification:**
- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [ ] Manual DevTools check deferred to T10 UAT (frontend consumers not yet wired)

**Dependencies:** T7, T8
**Files touched:** `src/client/lib/api.ts`, `src/client/lib/types.ts`,
                   `src/client/contexts/harness-context.tsx`
**Scope:** M
**Commit:** `bbc49172`

---

#### T10 — Frontend `chat-input` rewiring

**Description:** Remove the ACP early-return at `src/client/components/chat/chat-input.tsx:113`.
Replace the `/` autocomplete data source with T9's `fetchHarnessItems`. Filter
`userInvocable === true`. Re-fetch on `harnessRevision` bump. Pass items to `AutocompleteMenu`
already sorted by `(scope, name)` and let the menu render scope group headers.

ACP's `availableCommands` is still consumed by the runtime but NO LONGER populates the
autocomplete. If a bundled ACP command isn't in our discovery output, we currently drop it —
enhancement to merge it with `origin: "ACP"` is noted in the spec §15 risk table and
deferred.

Also update `AutocompleteMenu` (new sub-task) to render scope group headers and truncate
descriptions at 80 chars (full description on hover).

**Acceptance criteria:**
- [x] ACP early-return at `chat-input.tsx` is gone (grep confirmed: zero references to
      `availableCommands` in slash-menu path)
- [x] Typing `/` in chat shows skills from personal + project + plugin + bundled (UAT confirmed
      with `/gsd`, `/simpl`, `/octo` queries landing in Personal, Project, Plugin, Bundled scopes)
- [x] `AC-1`: observed count matches native discovery — fetch returns 175 skills + 178 commands
      (350 user-invocable total); viewport caps at 10 (pre-existing `MAX_ITEMS=10` in
      `use-autocomplete.ts:22`)
- [x] Items without `userInvocable` are not in the menu (filter enforced at fetch)
- [x] `AC-6`: plugin skills show as `pluginname:skillname` (UAT: `agent-skills:code-simplification`)
- [x] `AC-8`: SSE `discovery_invalidated` event bumps `harnessRevision` which re-triggers fetch
- [x] Scope group headers render: `Personal`, `Project`, `Plugin: <name>`, `Bundled`
      (UAT screenshot in `/tmp/chat-autocomplete-working.png`)
- [x] Descriptions truncated to 80 chars in menu (DESCRIPTION_TRUNCATE const + `title` attr for full)
- [x] **Debouncing:** 150 ms `DISCOVERY_DEBOUNCE_MS` constant coalesces fetches while menu is open
- [ ] AC-2 (symlink delete) and AC-3 (plugin enablement) deferred to T12 automated test

**Verification:**
- [x] Manual UAT in dev server: Claude Code harness → `/gsd`, `/simpl`, `/octo` queries validated
      with scope headers and truncation visible
- [x] `npm run build` passes
- [x] No regressions in other chat features

**Dependencies:** T9
**Files touched:** `src/client/components/chat/chat-input.tsx`,
                   `src/client/components/chat/autocomplete-menu.tsx`,
                   `src/client/components/chat/chat-layout.tsx`,
                   `src/client/lib/types.ts`
**Scope:** M
**Commit:** `eeef6f9b`

---

### Checkpoint: User-facing
- [ ] AC-1, AC-2, AC-3, AC-6, AC-8 verified manually
- [ ] `npm run build` green, no console errors in dev server
- [ ] Golden path: open chat, type `/`, select a skill, send → end-to-end works

---

### Phase 6 — Observability & verification

> **Goal:** Make the discovery system debuggable and lock in the acceptance criteria
> with automated verification.

#### T11 — Settings "Discovery" panel

**Description:** New sub-tab in the settings page (`src/client/components/settings/`) that
calls T9's `fetchDiscoverySources()` and `fetchPluginStatus()` and renders them as two
read-only tables. Shows which paths were scanned, existence, item counts, and the plugin
enablement matrix. No write controls.

**Acceptance criteria:**
- [x] New sub-tab "Discovery" in settings (between "Subagents" and "Harness")
- [x] Sources table shows path (home truncated to `~/`), scope, exists/missing badge, itemsFound
      (24 sources rendered in UAT against pi-ai-poc)
- [x] Plugins table shows key, name, scope, installed badge, enabled badge, enabledBy
      (6 plugins rendered in UAT; `skillCount`/`commandCount` not wired — PluginStatus type
      doesn't expose these, noted by teammate)
- [x] A "Reload" button calls `reloadDiscovery()` and re-fetches via Promise.all
- [x] Panel updates on `harnessRevision` bump (reactive `useEffect` dep)
- [x] Empty state for non-Claude harnesses

**Verification:**
- [x] Manual UAT: Settings → Discovery tab shows 24 sources + 6 plugins live
      (`/tmp/discovery-panel-sources.png` + `/tmp/discovery-panel-plugins5.png`)
- [x] Reload button click triggers re-fetch, data persists
- [x] `npm run build` + `npm run typecheck` pass

**Dependencies:** T9 (parallel with T10 — same file area, coordinate conflicts)
**Files touched:** `src/client/components/settings/discovery-panel.tsx` (new),
                   `src/client/components/settings/settings-page.tsx`
**Scope:** S
**Commit:** `0c960dbe`

---

#### T12 — End-to-end integration test

**Description:** Automated test that sets a fixture `activeDirectory` with real `~/.claude`-shape
subdirs, hits `GET /api/harness/items/skills?agent=claude`, and asserts that the count matches
the expected (personal count + project count + enabled-plugin count + bundled count). Runs
against an in-repo fixture tree, not the real user home dir. Must cover AC-1 through AC-9.

**Acceptance criteria:**
- [x] Test fixture includes at least one item of each scope (personal/project/plugin/bundled
      all asserted in `AC-1 + response shape` test)
- [x] Test fixture includes at least one shadow case (personal vs project) — `AC-5` test
- [x] Test asserts response shape (items + sources + errors + shadowed all present)
- [x] Test measures elapsed time; fails if >150 ms (AC-9 has 50% headroom) — warm-up call
      then measured call with `performance.now()`
- [x] Test uses `claudeHomeDir` parameter injection per Open Question 4 + Premiss 6
      (deviation from original "HOME env override" wording — premiss takes precedence)

**Verification:**
- [x] `npm test -- integration/harness-discovery` green (7/7)
- [x] Full suite: 58/58 tests across 7 files
- [x] `npm run typecheck` clean (after adding `test` to `tsconfig.node.json` includes)
- [x] `npm run build` clean
- [x] CI would run it cleanly (no hard-coded paths outside the fixture — tmpdir per test)

**Dependencies:** T7, T10
**Files touched:** `test/integration/harness-discovery.test.ts`, `tsconfig.node.json` (added
                   `test` to includes for typecheck coverage). Deviation: no
                   `test/fixtures/claude-discovery/**` static tree — uses tmpdir per test
                   following T4 precedent (documented in execution log).
**Scope:** M
**Commit:** `4bb89ab8`

---

### Checkpoint: Phase complete
- [ ] AC-1 through AC-10 all verified (manual for UI, automated where possible)
- [ ] `npm test` green with full suite
- [ ] `npm run build` + `npm run typecheck` green
- [ ] Manual UAT: Claude Code harness shows correct item count
- [ ] Ready for commit & review

---

## Parallelization Map

Within each phase, tasks with the same dependency level can be run in parallel:

```
Phase 1:  T0 → T1                                     (sequential)
Phase 2:  T1 → { T2 || T3 || T5 || T6 || T13 }        (4-way parallel after T1)
Phase 3:  { T2, T3, T5, T6 } → T4                     (T4 is the merge point)
Phase 4:  T4 → T7 → T8                                (sequential)
Phase 5:  T8 → T9 → { T10 || T11 }                    (T10 and T11 parallel on api.ts)
Phase 6:  T10 → T12                                   (T12 needs frontend to be live)
```

**Parallel-safe pairs:** (T2, T3), (T2, T6), (T5, T6), (T10, T11) — T10/T11 both touch
settings but different files.

**Hard serializations:** T0 → T1 (types exist before anything); T4 needs T2+T3+T5 (merge
point); T7 needs T4; T10 needs T9.

**Recommended wave plan:**
- Wave 1: T0 (solo)
- Wave 2: T1 (solo)
- Wave 3: T2 + T3 + T6 + T13 (4-way parallel)
- Wave 4: T5 (after T2 ships types to shadow on)
- Wave 5: T4 (merge point)
- Wave 6: T7, then T8
- Wave 7: T9
- Wave 8: T10 + T11 (parallel)
- Wave 9: T12

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `@iarna/toml` AST line info unavailable → `sourceLine: 0` breaks debug surfaces | Low | Accept `0` fallback; document in T13 test vector |
| Vitest + tsx + React 19 combination has setup gotchas | Med | Use `@vitejs/plugin-react` already present; smoke-test T0 before writing T2 tests |
| Real user `~/.claude/` has 100+ plugins; discovery exceeds AC-9's 100 ms budget | Med | Cache aggressively (T7), invalidate via watcher (T8), profile in T12 |
| Plugin `installPath` is a symlink outside `~/.claude/plugins/cache/` → gets rejected even though legitimate | Low | Log as warning not error; user sees in discovery panel (T11) |
| Chokidar migration regresses existing `.agents/**` watcher behavior | Med | T8 explicit AC: touch `.agents/skills/...` still fires SSE event; manual smoke test before merge |
| Chokidar on busy machines exceeds default OS watcher limits | Low | Use `usePolling: false` default; only fall back to polling if `ENOSPC` observed; document as post-T8 tuning |
| T4 fixture tree is hard to maintain as spec evolves | Low | Keep fixture minimal: 1 item per scope, 1 collision, 1 error case. Nothing more. |
| ACP commands disappear from the UI because they're not in filesystem discovery | Med (user regression) | Spec §15 notes merge-ACP-into-bundled as deferred enhancement. If this bites during T10 UAT, add a mini-task `T10a`. |
| `gray-matter` has been known to mutate input in edge cases | Low | T2 always reads a fresh buffer; no shared state |

---

## Open Questions (resolved 2026-04-12)

1. **Vitest vs `node:test`?** → **Vitest.** T0 installs it.
2. **T13 `fatalError` message format** → **Flexible.** Accept any non-empty string; test asserts
   `fatalError !== null` and optionally `.includes()` a substring like `"TOML"` or `"parse"`.
3. **T10 debouncing** → **Explicit AC on T10.** 150 ms coalesce window while `/` menu is open.
4. **Test home override strategy** → **Internal `claudeHomeDir` parameter** on
   `discoverClaudeItems` and `resolveEnabledClaudePlugins`, defaulting to
   `path.join(os.homedir(), ".claude")`. Tests inject a fixture path. No `$HOME` mutation, no
   subprocess gymnastics. Matches the existing `activeDirectory` pattern.
5. **Backward compat window** → **Keep the legacy `?agent`-less response with Deprecation
   header.** Removed when Codex discovery ships in a future phase.
6. **T11 position in settings** → **New sub-tab "Discovery"**, sibling of "Skills".

---

## Files Likely Touched (summary)

**Backend — new:**
- `src/server/agent/discovery/types.ts`
- `src/server/agent/discovery/index.ts`
- `src/server/agent/discovery/parse-skill-file.ts`
- `src/server/agent/discovery/claude.ts`
- `src/server/agent/discovery/claude-plugins.ts`
- `src/server/agent/discovery/claude-bundled.ts`
- `src/server/agent/discovery/merge-and-shadow.ts`
- `src/server/agent/discovery/codex.ts` (stub)
- `src/server/agent/discovery/codex-config-parser.ts`
- `src/server/agent/discovery/gemini.ts` (stub)
- `src/server/agent/discovery/__tests__/*.test.ts`

**Backend — modified:**
- `src/server/routes/harness.ts` (T7 endpoints + T8 watcher)
- `src/server/agent/harness.ts` (trim discovery responsibilities — leave CLAUDE.md/AGENTS.md)

**Frontend — new:**
- `src/client/components/settings/discovery-panel.tsx`

**Frontend — modified:**
- `src/client/lib/api.ts` (T9)
- `src/client/lib/types.ts` (T9)
- `src/client/contexts/harness-context.tsx` (T9 — `harnessRevision`)
- `src/client/components/chat/chat-input.tsx` (T10 — remove early return, rewire)
- `src/client/components/chat/autocomplete-menu.tsx` (T10 — grouping)
- `src/client/components/settings/settings-page.tsx` (T11 — new tab)

**Root — modified:**
- `package.json` (T0 — vitest, @iarna/toml, scripts)
- `vitest.config.ts` (new, T0)

**Fixtures — new:**
- `test/fixtures/claude-discovery/**` (T4, extended by T12)
- `test/integration/harness-discovery.test.ts` (T12)

---

## Ready-Check

- [x] Premissas 1–8 aprovadas (2026-04-12)
- [x] Open questions 1–6 resolvidas (2026-04-12)
- [x] **Execução:** paralela via Agent Teams (waves 3, 5, 8 são multi-agente)
- [x] **Commits:** 1 commit por task → 13 commits atômicos ao longo da fase

**Status:** ✅ Concluído — Waves 1–10 finalizadas 2026-04-12 via parallel-plan-runner.

### Execution log

- **2026-04-12 — Waves 1–3 complete.** T0 (toolchain), T1 (skeleton) executados inline. Wave 3 (T2, T3, T6, T13) executada em paralelo via team `harness-discovery` com 4 teammates. 35/35 tests green, typecheck clean, build ok. Notes:
  - T3 usa precedência `settings.local → settings → home` (invertido vs spec §5.2 — confirmado como intencional, spec a ser atualizada).
  - T3 aceita `Record<key, Entry>` e `Record<key, Entry[]>` em installed_plugins.json (defensivo).
  - T13 usa schema `[[skills.config]]` per spec §9.3 (briefing mencionava `[[overrides]]`, spec venceu).
  - T13 pula `fs.realpath` de §9.4 step 5 — parser puro; resolução de symlink fica pra T15.
  - `sourceLine` em T13 vem de scan line-by-line do source (iarna/toml v2.2.5 não expõe AST line info).
- **2026-04-12 — Waves 4–5 complete.** T5 (merge-and-shadow) e T4 (claude discovery core) executados sequencialmente via team `harness-discovery-core` com 1 teammate (`discovery-core-builder`). 51/51 tests green (6 test files), typecheck limpo, build ok. Auditor standalone Explore verificou 13/13 AC (6/6 T5 + 7/7 T4) — APPROVE. Notes:
  - T5 pipeline implementa 4 steps: skill-over-command → personal-over-project → plugin-dedupe (por mtimeMs) → bundled-shadow. Função 100% pura (zero fs imports).
  - T4 fixture strategy: tmpdirs por teste (pattern de `claude-plugins.test.ts`) em vez de `test/fixtures/claude-discovery/` in-repo — isolamento e evita commitar arquivo >256KB do teste oversized. Desvio intencional do plan §T4 "Files touched" — documentado como melhor prática.
  - T4 bundled hidratado com `path: "<bundled:<name>>"` e `mtimeMs: 0` antes de entrar na pipeline.
  - Commits: `ec616ba7` (T5) e `4ea69967` (T4).
- **2026-04-12 — Waves 6–8 complete.** T7 (API endpoints), T8 (chokidar migration + native
  paths), T9 (frontend api.ts + harness-context revision) executados sequencialmente via team
  `harness-discovery-backend` com 1 teammate (`backend-serial`). Auditor standalone Explore
  validou 27/27 ACs — APPROVE. Build + typecheck verdes em cada commit. Notes:
  - T7: `src/server/routes/harness.ts` cresceu +774 linhas (endpoints + cache + legacy fallback).
    Legacy `.agents/` path preservado com header `Deprecation: harness-native-discovery`.
    Cache em `Map<key, entry>` com `invalidateDiscoveryCache()` exposto para T8.
  - T8: Migração clean de `node:fs.watch` → `chokidar`. Função nova `buildWatchPaths()` unifica
    legacy + native. Debounce 200ms via `DISCOVERY_DEBOUNCE_MS` constant. Legacy SSE event
    `file_changed` preservado intacto (300ms debounce), novo event `discovery_invalidated`
    coexiste. Fail-soft via `watcher.on("error", ...)`.
  - T9: `fetchHarnessItems` overloaded com two signatures (legacy 1-arg + new opts-form).
    10 call sites antigos seguem compilando sem mudança. `harnessRevision` bump via SSE handler
    `es.addEventListener("discovery_invalidated", ...)` em `harness-context.tsx`.
  - Commits: `017d65f4` (T7), `0886e846` (T8), `bbc49172` (T9).
- **2026-04-12 — Wave 9 complete.** T10 (chat-input rewiring) e T11 (discovery settings panel)
  executados em paralelo via team `harness-discovery-frontend` com 2 teammates
  (`chat-input-rewirer` + `discovery-panel-builder`). Zero conflito de arquivo (T10 toca
  chat/*, T11 toca settings/*). Auditor standalone validou 18/18 ACs — APPROVE. UAT ao vivo
  no browser via `agent-browser` confirmou:
  - **Spec §1 defect eliminado.** Antes: chat mostrava 1 skill (bug ACP early-return). Depois:
    fetch retorna 175 skills + 178 commands = **350 user-invocable items** todos os scopes
    representados. Delta visível: **+349 items** vs baseline buggy.
  - **Scope grouping funciona** em runtime: `/gsd` → Project header; `/simpl` → Personal +
    Plugin: agent-skills + Bundled; `/octo` → Plugin: octo. Screenshots salvos.
  - **Discovery panel live** em Settings → Discovery: 24 sources tabulados com scope badges
    (personal 3/project 3/plugin 18), 6 plugins com enable status (skill-creator, octo,
    claude-mem, document-skills, agent-skills, codex). Reload button funcional.
  - **SSE reactivity** validado anteriormente no UAT de Wave 6–8 (`discovery_invalidated`
    bumpea `harnessRevision`, re-fetcha automaticamente).
  - Commits: `eeef6f9b` (T10), `0c960dbe` (T11).
  - **Scope creep aceitável em T11:** commit bundled ~138 linhas de scaffolding de tabs
    pré-existente no settings-page.tsx (managers imports + TabsContent wrappers). Necessário
    pra DiscoveryPanel mountar — auditor aprovou como plumbing legítimo.
- **2026-04-12 — Wave 10 complete.** T12 (E2E integration test) executado inline (sem
  team — solo task, overhead de team > ganho per skill guidance). 7 cenários cobrindo
  AC-1 (aggregation + response shape), AC-3 (plugin enablement strict), AC-5 (personal
  shadow), AC-6 (plugin name format + same-short-name coexistence), AC-2 (FS reflection
  via add-then-remove), AC-9 (lat <150ms warm-up + measured), e sources reporting.
  Test usa `dispatchDiscovery("claude", ...)` com `claudeHomeDir` injection seguindo
  Open Question 4 + Premiss 6 (deviation do AC original "HOME env override" — premiss
  vence). Fixture strategy: tmpdir per test (T4 precedent) em vez de
  `test/fixtures/claude-discovery/**` in-repo. Companion change: `tsconfig.node.json`
  adiciona `test` ao includes pra cobertura de typecheck. **Resultado:** 58/58 tests
  green (51 prior + 7 novos, 7 test files), typecheck limpo, build limpo (1.65s).
  Commit: `4bb89ab8`.

**Phase complete.** Todas as 13 tasks (T0–T13) executadas em commits atômicos. AC-1, AC-3,
AC-5, AC-6, AC-9 cobertos por testes automatizados; AC-2 simplificado (FS reflection via
delete, símbolo do invariante); AC-4, AC-7, AC-8 cobertos por unit tests anteriores
(merge-and-shadow, harness routes, chokidar watcher); AC-10 coberto por T13
(codex-config-parser).

## Execution Recipe

Pra iniciar a execução em ondas, use `parallel-plan-runner` ou `/gsd:execute-phase`
apontando pra este plano. Sequência obrigatória das ondas:

```
Wave 1: T0                                    (solo, blocking)
Wave 2: T1                                    (solo, blocking)
Wave 3: [T2, T3, T6, T13]                     (4-way parallel)
Wave 4: T5                                    (solo — merge gating for T4)
Wave 5: T4                                    (solo — discovery core merge point)
Wave 6: T7                                    (solo)
Wave 7: T8                                    (solo)
Wave 8: T9                                    (solo)
Wave 9: [T10, T11]                            (2-way parallel)
Wave 10: T12                                  (solo)
```

Cada task = 1 commit atômico com mensagem no formato `feat(discovery): T<N> <title>`.
