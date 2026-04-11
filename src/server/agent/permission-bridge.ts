import crypto from "node:crypto"
import type {
  PermissionOption,
  RequestPermissionOutcome,
  ElicitationSchema,
  ElicitationResponse,
} from "@agentclientprotocol/sdk"

export const DEFAULT_TIMEOUT_MS = 5 * 60_000

interface PendingPermission {
  kind: "permission"
  id: string
  toolCallId: string
  options: PermissionOption[]
  resolve: (outcome: RequestPermissionOutcome) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
  cleanup: () => void
}

interface PendingElicitation {
  kind: "elicitation"
  id: string
  message: string
  requestedSchema: ElicitationSchema
  resolve: (response: ElicitationResponse) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
  cleanup: () => void
}

type Pending = PendingPermission | PendingElicitation

const PENDING = new Map<string, Pending>()

const ALLOW_ALWAYS_CACHE = new Map<string, Set<string>>()

export const checkAllowAlwaysCache = (
  sessionKey: string,
  toolName: string,
): boolean => {
  const set = ALLOW_ALWAYS_CACHE.get(sessionKey)
  return set ? set.has(toolName) : false
}

export const cacheAllowAlways = (
  sessionKey: string,
  toolName: string,
): void => {
  let set = ALLOW_ALWAYS_CACHE.get(sessionKey)
  if (!set) {
    set = new Set()
    ALLOW_ALWAYS_CACHE.set(sessionKey, set)
  }
  set.add(toolName)
}

export const clearAllowAlwaysCache = (sessionKey: string): void => {
  ALLOW_ALWAYS_CACHE.delete(sessionKey)
}

const finalize = (id: string): void => {
  const pending = PENDING.get(id)
  if (!pending) return
  clearTimeout(pending.timer)
  pending.cleanup()
  PENDING.delete(id)
}

export const requestPermission = (
  toolCallId: string,
  options: PermissionOption[],
  signal?: AbortSignal,
  onPendingCreated?: (id: string) => void,
): Promise<RequestPermissionOutcome> => {
  return new Promise((resolve, reject) => {
    const id = `perm_${crypto.randomUUID()}`

    const onAbort = () => {
      const pending = PENDING.get(id)
      if (!pending) return
      finalize(id)
      reject(new Error("aborted"))
    }

    const timer = setTimeout(() => {
      const pending = PENDING.get(id)
      if (!pending) return
      finalize(id)
      reject(new Error(`permission ${id} timed out`))
    }, DEFAULT_TIMEOUT_MS)

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort)
    }

    const pending: PendingPermission = {
      kind: "permission",
      id,
      toolCallId,
      options,
      resolve: (outcome) => {
        finalize(id)
        resolve(outcome)
      },
      reject: (err) => {
        finalize(id)
        reject(err)
      },
      timer,
      cleanup,
    }

    PENDING.set(id, pending)
    onPendingCreated?.(id)

    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener("abort", onAbort)
  })
}

export const requestElicitation = (
  message: string,
  requestedSchema: ElicitationSchema,
  signal?: AbortSignal,
  onPendingCreated?: (id: string) => void,
): Promise<ElicitationResponse> => {
  return new Promise((resolve, reject) => {
    const id = `elic_${crypto.randomUUID()}`

    const onAbort = () => {
      const pending = PENDING.get(id)
      if (!pending) return
      finalize(id)
      reject(new Error("aborted"))
    }

    const timer = setTimeout(() => {
      const pending = PENDING.get(id)
      if (!pending) return
      finalize(id)
      reject(new Error(`elicitation ${id} timed out`))
    }, DEFAULT_TIMEOUT_MS)

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort)
    }

    const pending: PendingElicitation = {
      kind: "elicitation",
      id,
      message,
      requestedSchema,
      resolve: (response) => {
        finalize(id)
        resolve(response)
      },
      reject: (err) => {
        finalize(id)
        reject(err)
      },
      timer,
      cleanup,
    }

    PENDING.set(id, pending)
    onPendingCreated?.(id)

    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener("abort", onAbort)
  })
}

export type PromptOutcome = RequestPermissionOutcome | ElicitationResponse

export const hasPending = (id: string): boolean => PENDING.has(id)

const isValidPermissionOutcome = (
  outcome: unknown,
  options: PermissionOption[],
): boolean => {
  if (!outcome || typeof outcome !== "object") return false
  const o = outcome as { outcome?: unknown; optionId?: unknown }
  if (o.outcome === "cancelled") return true
  if (o.outcome === "selected") {
    if (typeof o.optionId !== "string") return false
    return options.some((opt) => opt.optionId === o.optionId)
  }
  return false
}

const isValidElicitationResponse = (outcome: unknown): boolean => {
  if (!outcome || typeof outcome !== "object") return false
  const o = outcome as { action?: unknown; content?: unknown }
  if (o.action === "cancel" || o.action === "decline") return true
  if (o.action === "accept") {
    return typeof o.content === "object" && o.content !== null
  }
  return false
}

export const resolvePrompt = (id: string, outcome: PromptOutcome): boolean => {
  const pending = PENDING.get(id)
  if (!pending) return false
  if (pending.kind === "permission") {
    if (!isValidPermissionOutcome(outcome, pending.options)) return false
    pending.resolve(outcome as RequestPermissionOutcome)
  } else {
    if (!isValidElicitationResponse(outcome)) return false
    pending.resolve(outcome as ElicitationResponse)
  }
  return true
}

export const rejectAllPending = (reason = "cancelled"): void => {
  const ids = Array.from(PENDING.keys())
  for (const id of ids) {
    const pending = PENDING.get(id)
    if (!pending) continue
    pending.reject(new Error(reason))
  }
}

export const __getPendingIdsForTest = (): string[] => Array.from(PENDING.keys())
