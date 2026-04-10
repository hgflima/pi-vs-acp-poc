import { access, constants } from "node:fs/promises"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { AcpAgentSpec } from "./acp-session"

const execFileP = promisify(execFile)

export type AcpAgentId = string
export type AcpAgentMap = Record<AcpAgentId, AcpAgentSpec>

const DEFAULT_AGENTS: AcpAgentMap = {
  "claude-acp": { command: "claude-agent-acp", args: [] },
  "codex-acp": { command: "codex-acp", args: [] },
}

const CONFIG_PATH = path.join(process.cwd(), ".harn", "config", "acp-agents.json")

function parseEnvMap(raw: string | undefined): AcpAgentMap | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AcpAgentMap
    if (parsed && typeof parsed === "object") return parsed
  } catch {
    console.warn("[acp-agents] ACP_AGENTS_JSON is invalid JSON, ignoring")
  }
  return null
}

function parseFileMap(filePath: string): AcpAgentMap | null {
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, "utf8")
    const parsed = JSON.parse(raw) as AcpAgentMap
    if (parsed && typeof parsed === "object") return parsed
  } catch (err) {
    console.warn(`[acp-agents] failed to parse ${filePath}:`, err)
  }
  return null
}

let cachedAgents: AcpAgentMap | null = null

export function loadAcpAgents(): AcpAgentMap {
  if (cachedAgents) return cachedAgents
  const fromEnv = parseEnvMap(process.env.ACP_AGENTS_JSON)
  if (fromEnv) {
    cachedAgents = fromEnv
    return fromEnv
  }
  const fromFile = parseFileMap(CONFIG_PATH)
  if (fromFile) {
    cachedAgents = fromFile
    return fromFile
  }
  cachedAgents = DEFAULT_AGENTS
  return DEFAULT_AGENTS
}

export function getAcpAgent(id: AcpAgentId): AcpAgentSpec | undefined {
  return loadAcpAgents()[id]
}

// Resolve `command` to absolute path via `which`, or verify fs.access on absolute paths
async function resolveCommand(cmd: string): Promise<boolean> {
  if (path.isAbsolute(cmd)) {
    try {
      await access(cmd, constants.X_OK)
      return true
    } catch {
      return false
    }
  }
  try {
    const { stdout } = await execFileP("which", [cmd])
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

export async function isAcpAgentAvailable(id: AcpAgentId): Promise<boolean> {
  const spec = getAcpAgent(id)
  if (!spec) return false
  return resolveCommand(spec.command)
}

export async function getAcpAgentsStatus(): Promise<Record<AcpAgentId, boolean>> {
  const agents = loadAcpAgents()
  const entries = await Promise.all(
    Object.keys(agents).map(async (id) => [id, await isAcpAgentAvailable(id)] as const),
  )
  return Object.fromEntries(entries)
}
