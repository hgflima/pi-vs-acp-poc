import type { SSEEvent } from "./types"

export async function* parseSSEStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  if (!response.body) throw new Error("No response body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let currentEvent = ""
  let currentData = ""

  try {
    while (true) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim()
        } else if (line.startsWith("data: ")) {
          currentData += line.slice(6)
        } else if (line === "") {
          if (currentEvent && currentData) {
            try {
              const parsed = JSON.parse(currentData)
              yield { type: currentEvent, ...parsed } as SSEEvent
            } catch {
              // Skip malformed events
            }
          }
          currentEvent = ""
          currentData = ""
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
