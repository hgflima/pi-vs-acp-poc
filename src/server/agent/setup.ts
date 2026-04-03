import { Agent } from "@mariozechner/pi-agent-core"
import { getModel } from "@mariozechner/pi-ai"

interface CreateAgentOptions {
  provider: "anthropic" | "openai"
  modelId: string
  apiKey: string
}

export function createAgent({ provider, modelId, apiKey }: CreateAgentOptions): Agent {
  const model = getModel(provider, modelId as any)

  return new Agent({
    initialState: {
      systemPrompt: "You are a helpful assistant.",
      model,
      tools: [],
    },
    getApiKey: () => apiKey,
  })
}
