import { Hono } from "hono"
import * as acpRegistry from "../agent/acp-session-registry"

const acpRoutes = new Hono()

acpRoutes.post("/:chatId/mode", async (c) => {
  const chatId = c.req.param("chatId")
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ error: "invalid json" }, 400)
  }
  if (!raw || typeof raw !== "object") {
    return c.json({ error: "expected { modeId: string }" }, 400)
  }
  const { modeId } = raw as { modeId?: unknown }
  if (typeof modeId !== "string" || modeId.length === 0) {
    return c.json({ error: "modeId required (string)" }, 400)
  }
  if (!acpRegistry.has(chatId)) {
    return c.json({ error: "no acp session for chatId" }, 404)
  }
  try {
    await acpRegistry.runExclusive(chatId, async (session) => {
      await session.setMode(modeId)
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: `setMode failed: ${message}` }, 500)
  }
  return c.json({ ok: true })
})

export { acpRoutes }
