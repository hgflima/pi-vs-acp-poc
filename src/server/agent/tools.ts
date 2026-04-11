import { Type } from "@sinclair/typebox"
import type { AgentTool } from "@mariozechner/pi-agent-core"
import { execFile } from "child_process"
import { promisify } from "util"
import fs from "fs"
import path from "path"
import { PROJECT_HOME } from "../lib/project-home"

const execFileAsync = promisify(execFile)

// Canonicalize workspace root once at module load. All file tools are scoped here.
const WORKSPACE_ROOT = fs.realpathSync(PROJECT_HOME)

// Denylist of sensitive path segments. If any segment of the final resolved
// path (relative to the workspace root) matches, the operation is rejected.
const DENY_SEGMENTS = new Set([
  ".ssh",
  ".aws",
  ".config",
  ".gnupg",
  ".netrc",
  ".npmrc",
  ".git",
  ".env",
])

/**
 * Resolve a user-supplied path safely against WORKSPACE_ROOT.
 *
 * Guarantees:
 *  - The returned path is inside WORKSPACE_ROOT (or IS WORKSPACE_ROOT itself).
 *  - Symlinks are resolved via realpath when the target exists, so symlink
 *    escapes are caught. For non-existent targets, we canonicalize the parent
 *    and rebuild, still verifying containment.
 *  - No segment of the relative path matches DENY_SEGMENTS.
 *
 * Throws Error on any violation. Callers should catch and surface as tool
 * content errors (not rethrow) so the agent keeps running.
 */
async function safeResolve(userPath: string): Promise<string> {
  if (typeof userPath !== "string" || userPath.length === 0) {
    throw new Error("Path must be a non-empty string")
  }

  // Resolve against workspace root. If userPath is absolute this ignores root.
  const resolved = path.resolve(WORKSPACE_ROOT, userPath)

  // Canonicalize (follows symlinks) so symlink escapes out of the workspace
  // are caught. If the target does not exist, fall back to canonicalizing the
  // parent directory and re-joining the basename — this handles the "read a
  // file that does not exist yet" case while still symlink-checking the
  // parent chain. If even the parent does not exist, refuse.
  let canonical: string
  try {
    canonical = await fs.promises.realpath(resolved)
  } catch {
    try {
      const realParent = await fs.promises.realpath(path.dirname(resolved))
      canonical = path.join(realParent, path.basename(resolved))
    } catch {
      throw new Error("Path does not resolve: " + userPath)
    }
  }

  // Containment check: must be exactly WORKSPACE_ROOT or a descendant.
  const rootWithSep = WORKSPACE_ROOT.endsWith(path.sep)
    ? WORKSPACE_ROOT
    : WORKSPACE_ROOT + path.sep
  if (canonical !== WORKSPACE_ROOT && !canonical.startsWith(rootWithSep)) {
    throw new Error("Path escapes workspace: " + userPath)
  }

  // Denylist check on every segment of the relative path inside the workspace.
  const relative = path.relative(WORKSPACE_ROOT, canonical)
  if (relative.length > 0) {
    const segments = relative.split(path.sep)
    for (const seg of segments) {
      if (DENY_SEGMENTS.has(seg)) {
        throw new Error("Path is in denylist (sensitive segment '" + seg + "'): " + userPath)
      }
    }
  }

  return canonical
}

export const bashTool: AgentTool = {
  name: "bash",
  label: "Bash",
  description: "Execute a bash command and return its output",
  parameters: Type.Object({
    command: Type.String({ description: "The bash command to execute" }),
  }),
  execute: async (_toolCallId, params, signal) => {
    try {
      // Invoke /bin/bash explicitly via execFile with argv array and shell:false
      // (execFile's default). This removes Node's shell interpolation step and
      // the PATH lookup ambiguity of exec. The LLM can still run compound
      // commands because bash itself parses the `-c` argument.
      const { stdout, stderr } = await execFileAsync("/bin/bash", ["-c", params.command], {
        timeout: 30000,
        signal,
        maxBuffer: 1024 * 1024,
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

export const readFileTool: AgentTool = {
  name: "read_file",
  label: "Read File",
  description: "Read the contents of a file at the given path (scoped to workspace)",
  parameters: Type.Object({
    file_path: Type.String({ description: "Absolute or relative path to the file to read" }),
  }),
  execute: async (_toolCallId, params) => {
    try {
      const safe = await safeResolve(params.file_path)
      let content = await fs.promises.readFile(safe, "utf-8")
      if (content.length > 10240) {
        content = content.slice(0, 10240) + "\n\n... (output truncated)"
      }
      return {
        content: [{ type: "text" as const, text: content }],
        details: undefined,
      }
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: "Error reading file: " + err.message }],
        details: undefined,
      }
    }
  },
}

export const listFilesTool: AgentTool = {
  name: "list_files",
  label: "List Files",
  description: "List the contents of a directory (scoped to workspace)",
  parameters: Type.Object({
    directory: Type.String({ description: "Directory path to list" }),
    pattern: Type.Optional(Type.String({ description: "Glob pattern to filter (optional)" })),
  }),
  execute: async (_toolCallId, params) => {
    try {
      const safe = await safeResolve(params.directory)
      const files = await fs.promises.readdir(safe)
      return {
        content: [{ type: "text" as const, text: files.join("\n") }],
        details: undefined,
      }
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: "Error listing directory: " + err.message }],
        details: undefined,
      }
    }
  },
}

import { askUserQuestionTool } from "./ask-user-tool"

export const pocTools = [bashTool, readFileTool, listFilesTool, askUserQuestionTool]
