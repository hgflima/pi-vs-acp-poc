---
status: diagnosed
trigger: "green harness dot does not appear in chat header after loading harness in settings page"
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED -- useHarness() is a local useState hook with no shared state; SettingsPage and ChatLayout each instantiate their own independent copy, so harness.applied set in SettingsPage is invisible to ChatLayout
test: Traced state flow through all files
expecting: N/A -- root cause confirmed
next_action: Report diagnosis

## Symptoms

expected: Green dot indicator appears in chat header after loading a harness in settings page
actual: Nothing appears in the header after loading harness and navigating to /chat
errors: None reported
reproduction: Load harness in /settings, navigate to /chat, observe header
started: Never worked -- architectural issue from initial implementation

## Eliminated

- hypothesis: ChatHeader does not have harness indicator implemented
  evidence: chat-header.tsx lines 82-93 correctly render a green dot when harnessApplied is true
  timestamp: 2026-04-04

- hypothesis: ChatLayout does not pass harness state to ChatHeader
  evidence: chat-layout.tsx line 78 passes harnessApplied={harness.applied} from useHarness()
  timestamp: 2026-04-04

## Evidence

- timestamp: 2026-04-04
  checked: chat-header.tsx -- does green dot exist?
  found: Yes, lines 82-93 render a green dot conditionally on harnessApplied prop. Implementation is correct.
  implication: The UI rendering code is fine; problem is upstream in state.

- timestamp: 2026-04-04
  checked: chat-layout.tsx -- how does it get harness state?
  found: Line 18 calls useHarness() and line 78 passes harness.applied to ChatHeader
  implication: ChatLayout has its own independent instance of useHarness()

- timestamp: 2026-04-04
  checked: settings-page.tsx -- how does it load harness?
  found: Line 32 calls useHarness() independently. Line 70-76 calls loadHarness(directory) which sets harness.applied=true via setHarness in that hook instance, then navigates to /chat
  implication: SettingsPage has its own independent instance of useHarness()

- timestamp: 2026-04-04
  checked: use-harness.ts -- is state shared or local?
  found: Hook uses useState (line 14) with initial value {applied: false, directory: null, result: null}. No React Context, no global store, no persistence layer. Each component calling useHarness() gets its own isolated state.
  implication: ROOT CAUSE -- state is component-local, not shared. When SettingsPage sets applied=true, that state lives in SettingsPage's instance. When navigation happens to /chat, SettingsPage unmounts (destroying its state), and ChatLayout mounts with a fresh useHarness() that initializes applied=false.

- timestamp: 2026-04-04
  checked: app.tsx -- is there a shared provider/context?
  found: No provider wrapping routes. Router is flat: each route gets an independent element. No shared state layer between /settings and /chat.
  implication: Confirms there is no mechanism for state to survive route transitions.

## Resolution

root_cause: useHarness() stores harness state in component-local useState. SettingsPage and ChatLayout each create their own independent instance of this hook. When SettingsPage loads a harness (setting applied=true in its local state) and then navigates to /chat, SettingsPage unmounts (destroying its state) and ChatLayout mounts a fresh useHarness() that initializes with applied=false. The harness state is lost on every route transition.
fix:
verification:
files_changed: []
