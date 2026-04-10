import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { hasAnyCredential } from "../lib/credentials"
import { writeRuntimeEventToSSE } from "../lib/runtime-sse"
import { PiRuntime } from "../agent/pi-runtime"
import { getAcpAgent } from "../agent/acp-agents"
import * as acpRegistry from "../agent/acp-session-registry"
import type { AgentMessage } from "@mariozechner/pi-agent-core"

type Provider = "anthropic" | "openai"

interface ChatBodyBase {
  message: unknown
  history?: unknown
  runtime?: unknown
}
interface PiChatBody extends ChatBodyBase {
  runtime?: "pi"
  provider: Provider
  model: string
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
  return {
    ok: true,
    body: {
      runtime: "pi",
      message: b.message,
      history: b.history,
      provider: b.provider,
      model: b.model,
    },
  }
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
    const message = body.message as string
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
  const message = body.message as string

  return streamSSE(c, async (stream) => {
    const controller = new AbortController()
    stream.onAbort(() => controller.abort())

    try {
      for await (const ev of runtime.prompt({
        message,
        history,
        signal: controller.signal,
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

export { chatRoutes }
