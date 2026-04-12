import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import path from "path"
import fs from "fs/promises"
import os from "node:os"
import chokidar, { type FSWatcher } from "chokidar"
import { execFile } from "child_process"
import { promisify } from "util"
import { discoverHarness } from "../agent/harness"
import type { HarnessResult } from "../agent/harness"
import { syncItem } from "../agent/agent-file-map"
import {
  dispatchDiscovery,
  type DiscoveryHarness,
  type DiscoveryResult,
  type DiscoveredScope,
} from "../agent/discovery"
import { resolveEnabledClaudePlugins } from "../agent/discovery/claude-plugins"

const execFileAsync = promisify(execFile)

const harnessRoutes = new Hono()

// In-memory harness storage (D-13: no file watching, persists until next load or restart)
let activeHarness: HarnessResult | null = null
let activeDirectory: string | null = null

export function getActiveHarness() {
  return activeHarness
}

export function getActiveDirectory() {
  return activeDirectory
}

// Canonical .agents/ directory structure
const VALID_ITEM_TYPES = ["skills", "commands", "rules", "subagents", "hooks"] as const
type ItemType = (typeof VALID_ITEM_TYPES)[number]

function isValidItemType(t: string): t is ItemType {
  return (VALID_ITEM_TYPES as readonly string[]).includes(t)
}

function isValidName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    !name.includes("..") &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0")
  )
}

function resolveItemPath(dir: string, type: ItemType, name: string): string {
  const agentsDir = path.join(dir, ".agents")
  switch (type) {
    case "skills":
      return path.join(agentsDir, "skills", name, "SKILL.md")
    case "commands":
      return path.join(agentsDir, "commands", `${name}.md`)
    case "rules":
      return path.join(agentsDir, "rules", `${name}.md`)
    case "subagents":
      return path.join(agentsDir, "agents", `${name}.md`)
    case "hooks":
      return path.join(agentsDir, "hooks.json")
  }
}

harnessRoutes.post("/load", async (c) => {
  const { directory } = await c.req.json<{ directory: string }>()

  if (!directory || typeof directory !== "string") {
    return c.json({ error: "Directory path required" }, 400)
  }

  if (!path.isAbsolute(directory)) {
    return c.json({ error: "Absolute directory path required" }, 400)
  }

  // Validate directory exists
  try {
    const stat = await fs.stat(directory)
    if (!stat.isDirectory()) {
      return c.json({ error: "Path is not a directory" }, 400)
    }
  } catch {
    return c.json({ error: "Directory not found. Check the path and try again." }, 404)
  }

  const result = await discoverHarness(directory)

  // Store in memory (D-13)
  activeHarness = result
  activeDirectory = directory

  return c.json(result)
})

harnessRoutes.get("/status", (c) => {
  return c.json({
    applied: activeHarness !== null,
    hasClaudeMd: activeHarness?.claudeMd !== null,
    hasAgentsMd: activeHarness?.agentsMd !== null,
    skillCount: activeHarness?.skills?.count ?? 0,
    commandCount: activeHarness?.commands?.count ?? 0,
    ruleCount: activeHarness?.rules?.count ?? 0,
    hookCount: activeHarness?.hooks?.count ?? 0,
    subagentCount: activeHarness?.subagents?.count ?? 0,
  })
})

harnessRoutes.post("/clear", (c) => {
  activeHarness = null
  activeDirectory = null
  return c.json({ status: "ok" })
})

// --- Instructions (AGENTS.md / CLAUDE.md / GEMINI.md) ---

