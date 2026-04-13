import fs from "fs/promises"
import path from "path"

const MAX_FILE_SIZE = 100 * 1024 // 100KB per file

export interface HarnessFile {
  content: string
  size: number
}

export interface HarnessDir {
  count: number
  names: string[]
}

export interface HarnessResult {
  claudeMd: HarnessFile | null
  agentsMd: HarnessFile | null
  skills: HarnessDir | null
  commands: HarnessDir | null
  rules: HarnessDir | null
  hooks: HarnessDir | null
  subagents: HarnessDir | null
  errors: Array<{ file: string; error: string }>
}

export async function discoverHarness(dirPath: string): Promise<HarnessResult> {
  const result: HarnessResult = {
    claudeMd: null,
    agentsMd: null,
    skills: null,
    commands: null,
    rules: null,
    hooks: null,
    subagents: null,
    errors: [],
  }

  // Read known markdown files
  for (const [key, relPath] of [
    ["claudeMd", "CLAUDE.md"],
    ["agentsMd", "AGENTS.md"],
  ] as const) {
    const fullPath = path.join(dirPath, relPath)
    try {
      const stat = await fs.stat(fullPath)
      if (stat.size > MAX_FILE_SIZE) {
        result.errors.push({
          file: relPath,
          error: `File too large (${Math.round(stat.size / 1024)} KB, max 100 KB)`,
        })
        continue
      }
      const content = await fs.readFile(fullPath, "utf-8")
      result[key] = { content, size: stat.size }
    } catch {
      // File not found is not an error, just absent
    }
  }

  // Check for skills directory
  const skillsDir = path.join(dirPath, ".claude", "skills")
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true })
    const skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    if (skillDirs.length > 0) {
      result.skills = { count: skillDirs.length, names: skillDirs }
    }
  } catch {
    // Directory not found
  }

  // Check for commands directory
  const commandsDir = path.join(dirPath, ".claude", "commands")
  try {
    const entries = await fs.readdir(commandsDir, { withFileTypes: true })
    const commandFiles = entries.filter((e) => e.isFile()).map((e) => e.name)
    if (commandFiles.length > 0) {
      result.commands = { count: commandFiles.length, names: commandFiles }
    }
  } catch {
    // Directory not found
  }

  // Check for rules directory
  const rulesDir = path.join(dirPath, ".claude", "rules")
  try {
    const entries = await fs.readdir(rulesDir, { withFileTypes: true })
    const ruleFiles = entries.filter((e) => e.isFile()).map((e) => e.name)
    if (ruleFiles.length > 0) {
      result.rules = { count: ruleFiles.length, names: ruleFiles }
    }
  } catch {
    // Directory not found
  }

  // Check for hooks directory
  const hooksDir = path.join(dirPath, ".claude", "hooks")
  try {
    const entries = await fs.readdir(hooksDir, { withFileTypes: true })
    const hookFiles = entries.filter((e) => e.isFile()).map((e) => e.name)
    if (hookFiles.length > 0) {
      result.hooks = { count: hookFiles.length, names: hookFiles }
    }
  } catch {
    // Directory not found
  }

  // Check for subagents directory
  const subagentsDir = path.join(dirPath, ".claude", "subagents")
  try {
    const entries = await fs.readdir(subagentsDir, { withFileTypes: true })
    const subagentDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    if (subagentDirs.length > 0) {
      result.subagents = { count: subagentDirs.length, names: subagentDirs }
    }
  } catch {
    // Directory not found
  }

  return result
}

const BASE_SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. You can run bash commands, read files, and list directory contents. Use these tools when the user asks you to interact with the filesystem or run commands. Always use tools rather than guessing about file contents or command outputs."

export function buildSystemPrompt(harness: HarnessResult | null): string {
  if (!harness) return BASE_SYSTEM_PROMPT

  let prompt = BASE_SYSTEM_PROMPT

  if (harness.claudeMd) {
    prompt += "\n\n## Project Instructions (CLAUDE.md)\n\n" + harness.claudeMd.content
  }
  if (harness.agentsMd) {
    prompt += "\n\n## Agents Configuration (AGENTS.md)\n\n" + harness.agentsMd.content
  }
  // Skills: list names (for POC, just informational)
  if (harness.skills && harness.skills.names.length > 0) {
    prompt += "\n\n## Available Skills\n\n" + harness.skills.names.map((s) => `- ${s}`).join("\n")
  }
  // Commands: list names
  if (harness.commands && harness.commands.names.length > 0) {
    prompt += "\n\n## Available Commands\n\n" + harness.commands.names.map((c) => `- ${c}`).join("\n")
  }
  // Rules: list names
  if (harness.rules && harness.rules.names.length > 0) {
    prompt += "\n\n## Active Rules\n\n" + harness.rules.names.map((r) => `- ${r}`).join("\n")
  }
  // Hooks: informational only (list names, don't execute)
  if (harness.hooks && harness.hooks.names.length > 0) {
    prompt += "\n\n## Available Hooks\n\n" + harness.hooks.names.map((h) => `- ${h}`).join("\n")
  }
  // Subagents: list names
  if (harness.subagents && harness.subagents.names.length > 0) {
    prompt += "\n\n## Available Subagents\n\n" + harness.subagents.names.map((s) => `- ${s}`).join("\n")
  }

  return prompt
}
