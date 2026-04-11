import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_MODE_ID,
  DEFAULT_PI_MODES,
  WRITE_CLASS_TOOLS,
  READ_CLASS_TOOLS,
  getMode,
  setMode,
  clearMode,
  __resetAllModesForTest,
} from "./session-mode.ts"

test("DEFAULT_PI_MODES has the four expected modes in order", () => {
  const ids = DEFAULT_PI_MODES.map((m) => m.id)
  assert.deepEqual(ids, ["default", "acceptEdits", "plan", "bypassPermissions"])
  for (const mode of DEFAULT_PI_MODES) {
    assert.equal(typeof mode.id, "string")
    assert.equal(typeof mode.name, "string")
  }
})

test("DEFAULT_MODE_ID is 'default' and matches first entry", () => {
  assert.equal(DEFAULT_MODE_ID, "default")
  assert.equal(DEFAULT_PI_MODES[0].id, DEFAULT_MODE_ID)
})

test("WRITE_CLASS_TOOLS contains expected write tools", () => {
  assert.ok(WRITE_CLASS_TOOLS.has("bash"))
  assert.ok(!WRITE_CLASS_TOOLS.has("read_file"))
  assert.ok(!WRITE_CLASS_TOOLS.has("list_files"))
})

test("WRITE_CLASS_TOOLS no longer contains write_file (dead entry removed)", () => {
  assert.equal(WRITE_CLASS_TOOLS.has("write_file"), false)
})

test("READ_CLASS_TOOLS contains read_file", () => {
  assert.equal(READ_CLASS_TOOLS.has("read_file"), true)
})

test("getMode returns 'default' for unknown chatSessionId", () => {
  __resetAllModesForTest()
  assert.equal(getMode("chat-unknown"), "default")
})

test("setMode then getMode round-trip", () => {
  __resetAllModesForTest()
  setMode("chat-a", "plan")
  assert.equal(getMode("chat-a"), "plan")
  setMode("chat-a", "bypassPermissions")
  assert.equal(getMode("chat-a"), "bypassPermissions")
})

test("setMode isolates different chatSessionIds", () => {
  __resetAllModesForTest()
  setMode("chat-a", "plan")
  setMode("chat-b", "acceptEdits")
  assert.equal(getMode("chat-a"), "plan")
  assert.equal(getMode("chat-b"), "acceptEdits")
  assert.equal(getMode("chat-c"), "default")
})

test("setMode rejects unknown mode id", () => {
  __resetAllModesForTest()
  assert.throws(() => setMode("chat-a", "nonsense"), /unknown mode: nonsense/)
})

test("clearMode reverts to default", () => {
  __resetAllModesForTest()
  setMode("chat-a", "plan")
  assert.equal(getMode("chat-a"), "plan")
  clearMode("chat-a")
  assert.equal(getMode("chat-a"), "default")
})
