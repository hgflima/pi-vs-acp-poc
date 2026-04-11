import { Type } from "@sinclair/typebox"
import type { AgentTool } from "@mariozechner/pi-agent-core"
import type { ElicitationSchema } from "@agentclientprotocol/sdk"
import { requestElicitation } from "./permission-bridge"
import { piRuntimeStore } from "./pi-runtime-context"

// Tool that lets the agent ask the user a structured question via the
// ACP elicitation bridge. The `requestedSchema` is an ACP ElicitationSchema
// (a JSON-Schema-ish object with primitive properties). We keep its runtime
// shape loose (Type.Any) because the LLM constructs it — validation lives
// on the client that renders the prompt.
export const askUserQuestionTool: AgentTool = {
  name: "askUserQuestion",
  label: "Ask User",
  description:
    "Ask the user a structured question. Use when you need input that the " +
    "user must provide (clarification, a choice, missing details). The " +
    "`message` is shown to the user; `requestedSchema` is a JSON Schema " +
    "(type: object) describing the fields you want back. Supported field " +
    "types: string, number, integer, boolean, enum. Returns the user's " +
    "response serialized as JSON.",
  parameters: Type.Object({
    message: Type.String({
      description: "The question or instruction shown to the user.",
    }),
    requestedSchema: Type.Any({
      description:
        "ACP ElicitationSchema: a JSON Schema object with primitive " +
        "properties describing the response shape.",
    }),
  }),
  execute: async (_toolCallId, params, signal) => {
    const ctx = piRuntimeStore.getStore()
    if (!ctx) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              "askUserQuestion failed: PiRuntime context unavailable " +
              "(tool invoked outside of a PiRuntime prompt — no client to render the elicitation form)",
          },
        ],
        details: undefined,
      }
    }
    const requestedSchema = params.requestedSchema as ElicitationSchema
    try {
      const response = await requestElicitation(
        params.message,
        requestedSchema,
        signal,
        (id) => {
          ctx.push({
            type: "elicitation_request",
            id,
            message: params.message,
            requestedSchema,
          })
        },
      )
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response) },
        ],
        details: undefined,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [
          { type: "text" as const, text: "askUserQuestion failed: " + message },
        ],
        details: undefined,
      }
    }
  },
}