harnessRoutes.get("/instructions", async (c) => {
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  const agentsPath = path.join(activeDirectory, "AGENTS.md")
  const claudePath = path.join(activeDirectory, "CLAUDE.md")
  const geminiPath = path.join(activeDirectory, "GEMINI.md")

  let content = ""
  try {
    content = await fs.readFile(agentsPath, "utf-8")
  } catch {
    // AGENTS.md doesn't exist yet
  }

  let claudeExists = false
  let claudeSynced = false
  try {
    const claudeContent = await fs.readFile(claudePath, "utf-8")
    claudeExists = true
    claudeSynced = claudeContent.includes("@AGENTS.md")
  } catch {
    // CLAUDE.md doesn't exist
  }

  let geminiExists = false
  let geminiSynced = false
  try {
    const geminiContent = await fs.readFile(geminiPath, "utf-8")
    geminiExists = true
    geminiSynced = geminiContent.includes("@AGENTS.md")
  } catch {
    // GEMINI.md doesn't exist
  }

  return c.json({ content, claudeExists, claudeSynced, geminiExists, geminiSynced })
})

harnessRoutes.post("/instructions", async (c) => {
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  const { content } = await c.req.json<{ content: string }>()
  if (content == null || typeof content !== "string") {
    return c.json({ error: "Content is required" }, 400)
  }

  const agentsPath = path.join(activeDirectory, "AGENTS.md")
  const claudePath = path.join(activeDirectory, "CLAUDE.md")
  const geminiPath = path.join(activeDirectory, "GEMINI.md")

  await fs.writeFile(agentsPath, content, "utf-8")

  // Generate CLAUDE.md if it doesn't exist
  try {
    await fs.access(claudePath)
  } catch {
    await fs.writeFile(claudePath, "@AGENTS.md\n", "utf-8")
  }

  // Generate GEMINI.md if it doesn't exist
  try {
    await fs.access(geminiPath)
  } catch {
    await fs.writeFile(geminiPath, "@AGENTS.md\n", "utf-8")
  }

  return c.json({ status: "ok" })
})

// --- CRUD endpoints for .agents/ items ---

harnessRoutes.get("/items", async (c) => {
  const type = c.req.query("type")
  if (!type || !isValidItemType(type)) {
    return c.json({ error: `Invalid type. Must be one of: ${VALID_ITEM_TYPES.join(", ")}` }, 400)
  }
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  if (type === "hooks") {
    const hooksPath = resolveItemPath(activeDirectory, "hooks", "")
    try {
      const content = await fs.readFile(hooksPath, "utf-8")
      return c.json([{ name: "hooks.json", type: "hooks", path: hooksPath, content }])
    } catch {
      return c.json([])
    }
  }

  const dirMap: Record<string, string> = {
    skills: path.join(activeDirectory, ".agents", "skills"),
    commands: path.join(activeDirectory, ".agents", "commands"),
    rules: path.join(activeDirectory, ".agents", "rules"),
    subagents: path.join(activeDirectory, ".agents", "agents"),
  }

  const targetDir = dirMap[type]
  if (!targetDir) return c.json([])

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true })
    const items = []

    for (const entry of entries) {
      if (type === "skills") {
        if (!entry.isDirectory()) continue
        const skillPath = path.join(targetDir, entry.name, "SKILL.md")
        try {
          const content = await fs.readFile(skillPath, "utf-8")
          items.push({ name: entry.name, type, path: skillPath, content })
        } catch {
          items.push({ name: entry.name, type, path: skillPath })
        }
      } else {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue
        const name = entry.name.replace(/\.md$/, "")
        const filePath = path.join(targetDir, entry.name)
        try {
          const content = await fs.readFile(filePath, "utf-8")
          items.push({ name, type, path: filePath, content })
        } catch {
          items.push({ name, type, path: filePath })
        }
      }
    }

    return c.json(items)
  } catch {
    return c.json([])
  }
})

harnessRoutes.get("/item", async (c) => {
  const type = c.req.query("type")
  const name = c.req.query("name")

  if (!type || !isValidItemType(type)) {
    return c.json({ error: `Invalid type. Must be one of: ${VALID_ITEM_TYPES.join(", ")}` }, 400)
  }
  if (!name || !isValidName(name)) {
    return c.json({ error: "Invalid or missing name" }, 400)
  }
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  const itemPath = resolveItemPath(activeDirectory, type, name)
  try {
    const content = await fs.readFile(itemPath, "utf-8")
    return c.json({ name, type, path: itemPath, content })
  } catch {
    return c.json({ error: "Item not found" }, 404)
  }
})

