import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { hasAnyCredential } from "../lib/credentials"
import { writeRuntimeEventToSSE } from "../lib/runtime-sse"
import { PiRuntime } from "../agent/pi-runtime"
import { getAcpAgent } from "../agent/acp-agents"
import * as acpRegistry from "../agent/acp-session-registry"
import { hasPending, resolvePrompt, type PromptOutcome } from "../agent/permission-bridge"
import { PROJECT_HOME } from "../lib/project-home"
import type { AgentMessage } from "@mariozechner/pi-agent-core"

type Provider = "anthropic" | "openai"

interface AttachmentBody {
  content: string
  filename: string
  mimeType: string
}

interface ChatBodyBase {
  message: unknown
  history?: unknown
  runtime?: unknown
  fileRefs?: string[]
  attachments?: AttachmentBody[]
}
interface PiChatBody extends ChatBodyBase {
  runtime?: "pi"
  provider: Provider
  model: string
  chatSessionId: string
}
interface AcpChatBody extends ChatBodyBase {
  runtime: "acp"
  acpAgent: string
  chatId: string
}

type ValidationError = { code: number; message: string }

function validateChatBody(raw: unknown):
  | { ok: true; body: PiChatBody | AcpChatBody }
  | { ok: false; error: ValidationError } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: { code: 400, message: "body must be an object" } }
  }
  const b = raw as Record<string, unknown>
  if (typeof b.message !== "string" || b.message.length === 0) {
    return { ok: false, error: { code: 400, message: "message required (string)" } }
  }
  // Parse optional fileRefs
  let fileRefs: string[] | undefined
  if (b.fileRefs !== undefined) {
    if (!Array.isArray(b.fileRefs) || b.fileRefs.length > 5) {
      return { ok: false, error: { code: 400, message: "fileRefs must be an array of max 5 strings" } }
    }
    for (const ref of b.fileRefs) {
      if (typeof ref !== "string") continue
      if (ref.includes("..") || path.isAbsolute(ref)) {
        return { ok: false, error: { code: 400, message: `Invalid file ref: ${ref}` } }
      }
    }
    fileRefs = b.fileRefs.filter((r): r is string => typeof r === "string")
  }
  // Parse optional attachments
  let attachments: AttachmentBody[] | undefined
  if (b.attachments !== undefined) {
    if (!Array.isArray(b.attachments) || b.attachments.length > 10) {
      return { ok: false, error: { code: 400, message: "attachments must be an array of max 10 items" } }
    }
    attachments = []
    for (const att of b.attachments) {
      if (!att || typeof att !== "object") continue
      const a = att as Record<string, unknown>
      if (typeof a.content !== "string" || typeof a.filename !== "string" || typeof a.mimeType !== "string") {
        return { ok: false, error: { code: 400, message: "Each attachment must have content, filename, and mimeType" } }
      }
      attachments.push({ content: a.content as string, filename: a.filename as string, mimeType: a.mimeType as string })
    }
  }
  const runtime = b.runtime ?? "pi"
  if (runtime !== "pi" && runtime !== "acp") {
    return { ok: false, error: { code: 400, message: "runtime must be \"pi\" or \"acp\"" } }
  }
  if (runtime === "acp") {
    if (typeof b.acpAgent !== "string" || b.acpAgent.length === 0) {
      return { ok: false, error: { code: 400, message: "acpAgent required when runtime=\"acp\"" } }
    }
    if (typeof b.chatId !== "string" || b.chatId.length === 0) {
      return { ok: false, error: { code: 400, message: "chatId required when runtime=\"acp\"" } }
    }
    return {
      ok: true,
      body: {
        runtime: "acp",
        message: b.message,
        acpAgent: b.acpAgent,
        chatId: b.chatId,
        fileRefs,
        attachments,
      },
    }
  }
  // runtime === "pi"
  if (b.provider !== "anthropic" && b.provider !== "openai") {
    return { ok: false, error: { code: 400, message: "provider required when runtime=\"pi\" (\"anthropic\"|\"openai\")" } }
  }
  if (typeof b.model !== "string" || b.model.length === 0) {
    return { ok: false, error: { code: 400, message: "model required when runtime=\"pi\"" } }
  }
  if (typeof b.chatSessionId !== "string" || b.chatSessionId.trim() === "") {
    return { ok: false, error: { code: 400, message: "chatSessionId required when runtime=\"pi\"" } }
  }
  return {
    ok: true,
    body: {
      runtime: "pi",
      message: b.message,
      history: b.history,
      provider: b.provider,
      model: b.model,
      chatSessionId: b.chatSessionId,
      fileRefs,
      attachments,
    },
  }
}

const MAX_FILE_REF_SIZE = 100 * 1024 // 100KB per file

function isPathSafe(filePath: string): boolean {
  // Reject absolute paths and directory traversal
  if (path.isAbsolute(filePath)) return false
  if (filePath.includes("..")) return false
  // Reject null bytes
  if (filePath.includes("\0")) return false
  return true
}

