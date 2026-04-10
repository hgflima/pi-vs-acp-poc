import { Hono } from "hono"
import { getAcpAgentsStatus } from "../agent/acp-agents"

const runtimeRoutes = new Hono()

runtimeRoutes.get("/acp/status", async (c) => {
  const status = await getAcpAgentsStatus()
  return c.json(status)
})

export { runtimeRoutes }
