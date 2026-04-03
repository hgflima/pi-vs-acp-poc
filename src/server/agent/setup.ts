import { Agent } from "@mariozechner/pi-agent-core"
import { getModel } from "@mariozechner/pi-ai"
import { pocTools } from "./tools"

interface CreateAgentOptions {
  provider: "anthropic" | "openai"
  modelId: string
  apiKey: string
}

export function createAgent({ provider, modelId, apiKey }: CreateAgentOptions): Agent {
  const model = getModel(provider, modelId as any)

  return new Agent({
    initialState: {
      systemPrompt: "You are a helpful assistant with access to tools. You can run bash commands, read files, and list directory contents. Use these tools when the user asks you to interact with the filesystem or run commands. Always use tools rather than guessing about file contents or command outputs.",
      model,
      tools: pocTools,
    },
    getApiKey: () => apiKey,
  })
}
