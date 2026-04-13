import fs from "fs/promises"
import path from "path"

// Mapping: canonical .agents/ type → derived paths per agent
export const AGENT_FILE_MAP = {
  skills: {
    claude: (name: string) => `.claude/skills/${name}/SKILL.md`,
    gemini: (name: string) => `.gemini/skills/${name}/SKILL.md`,
  },
  commands: {
    claude: (name: string) => `.claude/commands/${name}.md`,
    gemini: (name: string) => `.gemini/commands/${name}.toml`,
  },
  rules: {
    claude: (name: string) => `.claude/rules/${name}.md`,
    gemini: (name: string) => `.gemini/policies/${name}.toml`,
  },
  subagents: {
    claude: (name: string) => `.claude/agents/${name}.md`,
  },
  hooks: {
    claude: () => `.claude/settings.json`,
  },
} as const

// Simple YAML frontmatter extraction
function extractFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }

  const fm: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (key) fm[key] = val
  }

  return { frontmatter: fm, body: match[2] }
}

// Convert markdown command/rule to simple TOML format for Gemini
function mdToToml(content: string, type: "command" | "rule"): string {
  const { frontmatter, body } = extractFrontmatter(content)

  const lines: string[] = []

  if (type === "command") {
    lines.push(`[command]`)
    if (frontmatter.name) lines.push(`name = "${frontmatter.name}"`)
    if (frontmatter.description) lines.push(`description = "${frontmatter.description}"`)
    lines.push(``)
    lines.push(`[command.content]`)
    lines.push(`text = """`)
    lines.push(body.trim())
    lines.push(`"""`)
  } else {
    lines.push(`[policy]`)
    if (frontmatter.name) lines.push(`name = "${frontmatter.name}"`)
    if (frontmatter.description) lines.push(`description = "${frontmatter.description}"`)
    lines.push(``)
    lines.push(`[policy.content]`)
    lines.push(`text = """`)
    lines.push(body.trim())
    lines.push(`"""`)
  }

  return lines.join("\n") + "\n"
}

// Merge hooks.json into .claude/settings.json
async function mergeHooksToSettings(dir: string): Promise<void> {
  const hooksPath = path.join(dir, ".agents", "hooks.json")
  const settingsPath = path.join(dir, ".claude", "settings.json")

  const hooksContent = await fs.readFile(hooksPath, "utf-8")
  const hooks = JSON.parse(hooksContent)

  let settings: Record<string, unknown> = {}
  try {
    const settingsContent = await fs.readFile(settingsPath, "utf-8")
    settings = JSON.parse(settingsContent)
  } catch {
    // Settings file doesn't exist — start fresh
  }

  settings.hooks = hooks
  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8")
}

export interface SyncResult {
  success: boolean
  conversions: Array<{
    agent: string
    targetPath: string
    status: "created" | "skipped" | "error"
    error?: string
  }>
}

export async function syncItem(dir: string, type: string, name: string): Promise<SyncResult> {
  const result: SyncResult = { success: true, conversions: [] }

  // Special case: hooks
  if (type === "hooks") {
    try {
      await mergeHooksToSettings(dir)
      result.conversions.push({
        agent: "claude",
        targetPath: ".claude/settings.json",
        status: "created",
      })
    } catch (err) {
      result.success = false
      result.conversions.push({
        agent: "claude",
        targetPath: ".claude/settings.json",
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return result
  }

  const typeMap = AGENT_FILE_MAP[type as keyof typeof AGENT_FILE_MAP]
  if (!typeMap) {
    return { success: false, conversions: [{ agent: "unknown", targetPath: "", status: "error", error: `Unknown type: ${type}` }] }
  }

  // Read canonical source
  let canonicalPath: string
  let canonicalContent: string
  try {
    if (type === "skills") {
      canonicalPath = path.join(dir, ".agents", "skills", name, "SKILL.md")
    } else if (type === "subagents") {
      canonicalPath = path.join(dir, ".agents", "agents", `${name}.md`)
    } else {
      canonicalPath = path.join(dir, ".agents", type, `${name}.md`)
    }
    canonicalContent = await fs.readFile(canonicalPath, "utf-8")
  } catch {
    return { success: false, conversions: [{ agent: "canonical", targetPath: canonicalPath!, status: "error", error: "Source file not found" }] }
  }

  // Process each agent target
  for (const [agent, pathFn] of Object.entries(typeMap)) {
    const relativePath = (pathFn as (n: string) => string)(name)
    const targetPath = path.join(dir, relativePath)

    try {
      // Determine if conversion is needed
      const needsConversion = relativePath.endsWith(".toml")

      let targetContent: string
      if (needsConversion && type === "commands") {
        targetContent = mdToToml(canonicalContent, "command")
      } else if (needsConversion && type === "rules") {
        targetContent = mdToToml(canonicalContent, "rule")
      } else {
        // Direct copy (symlinked directories handle this, but write anyway for safety)
        targetContent = canonicalContent
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, targetContent, "utf-8")
      result.conversions.push({ agent, targetPath: relativePath, status: "created" })
    } catch (err) {
      result.success = false
      result.conversions.push({
        agent,
        targetPath: relativePath,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
