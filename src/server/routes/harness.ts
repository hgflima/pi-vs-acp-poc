import { Hono } from "hono"
import path from "path"
import fs from "fs/promises"
import { discoverHarness } from "../agent/harness"
import type { HarnessResult } from "../agent/harness"

const harnessRoutes = new Hono()

// In-memory harness storage (D-13: no file watching, persists until next load or restart)
let activeHarness: HarnessResult | null = null

export function getActiveHarness() {
  return activeHarness
}

harnessRoutes.post("/load", async (c) => {
  const { directory } = await c.req.json<{ directory: string }>()

  if (!directory || typeof directory !== "string") {
    return c.json({ error: "Directory path required" }, 400)
  }

  if (!path.isAbsolute(directory)) {
    return c.json({ error: "Absolute directory path required" }, 400)
  }

  // Validate directory exists
  try {
    const stat = await fs.stat(directory)
    if (!stat.isDirectory()) {
      return c.json({ error: "Path is not a directory" }, 400)
    }
  } catch {
    return c.json({ error: "Directory not found. Check the path and try again." }, 404)
  }

  const result = await discoverHarness(directory)

  // Store in memory (D-13)
  activeHarness = result

  return c.json(result)
})

harnessRoutes.get("/status", (c) => {
  return c.json({
    applied: activeHarness !== null,
    hasClaudeMd: activeHarness?.claudeMd !== null,
    hasAgentsMd: activeHarness?.agentsMd !== null,
    skillCount: activeHarness?.skills?.count ?? 0,
    hookCount: activeHarness?.hooks?.count ?? 0,
  })
})

harnessRoutes.post("/clear", (c) => {
  activeHarness = null
  return c.json({ status: "ok" })
})

export { harnessRoutes }