harnessRoutes.post("/item", async (c) => {
  const body = await c.req.json<{ type: string; name: string; content: string }>()
  const { type, name, content } = body

  if (!type || !isValidItemType(type)) {
    return c.json({ error: `Invalid type. Must be one of: ${VALID_ITEM_TYPES.join(", ")}` }, 400)
  }
  if (!name || !isValidName(name)) {
    return c.json({ error: "Invalid or missing name" }, 400)
  }
  if (content == null || typeof content !== "string") {
    return c.json({ error: "Content is required" }, 400)
  }
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  const itemPath = resolveItemPath(activeDirectory, type, name)
  await fs.mkdir(path.dirname(itemPath), { recursive: true })
  await fs.writeFile(itemPath, content, "utf-8")

  return c.json({ name, type, path: itemPath, status: "ok" })
})

harnessRoutes.delete("/item", async (c) => {
  const body = await c.req.json<{ type: string; name: string }>()
  const { type, name } = body

  if (!type || !isValidItemType(type)) {
    return c.json({ error: `Invalid type. Must be one of: ${VALID_ITEM_TYPES.join(", ")}` }, 400)
  }
  if (!name || !isValidName(name)) {
    return c.json({ error: "Invalid or missing name" }, 400)
  }
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  const itemPath = resolveItemPath(activeDirectory, type, name)

  try {
    if (type === "skills") {
      // Delete the entire skill directory
      const skillDir = path.dirname(itemPath)
      await fs.rm(skillDir, { recursive: true })
    } else {
      await fs.unlink(itemPath)
    }
    return c.json({ status: "ok" })
  } catch {
    return c.json({ error: "Item not found" }, 404)
  }
})

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp", ".svg",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp4", ".mp3", ".wav", ".ogg", ".webm",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".pdf", ".exe", ".dll", ".so", ".dylib",
])

harnessRoutes.get("/project-files", async (c) => {
  const query = (c.req.query("query") ?? "").toLowerCase()

  // Use the active harness directory, or cwd as fallback
  const cwd = activeHarness
    ? (c.req.query("directory") ?? process.cwd())
    : process.cwd()

  try {
    const { stdout } = await execFileAsync("git", ["ls-files"], {
      cwd,
      maxBuffer: 1024 * 1024, // 1MB
    })

    const files = stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .filter((filePath) => {
        const ext = path.extname(filePath).toLowerCase()
        return !BINARY_EXTENSIONS.has(ext)
      })
      .filter((filePath) => !query || filePath.toLowerCase().includes(query))
      .slice(0, 50)
      .map((filePath) => ({ path: filePath }))

    return c.json(files)
  } catch {
    return c.json({ error: "Failed to list project files. Is this a git repository?" }, 500)
  }
})

// --- Format sync ---

harnessRoutes.post("/sync", async (c) => {
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  const body = await c.req.json<{ type: string; name: string }>()
  const { type, name } = body

  if (!type || typeof type !== "string") {
    return c.json({ error: "type required" }, 400)
  }
  if (type !== "hooks" && (!name || typeof name !== "string")) {
    return c.json({ error: "name required" }, 400)
  }
  if (name && !isValidName(name)) {
    return c.json({ error: "Invalid name" }, 400)
  }

  const result = await syncItem(activeDirectory, type, name ?? "")
  return c.json(result, result.success ? 200 : 500)
})

// --- File watcher SSE ---

const FILE_DEBOUNCE_MS = 300
const DISCOVERY_DEBOUNCE_MS = 200

