import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { createAgent } from "../agent/setup"
import { adaptAgentEvents } from "../lib/stream-adapter"
import { hasAnyCredential } from "../lib/credentials"

const chatRoutes = new Hono()

chatRoutes.post("/", async (c) => {
  const { message, model, provider } = await c.req.json<{
    message: string
    model: string
    provider: "anthropic" | "openai"
    history?: Array<{ role: string; content: string }>
  }>()

  if (!hasAnyCredential(provider)) {
    return c.json({ error: "Not authenticated" }, 401)
  }

  return streamSSE(c, async (stream) => {
    const agent = createAgent({ provider, modelId: model })

    const done = new Promise<void>((resolve) => {
      const unsubscribe = adaptAgentEvents({ agent, stream, onDone: resolve })

      stream.onAbort(() => {
        agent.abort()
        unsubscribe()
        resolve()
      })
    })

    // Start the agent loop -- events flow through subscribe callback
    agent.prompt(message).catch(async (err) => {
      try {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: err.message || "Agent error" }),
        })
      } catch {
        // Stream already closed
      }
    })

    await done // Anchor: keeps stream open
  })
})

export { chatRoutes }
