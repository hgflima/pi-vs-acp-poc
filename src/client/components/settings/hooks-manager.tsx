import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Save } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import {
  fetchHarnessItem,
  saveHarnessItem,
} from "@/client/lib/api"

const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "SessionStart",
  "UserPromptSubmit",
  "Stop",
] as const

type HookEvent = (typeof HOOK_EVENTS)[number]

interface HookEntry {
  type: "command"
  command: string
  timeout?: number
}

interface HookMatcher {
  matcher: string
  hooks: HookEntry[]
}

type HooksJson = Partial<Record<HookEvent, HookMatcher[]>>

function parseHooksJson(content: string | undefined): HooksJson {
  if (!content) return {}
  try {
    return JSON.parse(content)
  } catch {
    return {}
  }
}

export function HooksManager() {
  const [hooks, setHooks] = useState<HooksJson>({})
  const [savedJson, setSavedJson] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const currentJson = JSON.stringify(hooks, null, 2)
  const hasUnsavedChanges = currentJson !== savedJson

  const loadHooks = useCallback(async () => {
    setLoading(true)
    try {
      const item = await fetchHarnessItem("hooks", "hooks")
      const parsed = parseHooksJson(item.content)
      setHooks(parsed)
      setSavedJson(JSON.stringify(parsed, null, 2))
      setError(null)
    } catch {
      // hooks.json doesn't exist yet
      setHooks({})
      setSavedJson(JSON.stringify({}, null, 2))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHooks()
  }, [loadHooks])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const json = JSON.stringify(hooks, null, 2)
      await saveHarnessItem("hooks", "hooks", json)
      setSavedJson(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }, [hooks])

  const addHook = useCallback((event: HookEvent, matcher: string, command: string, timeout: number) => {
    setHooks((prev) => {
      const updated = { ...prev }
      const entries = updated[event] ? [...updated[event]] : []
      const existing = entries.find((e) => e.matcher === matcher)
      if (existing) {
        existing.hooks = [...existing.hooks, { type: "command", command, timeout: timeout || undefined }]
      } else {
        entries.push({
          matcher,
          hooks: [{ type: "command", command, timeout: timeout || undefined }],
        })
      }
      updated[event] = entries
      return updated
    })
    setShowAddForm(false)
  }, [])

  const removeHook = useCallback((event: HookEvent, matcherIdx: number, hookIdx: number) => {
    setHooks((prev) => {
      const updated = { ...prev }
      const entries = updated[event] ? [...updated[event]] : []
      if (!entries[matcherIdx]) return prev
      const matcher = { ...entries[matcherIdx] }
      matcher.hooks = matcher.hooks.filter((_, i) => i !== hookIdx)
      if (matcher.hooks.length === 0) {
        entries.splice(matcherIdx, 1)
      } else {
        entries[matcherIdx] = matcher
      }
      if (entries.length === 0) {
        delete updated[event]
      } else {
        updated[event] = entries
      }
      return updated
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading hooks...
      </div>
    )
  }

  const allEvents = HOOK_EVENTS.filter((e) => hooks[e] && hooks[e]!.length > 0)

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          Hooks
          {hasUnsavedChanges && <span className="ml-1 text-yellow-500">*</span>}
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Add Hook
          </Button>
          <Button size="sm" disabled={!hasUnsavedChanges || saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {showAddForm && (
        <AddHookForm
          onAdd={addHook}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {allEvents.length === 0 && !showAddForm ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No hooks configured. Add one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {allEvents.map((event) => (
            <div key={event} className="rounded-lg border p-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">{event}</h3>
              <div className="space-y-1">
                {hooks[event]!.map((matcher, mIdx) =>
                  matcher.hooks.map((hook, hIdx) => (
                    <div
                      key={`${mIdx}-${hIdx}`}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs text-muted-foreground">{matcher.matcher}</span>
                        <span className="mx-2 text-muted-foreground">→</span>
                        <span className="font-mono text-xs">{hook.command}</span>
                        {hook.timeout && (
                          <span className="ml-2 text-xs text-muted-foreground">({hook.timeout}s)</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeHook(event, mIdx, hIdx)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

function AddHookForm({
  onAdd,
  onCancel,
}: {
  onAdd: (event: HookEvent, matcher: string, command: string, timeout: number) => void
  onCancel: () => void
}) {
  const [event, setEvent] = useState<HookEvent>("PreToolUse")
  const [matcher, setMatcher] = useState("")
  const [command, setCommand] = useState("")
  const [timeout, setTimeout] = useState(10)

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Event</Label>
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            value={event}
            onChange={(e) => setEvent(e.target.value as HookEvent)}
          >
            {HOOK_EVENTS.map((ev) => (
              <option key={ev} value={ev}>{ev}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Matcher (regex)</Label>
          <Input className="mt-1" placeholder="Write|Edit" value={matcher} onChange={(e) => setMatcher(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_80px] gap-3">
        <div>
          <Label>Command</Label>
          <Input className="mt-1" placeholder="echo 'hook ran'" value={command} onChange={(e) => setCommand(e.target.value)} />
        </div>
        <div>
          <Label>Timeout (s)</Label>
          <Input className="mt-1" type="number" min={1} value={timeout} onChange={(e) => setTimeout(Number(e.target.value))} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!matcher.trim() || !command.trim()}
          onClick={() => onAdd(event, matcher.trim(), command.trim(), timeout)}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