function buildWatchPaths(dir: string): { paths: string[]; claudeHomeDir: string } {
  const claudeHomeDir = path.join(os.homedir(), ".claude")
  const paths: string[] = [
    // Legacy .agents/-style watch tree
    path.join(dir, ".agents"),
    path.join(dir, ".claude"),
    path.join(dir, ".codex"),
    path.join(dir, ".gemini"),
    path.join(dir, "AGENTS.md"),
    // Native paths (project scope)
    path.join(dir, ".claude", "skills"),
    path.join(dir, ".claude", "commands"),
    path.join(dir, ".claude", "agents"),
    path.join(dir, ".claude", "settings.json"),
    path.join(dir, ".claude", "settings.local.json"),
    // Native paths (user scope)
    path.join(claudeHomeDir, "skills"),
    path.join(claudeHomeDir, "commands"),
    path.join(claudeHomeDir, "agents"),
    path.join(claudeHomeDir, "settings.json"),
    path.join(claudeHomeDir, "plugins", "installed_plugins.json"),
  ]
  return { paths, claudeHomeDir }
}

function classifyDiscoveryScope(absPath: string, dir: string, claudeHomeDir: string): string | null {
  const projectClaude = path.join(dir, ".claude")
  const projectAgents = path.join(dir, ".agents")
  if (absPath === projectClaude || absPath.startsWith(projectClaude + path.sep)) return "project"
  if (absPath === projectAgents || absPath.startsWith(projectAgents + path.sep)) return "project"
  if (absPath === claudeHomeDir || absPath.startsWith(claudeHomeDir + path.sep)) return "personal"
  return null
}

harnessRoutes.get("/watch", async (c) => {
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  const dir = activeDirectory

  return streamSSE(c, async (stream) => {
    const { paths: watchPaths, claudeHomeDir } = buildWatchPaths(dir)
    let watcher: FSWatcher | null = null
    let fileDebounceTimer: NodeJS.Timeout | null = null
    let discoveryDebounceTimer: NodeJS.Timeout | null = null
    let pendingFiles: Map<string, string> = new Map() // relPath -> action
    const pendingScopes = new Set<string>()
    let closed = false

    const flushFiles = async () => {
      if (closed) return
      const events = Array.from(pendingFiles.entries())
      pendingFiles = new Map()
      for (const [filePath, action] of events) {
        try {
          await stream.writeSSE({
            event: "file_changed",
            data: JSON.stringify({ type: "file_changed", path: filePath, action }),
          })
        } catch {
          // Stream closed
          closed = true
          break
        }
      }
    }

    const flushDiscovery = async () => {
      if (closed) return
      if (pendingScopes.size === 0) return
      const scopes = Array.from(pendingScopes)
      pendingScopes.clear()
      invalidateDiscoveryCache()
      try {
        await stream.writeSSE({
          event: "discovery_invalidated",
          data: JSON.stringify({ type: "discovery_invalidated", scopes }),
        })
      } catch {
        closed = true
      }
    }

    const onChange = (absPath: string, action: "modified" | "deleted") => {
      if (closed) return
      // Legacy: emit file_changed with project-relative paths when inside dir
      if (absPath === dir || absPath.startsWith(dir + path.sep)) {
        const rel = path.relative(dir, absPath)
        if (rel) pendingFiles.set(rel, action)
        if (fileDebounceTimer) clearTimeout(fileDebounceTimer)
        fileDebounceTimer = setTimeout(() => void flushFiles(), FILE_DEBOUNCE_MS)
      }
      // New: discovery scope invalidation
      const scope = classifyDiscoveryScope(absPath, dir, claudeHomeDir)
      if (scope) {
        pendingScopes.add(scope)
        if (discoveryDebounceTimer) clearTimeout(discoveryDebounceTimer)
        discoveryDebounceTimer = setTimeout(() => void flushDiscovery(), DISCOVERY_DEBOUNCE_MS)
      }
    }

    watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
    })
    watcher.on("add", (p) => onChange(p, "modified"))
    watcher.on("change", (p) => onChange(p, "modified"))
    watcher.on("unlink", (p) => onChange(p, "deleted"))
    watcher.on("addDir", (p) => onChange(p, "modified"))
    watcher.on("unlinkDir", (p) => onChange(p, "deleted"))
    watcher.on("error", () => { /* fail-soft: chokidar handles missing paths internally */ })

    // Send initial keepalive
    try {
      await stream.writeSSE({ event: "connected", data: JSON.stringify({ status: "watching" }) })
    } catch {
      closed = true
    }

    // Clean up on close
    stream.onAbort(() => {
      closed = true
      if (fileDebounceTimer) clearTimeout(fileDebounceTimer)
      if (discoveryDebounceTimer) clearTimeout(discoveryDebounceTimer)
      if (watcher) {
        watcher.close().catch(() => { /* ignore */ })
        watcher = null
      }
    })

    // Hold the stream open until aborted
    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve())
    })
  })
})

