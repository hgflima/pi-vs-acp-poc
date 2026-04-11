import { test } from "node:test"
import assert from "node:assert/strict"
import type {
  PermissionOption,
  RequestPermissionOutcome,
  ElicitationSchema,
  ElicitationResponse,
} from "@agentclientprotocol/sdk"
import {
  requestPermission,
  requestElicitation,
  resolvePrompt,
  rejectAllPending,
  __getPendingIdsForTest,
  checkAllowAlwaysCache,
  cacheAllowAlways,
  clearAllowAlwaysCache,
} from "./permission-bridge.ts"

const sampleOptions: PermissionOption[] = [
  { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
  { optionId: "reject_once", name: "Reject once", kind: "reject_once" },
]

const sampleSchema: ElicitationSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
  },
  required: ["answer"],
}

const selectedOutcome: RequestPermissionOutcome = {
  outcome: "selected",
  optionId: "allow_once",
}

const cancelledOutcome: RequestPermissionOutcome = {
  outcome: "cancelled",
}

const cleanup = () => {
  rejectAllPending("test-cleanup")
}

test("requestPermission resolves on matching resolvePrompt call", async () => {
  cleanup()
  const pending = requestPermission("tool_1", sampleOptions)
  pending.catch(() => {})

  const ids = __getPendingIdsForTest()
  assert.equal(ids.length, 1)
  const id = ids[0]!
  assert.ok(id.startsWith("perm_"))

  const ok = resolvePrompt(id, selectedOutcome)
  assert.equal(ok, true)

  const outcome = await pending
  assert.deepEqual(outcome, selectedOutcome)
  assert.equal(__getPendingIdsForTest().length, 0)
})

test("requestElicitation resolves on matching resolvePrompt call", async () => {
  cleanup()
  const pending = requestElicitation("What is your name?", sampleSchema)
  pending.catch(() => {})

  const ids = __getPendingIdsForTest()
  assert.equal(ids.length, 1)
  const id = ids[0]!
  assert.ok(id.startsWith("elic_"))

  const response: ElicitationResponse = {
    action: "accept",
    content: { answer: "Bob" },
  } as unknown as ElicitationResponse

  const ok = resolvePrompt(id, response)
  assert.equal(ok, true)

  const result = await pending
  assert.deepEqual(result, response)
  assert.equal(__getPendingIdsForTest().length, 0)
})

test("resolvePrompt returns false for unknown ids", () => {
  cleanup()
  assert.equal(resolvePrompt("perm_does_not_exist", cancelledOutcome), false)
})

test("resolvePrompt returns false for malformed permission outcome", async () => {
  cleanup()
  const pending = requestPermission("tool_malformed_perm", sampleOptions)
  pending.catch(() => {})

  const id = __getPendingIdsForTest()[0]!

  // Empty object — no outcome field
  assert.equal(resolvePrompt(id, {} as unknown as RequestPermissionOutcome), false)
  // selected without optionId
  assert.equal(
    resolvePrompt(id, { outcome: "selected" } as unknown as RequestPermissionOutcome),
    false,
  )
  // selected with unknown optionId (not in pending.options)
  assert.equal(
    resolvePrompt(
      id,
      { outcome: "selected", optionId: "not_a_real_option" } as unknown as RequestPermissionOutcome,
    ),
    false,
  )

  // Pending must still be alive after malformed attempts
  assert.ok(__getPendingIdsForTest().includes(id))

  // Clean up: resolve with valid outcome so the promise settles
  assert.equal(resolvePrompt(id, selectedOutcome), true)
  await pending
})

test("resolvePrompt returns false for malformed elicitation outcome", async () => {
  cleanup()
  const pending = requestElicitation("What is your name?", sampleSchema)
  pending.catch(() => {})

  const id = __getPendingIdsForTest()[0]!

  // Empty object — no action
  assert.equal(resolvePrompt(id, {} as unknown as ElicitationResponse), false)
  // accept without content
  assert.equal(
    resolvePrompt(id, { action: "accept" } as unknown as ElicitationResponse),
    false,
  )
  // accept with null content
  assert.equal(
    resolvePrompt(id, { action: "accept", content: null } as unknown as ElicitationResponse),
    false,
  )

  // Pending must still be alive after malformed attempts
  assert.ok(__getPendingIdsForTest().includes(id))

  // Clean up with a valid decline
  const declineResponse = { action: "decline" } as unknown as ElicitationResponse
  assert.equal(resolvePrompt(id, declineResponse), true)
  await pending
})

