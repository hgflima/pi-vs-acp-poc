import { Hono } from "hono"
import {
  DEFAULT_PI_MODES,
  getMode,
  setMode,
} from "../agent/session-mode"

const piRoutes = new Hono()

// Expose the mode state + mutations for a PI chat session. PI is server-side
// stateless per request, so mode is kept in a process-local map (session-mode.ts)
// keyed by chatSessionId supplied by the client.

piRoutes.get("/:chatSessionId/mode", (c) => {
  const chatSessionId = c.req.param("chatSessionId")
  return c.json({
    availableModes: DEFAULT_PI_MODES,
    currentModeId: getMode(chatSessionId),
  })
})

piRoutes.post("/:chatSessionId/mode", async (c) => {
  const chatSessionId = c.req.param("chatSessionId")
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ error: "invalid json" }, 400)
  }
  if (!raw || typeof raw !== "object") {
    return c.json({ error: "expected { modeId }" }, 400)
  }
  const { modeId } = raw as { modeId?: unknown }
  if (typeof modeId !== "string" || modeId.length === 0) {
    return c.json({ error: "modeId required (string)" }, 400)
  }
  try {
    setMode(chatSessionId, modeId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 400)
  }
  return c.json({ ok: true, currentModeId: modeId })
})

export { piRoutes }