// --- Native discovery (harness-aware) ---

const VALID_DISCOVERY_HARNESSES = ["claude", "codex", "gemini"] as const
type DiscoveryHarnessParam = (typeof VALID_DISCOVERY_HARNESSES)[number]

function isValidDiscoveryHarness(value: string): value is DiscoveryHarnessParam {
  return (VALID_DISCOVERY_HARNESSES as readonly string[]).includes(value)
}

const VALID_DISCOVERY_SCOPES = ["personal", "project", "plugin", "bundled", "enterprise"] as const

function isValidDiscoveryScope(value: string): value is DiscoveredScope {
  return (VALID_DISCOVERY_SCOPES as readonly string[]).includes(value)
}

interface DiscoveryCacheEntry {
  result: DiscoveryResult
  mtime: number
}

const discoveryCache = new Map<string, DiscoveryCacheEntry>()

function discoveryCacheKey(
  agent: DiscoveryHarness,
  dir: string,
  scope: DiscoveredScope | undefined,
  includeShadowed: boolean,
): string {
  return `${agent}:${dir}:${scope ?? "all"}:${includeShadowed ? "+shadow" : ""}`
}

export function invalidateDiscoveryCache(): void {
  discoveryCache.clear()
}

async function getDiscoveryResult(
  agent: DiscoveryHarness,
  dir: string,
  scope: DiscoveredScope | undefined,
  includeShadowed: boolean,
): Promise<DiscoveryResult> {
  const key = discoveryCacheKey(agent, dir, scope, includeShadowed)
  const cached = discoveryCache.get(key)
  if (cached) return cached.result

  const result = await dispatchDiscovery(agent, dir, { scope, includeShadowed })
  discoveryCache.set(key, { result, mtime: Date.now() })
  return result
}

const DISCOVERY_NATIVE_TYPES = new Set(["skills", "commands", "subagents"])

