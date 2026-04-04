import { Agent } from "@mariozechner/pi-agent-core"
import { getModel } from "@mariozechner/pi-ai"
import { pocTools } from "./tools"
import { buildSystemPrompt } from "./harness"
import { getActiveHarness } from "../routes/harness"

interface CreateAgentOptions {
  provider: "anthropic" | "openai"
  modelId: string
  apiKey: string
  systemPrompt?: string  // Optional: override system prompt (e.g., with harness)
}

export function createAgent({ provider, modelId, apiKey, systemPrompt }: CreateAgentOptions): Agent {
  const model = getModel(provider, modelId as any)

  // If no explicit systemPrompt, check for active harness
  const finalPrompt = systemPrompt ?? buildSystemPrompt(getActiveHarness())

  return new Agent({
    initialState: {
      systemPrompt: finalPrompt,
      model,
      tools: pocTools,
    },
    getApiKey: () => apiKey,
  })
}