function formatAttachments(attachments: AttachmentBody[]): string {
  const parts: string[] = []
  for (const att of attachments) {
    if (att.mimeType.startsWith("image/")) {
      parts.push(`--- Attachment: ${att.filename} (${att.mimeType}) ---\n[Image attachment: ${att.filename}]\nBase64 data: ${att.content}\n--- End attachment ---`)
    } else {
      parts.push(`--- Attachment: ${att.filename} (${att.mimeType}) ---\n${att.content}\n--- End attachment ---`)
    }
  }
  return parts.join("\n\n")
}

async function resolveFileRefs(refs: string[]): Promise<string> {
  const cwd = process.cwd()
  const parts: string[] = []

  for (const ref of refs) {
    if (!isPathSafe(ref)) continue
    const fullPath = path.resolve(cwd, ref)
    // Double-check resolved path is within cwd
    if (!fullPath.startsWith(cwd + path.sep) && fullPath !== cwd) continue
    try {
      const stat = await fs.stat(fullPath)
      if (stat.size > MAX_FILE_REF_SIZE) continue
      const content = await fs.readFile(fullPath, "utf-8")
      parts.push(`--- File: ${ref} ---\n${content}\n--- End file ---`)
    } catch {
      // File not found or unreadable — skip silently
    }
  }

  return parts.join("\n\n")
}

const chatRoutes = new Hono()

chatRoutes.post("/", async (c) => {
  const raw = await c.req.json()
  const result = validateChatBody(raw)
  if (!result.ok) {
    return c.json({ error: result.error.message }, 400)
  }
  const body = result.body

  if (body.runtime === "acp") {
    const spec = getAcpAgent(body.acpAgent)
    if (!spec) {
      return c.json({ error: `unknown acpAgent: ${body.acpAgent}` }, 400)
    }
    try {
      await acpRegistry.getOrCreate(body.chatId, body.acpAgent, spec)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: `failed to start acp session: ${message}` }, 500)
    }
    const chatId = body.chatId
    let message = body.message as string
    if (body.fileRefs && body.fileRefs.length > 0) {
      const fileContext = await resolveFileRefs(body.fileRefs)
      if (fileContext) message = `${fileContext}\n\n${message}`
    }
    if (body.attachments && body.attachments.length > 0) {
      const attContext = formatAttachments(body.attachments)
      if (attContext) message = `${attContext}\n\n${message}`
    }
    return streamSSE(c, async (stream) => {
      const controller = new AbortController()
      stream.onAbort(() => controller.abort())
      try {
        await acpRegistry.runExclusive(chatId, async (session) => {
          for await (const ev of session.prompt(message, controller.signal)) {
            await writeRuntimeEventToSSE(ev, stream)
          }
        })
      } catch (err) {
        try {
          await writeRuntimeEventToSSE(
            { type: "error", message: err instanceof Error ? err.message : String(err) },
            stream,
          )
          await writeRuntimeEventToSSE({ type: "done" }, stream)
        } catch {
          /* stream closed */
        }
      }
    })
  }

  // runtime === "pi"
  if (!hasAnyCredential(body.provider)) {
    return c.json({ error: "Not authenticated" }, 401)
  }
  const runtime = new PiRuntime({ provider: body.provider, modelId: body.model })
  const history = Array.isArray(body.history) ? (body.history as AgentMessage[]) : undefined
  let message = body.message as string
  if (body.fileRefs && body.fileRefs.length > 0) {
    const fileContext = await resolveFileRefs(body.fileRefs)
    if (fileContext) message = `${fileContext}\n\n${message}`
  }
  if (body.attachments && body.attachments.length > 0) {
    const attContext = formatAttachments(body.attachments)
    if (attContext) message = `${attContext}\n\n${message}`
  }

  return streamSSE(c, async (stream) => {
    const controller = new AbortController()
    stream.onAbort(() => controller.abort())

    try {
      for await (const ev of runtime.prompt({
        message,
        history,
        signal: controller.signal,
        chatSessionId: body.chatSessionId,
      })) {
        await writeRuntimeEventToSSE(ev, stream)
      }
    } catch (err) {
      try {
        await writeRuntimeEventToSSE(
          { type: "error", message: err instanceof Error ? err.message : String(err) },
          stream,
        )
        await writeRuntimeEventToSSE({ type: "done" }, stream)
      } catch {
        /* stream closed */
      }
    }
  })
})

chatRoutes.delete("/session/:chatId", async (c) => {
  const chatId = c.req.param("chatId")
  await acpRegistry.close(chatId)
  return c.json({ ok: true })
})

chatRoutes.post("/respond", async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ error: "invalid json" }, 400)
  }
  if (!raw || typeof raw !== "object") {
    return c.json({ error: "expected { id, response }" }, 400)
  }
  const { id, response } = raw as { id?: unknown; response?: unknown }
  if (typeof id !== "string" || response == null || typeof response !== "object") {
    return c.json({ error: "expected { id: string, response: object }" }, 400)
  }
  if (!hasPending(id)) {
    return c.json({ error: "prompt not found" }, 404)
  }
  const resolved = resolvePrompt(id, response as PromptOutcome)
  if (!resolved) {
    return c.json({ error: "invalid response shape" }, 400)
  }
  return c.json({ ok: true })
})

export { chatRoutes }