harnessRoutes.get("/items/:type", async (c) => {
  const type = c.req.param("type")
  if (!isValidItemType(type)) {
    return c.json({ error: `Invalid type. Must be one of: ${VALID_ITEM_TYPES.join(", ")}` }, 400)
  }

  if (!activeDirectory) {
    return c.json({ error: "activeDirectory not set" }, 400)
  }

  const dir = activeDirectory
  c.header("Cache-Control", "no-store")

  const agentParam = c.req.query("agent")
  const scopeParam = c.req.query("scope")
  const includeShadowed = c.req.query("includeShadowed") === "true"

  // Native discovery path: ?agent=<harness> for skills/commands/subagents
  if (agentParam && DISCOVERY_NATIVE_TYPES.has(type)) {
    if (!isValidDiscoveryHarness(agentParam)) {
      return c.json(
        { error: `Invalid agent. Must be one of: ${VALID_DISCOVERY_HARNESSES.join(", ")}` },
        400,
      )
    }

    let scope: DiscoveredScope | undefined
    if (scopeParam && scopeParam !== "all") {
      if (!isValidDiscoveryScope(scopeParam)) {
        return c.json(
          { error: `Invalid scope. Must be one of: ${VALID_DISCOVERY_SCOPES.join(", ")}, all` },
          400,
        )
      }
      scope = scopeParam
    }

    try {
      const result = await getDiscoveryResult(agentParam, dir, scope, includeShadowed)
      const filteredItems = result.items.filter((item) => {
        if (type === "skills") return item.type === "skill"
        if (type === "commands") return item.type === "command"
        if (type === "subagents") return item.type === "subagent"
        return true
      })
      const body: {
        items: typeof result.items
        sources: typeof result.sources
        errors: typeof result.errors
        shadowed?: typeof result.shadowed
        generatedAt: number
      } = {
        items: filteredItems,
        sources: result.sources,
        errors: result.errors,
        generatedAt: Date.now(),
      }
      if (includeShadowed) body.shadowed = result.shadowed
      return c.json(body)
    } catch (err) {
      return c.json(
        {
          error: `Discovery failed: ${err instanceof Error ? err.message : String(err)}`,
        },
        500,
      )
    }
  }

  // Legacy fallback: read .agents/ directory (rules/hooks always; skills/commands/subagents
  // when agent param is omitted). Returns same shape as legacy /items?type=
  c.header("Deprecation", "harness-native-discovery")

  if (type === "hooks") {
    const hooksPath = resolveItemPath(dir, "hooks", "")
    try {
      const content = await fs.readFile(hooksPath, "utf-8")
      return c.json([{ name: "hooks.json", type: "hooks", path: hooksPath, content }])
    } catch {
      return c.json([])
    }
  }

  const dirMap: Record<string, string> = {
    skills: path.join(dir, ".agents", "skills"),
    commands: path.join(dir, ".agents", "commands"),
    rules: path.join(dir, ".agents", "rules"),
    subagents: path.join(dir, ".agents", "agents"),
  }

  const targetDir = dirMap[type]
  if (!targetDir) return c.json([])

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true })
    const items: Array<{ name: string; type: string; path: string; content?: string }> = []
    for (const entry of entries) {
      if (type === "skills") {
        if (!entry.isDirectory()) continue
        const skillPath = path.join(targetDir, entry.name, "SKILL.md")
        try {
          const content = await fs.readFile(skillPath, "utf-8")
          items.push({ name: entry.name, type, path: skillPath, content })
        } catch {
          items.push({ name: entry.name, type, path: skillPath })
        }
      } else {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue
        const name = entry.name.replace(/\.md$/, "")
        const filePath = path.join(targetDir, entry.name)
        try {
          const content = await fs.readFile(filePath, "utf-8")
          items.push({ name, type, path: filePath, content })
        } catch {
          items.push({ name, type, path: filePath })
        }
      }
    }
    return c.json(items)
  } catch {
    return c.json([])
  }
})

harnessRoutes.get("/sources", async (c) => {
  if (!activeDirectory) {
    return c.json({ error: "activeDirectory not set" }, 400)
  }

  const agentParam = c.req.query("agent")
  if (!agentParam || !isValidDiscoveryHarness(agentParam)) {
    return c.json(
      { error: `agent query param required (one of: ${VALID_DISCOVERY_HARNESSES.join(", ")})` },
      400,
    )
  }

  c.header("Cache-Control", "no-store")
  try {
    const result = await getDiscoveryResult(agentParam, activeDirectory, undefined, false)
    return c.json({ sources: result.sources })
  } catch (err) {
    return c.json(
      { error: `Discovery failed: ${err instanceof Error ? err.message : String(err)}` },
      500,
    )
  }
})

harnessRoutes.get("/plugin-status", async (c) => {
  if (!activeDirectory) {
    return c.json({ error: "activeDirectory not set" }, 400)
  }

  const agentParam = c.req.query("agent")
  if (!agentParam || !isValidDiscoveryHarness(agentParam)) {
    return c.json(
      { error: `agent query param required (one of: ${VALID_DISCOVERY_HARNESSES.join(", ")})` },
      400,
    )
  }

  c.header("Cache-Control", "no-store")

  if (agentParam !== "claude") {
    return c.json({ plugins: [] })
  }

  try {
    const plugins = await resolveEnabledClaudePlugins(activeDirectory)
    return c.json({ plugins })
  } catch (err) {
    return c.json(
      { error: `Plugin resolution failed: ${err instanceof Error ? err.message : String(err)}` },
      500,
    )
  }
})

