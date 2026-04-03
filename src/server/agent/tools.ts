import { Type } from "@sinclair/typebox"
import type { AgentTool } from "@mariozechner/pi-agent-core"
import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs"

const execAsync = promisify(exec)

export const bashTool: AgentTool = {
  name: "bash",
  label: "Bash",
  description: "Execute a bash command and return its output",
  parameters: Type.Object({
    command: Type.String({ description: "The bash command to execute" }),
  }),
  execute: async (_toolCallId, params, signal) => {
    try {
      const { stdout, stderr } = await execAsync(params.command, {
        timeout: 30000,
        signal,
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
  description: "Read the contents of a file at the given path",
  parameters: Type.Object({
    file_path: Type.String({ description: "Absolute or relative path to the file to read" }),
  }),
  execute: async (_toolCallId, params) => {
    try {
      let content = await fs.promises.readFile(params.file_path, "utf-8")
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
  description: "List the contents of a directory",
  parameters: Type.Object({
    directory: Type.String({ description: "Directory path to list" }),
    pattern: Type.Optional(Type.String({ description: "Glob pattern to filter (optional)" })),
  }),
  execute: async (_toolCallId, params) => {
    try {
      const files = await fs.promises.readdir(params.directory)
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

export const pocTools = [bashTool, readFileTool, listFilesTool]
