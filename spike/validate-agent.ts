/**
 * Pi-agent-core validation spike.
 *
 * Validates Agent creation, event subscription, stream lifecycle (text_delta,
 * tool events, done), and at least 1 tool execution using a real Anthropic
 * API key from the environment.
 *
 * Run: ANTHROPIC_API_KEY=sk-... npx tsx spike/validate-agent.ts
 */

import { Agent } from "@mariozechner/pi-agent-core"
import type { AgentTool } from "@mariozechner/pi-agent-core"
import { getModel, streamSimple, Type } from "@mariozechner/pi-ai"

// ---------------------------------------------------------------------------
// 0. Validate environment
// ---------------------------------------------------------------------------

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error("[spike] FAIL: Set ANTHROPIC_API_KEY env var")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. Define a test tool
// ---------------------------------------------------------------------------

const echoParams = Type.Object({
  message: Type.String({ description: "Message to echo" }),
})

const echoTool: AgentTool<typeof echoParams> = {
  name: "echo",
  label: "Echo",
  description: "Echoes back the given message. You MUST use this tool when asked to echo something.",
  parameters: echoParams,
  execute: async (_toolCallId, params, _signal, _onUpdate) => {
    return {
      content: [{ type: "text", text: `Echo: ${params.message}` }],
      details: {},
    }
  },
}

// ---------------------------------------------------------------------------
// 2. Create Agent with API key injection via getApiKey callback
// ---------------------------------------------------------------------------

const model = getModel("anthropic", "claude-haiku-4-5")

const agent = new Agent({
  initialState: {
    systemPrompt:
      "You have an echo tool. Use it to echo 'hello world'. Do not say anything before using the tool.",
    model,
    tools: [echoTool],
    thinkingLevel: "off",
  },
  streamFn: streamSimple,
  getApiKey: (_provider) => apiKey,
})

// ---------------------------------------------------------------------------
// 3. Subscribe to events and collect event types
// ---------------------------------------------------------------------------

const events: string[] = []

agent.subscribe((event) => {
  events.push(event.type)

  switch (event.type) {
    case "agent_start":
      console.log("[spike] Agent started")
      break

    case "message_update":
      if (event.assistantMessageEvent?.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta)
      }
      break

    case "tool_execution_start":
      console.log(
        `\n[spike] Tool: ${event.toolName}(${JSON.stringify(event.args)})`
      )
      break

    case "tool_execution_end":
      console.log(`[spike] Tool result: ${event.isError ? "ERROR" : "OK"}`)
      break

    case "agent_end":
      console.log("\n[spike] Agent finished")
      break
  }
})

// ---------------------------------------------------------------------------
// 4. Run the prompt
// ---------------------------------------------------------------------------

try {
  await agent.prompt("Please use the echo tool to echo 'hello world'")
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\n[spike] FAIL: Agent prompt threw: ${message}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 5. Verify lifecycle -- all required events must have been observed
// ---------------------------------------------------------------------------

const required = [
  "agent_start",
  "tool_execution_start",
  "tool_execution_end",
  "agent_end",
]

const missing = required.filter((e) => !events.includes(e))

if (missing.length > 0) {
  console.error(`[spike] FAIL: Missing events: ${missing.join(", ")}`)
  console.error(`[spike] Observed events: ${events.join(" -> ")}`)
  process.exit(1)
}

console.log("[spike] PASS: All required events observed")
console.log(`[spike] Event sequence: ${events.join(" -> ")}`)