harnessRoutes.post("/reload", (c) => {
  invalidateDiscoveryCache()
  return c.body(null, 204)
})

// --- Symlink management ---

interface SymlinkSpec {
  agent: string
  type: string
  link: string   // relative to project dir, e.g. ".claude/skills"
  target: string // relative to project dir, e.g. ".agents/skills"
}

const SYMLINK_SPECS: SymlinkSpec[] = [
  { agent: "claude", type: "skills",    link: ".claude/skills",   target: ".agents/skills" },
  { agent: "claude", type: "commands",  link: ".claude/commands", target: ".agents/commands" },
  { agent: "claude", type: "agents",    link: ".claude/agents",   target: ".agents/agents" },
  { agent: "claude", type: "rules",     link: ".claude/rules",    target: ".agents/rules" },
  { agent: "gemini", type: "skills",    link: ".gemini/skills",   target: ".agents/skills" },
  { agent: "gemini", type: "agents",    link: ".gemini/agents",   target: ".agents/agents" },
]

async function getSymlinkStatus(dir: string, spec: SymlinkSpec) {
  const linkPath = path.join(dir, spec.link)
  const expectedTarget = path.relative(path.dirname(linkPath), path.join(dir, spec.target))

  try {
    const linkStat = await fs.lstat(linkPath)
    if (!linkStat.isSymbolicLink()) {
      return { agent: spec.agent, type: spec.type, exists: true, correct: false, target: null, isSymlink: false }
    }
    const currentTarget = await fs.readlink(linkPath)
    const correct = currentTarget === expectedTarget
    return { agent: spec.agent, type: spec.type, exists: true, correct, target: currentTarget }
  } catch {
    return { agent: spec.agent, type: spec.type, exists: false, correct: false, target: null }
  }
}

harnessRoutes.get("/symlinks/status", async (c) => {
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  const statuses = await Promise.all(
    SYMLINK_SPECS.map((spec) => getSymlinkStatus(activeDirectory!, spec)),
  )

  return c.json(statuses)
})

harnessRoutes.post("/symlinks", async (c) => {
  if (!activeDirectory) {
    return c.json({ error: "No harness directory loaded" }, 400)
  }

  const results: Array<{ link: string; status: "created" | "exists" | "replaced" | "error"; error?: string }> = []

  for (const spec of SYMLINK_SPECS) {
    const linkPath = path.join(activeDirectory, spec.link)
    const expectedTarget = path.relative(path.dirname(linkPath), path.join(activeDirectory, spec.target))

    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(linkPath), { recursive: true })

      // Check current state
      try {
        const linkStat = await fs.lstat(linkPath)
        if (linkStat.isSymbolicLink()) {
          const currentTarget = await fs.readlink(linkPath)
          if (currentTarget === expectedTarget) {
            results.push({ link: spec.link, status: "exists" })
            continue
          }
          // Wrong target — remove and recreate
          await fs.unlink(linkPath)
          await fs.symlink(expectedTarget, linkPath, "dir")
          results.push({ link: spec.link, status: "replaced" })
          continue
        }
        // Exists but not a symlink — skip to avoid data loss
        results.push({ link: spec.link, status: "error", error: "Path exists and is not a symlink" })
        continue
      } catch {
        // Does not exist — create
      }

      await fs.symlink(expectedTarget, linkPath, "dir")
      results.push({ link: spec.link, status: "created" })
    } catch (err) {
      results.push({ link: spec.link, status: "error", error: err instanceof Error ? err.message : String(err) })
    }
  }

  return c.json(results)
})

export { harnessRoutes }
