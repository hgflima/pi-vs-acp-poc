import { useCallback, useRef, useState } from "react"
import type { SSEEvent } from "@/client/lib/types"
import { respondToPrompt } from "@/client/lib/api"
import type {
  PermissionOption,
  ElicitationSchema,
} from "@agentclientprotocol/sdk"

export interface PendingPermissionPrompt {
  kind: "permission"
  id: string
  toolCallId: string
  options: PermissionOption[]
}

export interface PendingElicitationPrompt {
  kind: "elicitation"
  id: string
  message: string
  requestedSchema: ElicitationSchema
}

export type PendingPrompt = PendingPermissionPrompt | PendingElicitationPrompt

export interface UseInteractivePromptsResult {
  pending: Map<string, PendingPrompt>
  respond: (id: string, response: Record<string, unknown>) => Promise<boolean>
  handleStreamEvent: (event: SSEEvent) => void
  clear: () => void
}

export function useInteractivePrompts(): UseInteractivePromptsResult {
  const [pending, setPending] = useState<Map<string, PendingPrompt>>(() => new Map())
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const upsert = useCallback((next: PendingPrompt) => {
    setPending((prev) => {
      const copy = new Map(prev)
      copy.set(next.id, next)
      return copy
    })
  }, [])

  const remove = useCallback((id: string) => {
    setPending((prev) => {
      if (!prev.has(id)) return prev
      const copy = new Map(prev)
      copy.delete(id)
      return copy
    })
  }, [])

  const respond = useCallback(
    async (id: string, response: Record<string, unknown>): Promise<boolean> => {
      const result = await respondToPrompt(id, response)
      if (result.ok) {
        remove(id)
        return true
      }
      return false
    },
    [remove],
  )

  const handleStreamEvent = useCallback(
    (event: SSEEvent) => {
      switch (event.type) {
        case "permission_request":
          upsert({
            kind: "permission",
            id: event.id,
            toolCallId: event.toolCallId,
            options: event.options,
          })
          return
        case "elicitation_request":
          upsert({
            kind: "elicitation",
            id: event.id,
            message: event.message,
            requestedSchema: event.requestedSchema,
          })
          return
        case "prompt_expired":
          remove(event.id)
          return
      }
    },
    [upsert, remove],
  )

  const clear = useCallback(() => {
    setPending(new Map())
  }, [])

  return { pending, respond, handleStreamEvent, clear }
}