test("double-resolve is idempotent (second call returns false)", async () => {
  cleanup()
  const pending = requestPermission("tool_double", sampleOptions)
  pending.catch(() => {})

  const id = __getPendingIdsForTest()[0]!
  assert.equal(resolvePrompt(id, selectedOutcome), true)
  assert.equal(resolvePrompt(id, selectedOutcome), false)

  const outcome = await pending
  assert.deepEqual(outcome, selectedOutcome)
})

test("request rejects on timeout (short timeout via fake timers)", async () => {
  cleanup()
  const originalSetTimeout = globalThis.setTimeout
  ;(globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((
    fn: () => void,
    _ms?: number,
  ) => originalSetTimeout(fn, 10)) as unknown as typeof setTimeout

  try {
    const pending = requestPermission("tool_timeout", sampleOptions)
    await assert.rejects(pending, /timed out/)
    assert.equal(__getPendingIdsForTest().length, 0)
  } finally {
    ;(globalThis as { setTimeout: typeof setTimeout }).setTimeout = originalSetTimeout
  }
})

test("AbortSignal rejects and removes from registry", async () => {
  cleanup()
  const controller = new AbortController()
  const pending = requestPermission("tool_abort", sampleOptions, controller.signal)
  pending.catch(() => {})

  assert.equal(__getPendingIdsForTest().length, 1)
  controller.abort()

  await assert.rejects(pending, /aborted/)
  assert.equal(__getPendingIdsForTest().length, 0)
})

test("Pre-aborted signal rejects immediately", async () => {
  cleanup()
  const controller = new AbortController()
  controller.abort()

  const pending = requestPermission("tool_pre_abort", sampleOptions, controller.signal)
  await assert.rejects(pending, /aborted/)
  assert.equal(__getPendingIdsForTest().length, 0)
})

test("rejectAllPending clears every pending prompt", async () => {
  cleanup()
  const a = requestPermission("tool_a", sampleOptions)
  const b = requestElicitation("q?", sampleSchema)
  a.catch(() => {})
  b.catch(() => {})

  assert.equal(__getPendingIdsForTest().length, 2)
  rejectAllPending("shutdown")

  await assert.rejects(a, /shutdown/)
  await assert.rejects(b, /shutdown/)
  assert.equal(__getPendingIdsForTest().length, 0)
})

test("allow-always cache: empty by default", () => {
  clearAllowAlwaysCache("sess_a")
  assert.equal(checkAllowAlwaysCache("sess_a", "Bash"), false)
})

test("allow-always cache: cacheAllowAlways then checkAllowAlwaysCache", () => {
  clearAllowAlwaysCache("sess_b")
  cacheAllowAlways("sess_b", "Bash")
  assert.equal(checkAllowAlwaysCache("sess_b", "Bash"), true)
  assert.equal(checkAllowAlwaysCache("sess_b", "Read"), false)
})

test("allow-always cache: scoped per session", () => {
  clearAllowAlwaysCache("sess_c")
  clearAllowAlwaysCache("sess_d")
  cacheAllowAlways("sess_c", "Bash")
  assert.equal(checkAllowAlwaysCache("sess_c", "Bash"), true)
  assert.equal(checkAllowAlwaysCache("sess_d", "Bash"), false)
})

test("allow-always cache: clearAllowAlwaysCache removes all entries for session", () => {
  clearAllowAlwaysCache("sess_e")
  cacheAllowAlways("sess_e", "Bash")
  cacheAllowAlways("sess_e", "Read")
  assert.equal(checkAllowAlwaysCache("sess_e", "Bash"), true)
  assert.equal(checkAllowAlwaysCache("sess_e", "Read"), true)
  clearAllowAlwaysCache("sess_e")
  assert.equal(checkAllowAlwaysCache("sess_e", "Bash"), false)
  assert.equal(checkAllowAlwaysCache("sess_e", "Read"), false)
})
