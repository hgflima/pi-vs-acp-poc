import { useCallback, useEffect, useState } from "react"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { Badge } from "@/client/components/ui/badge"
import { CodeEditor } from "./code-editor"
import {
  fetchInstructions,
  saveInstructions,
  type InstructionsStatus,
} from "@/client/lib/api"

type SyncBadge = "synced" | "missing" | "out-of-sync"

function deriveSyncBadge(exists: boolean, synced: boolean): SyncBadge {
  if (!exists) return "missing"
  if (synced) return "synced"
  return "out-of-sync"
}

function SyncStatusBadge({ label, status }: { label: string; status: SyncBadge }) {
  const variant =
    status === "synced"
      ? "default"
      : status === "missing"
        ? "secondary"
        : "destructive"

  const text =
    status === "synced" ? "Synced" : status === "missing" ? "Missing" : "Out of sync"

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant={variant}>{text}</Badge>
    </div>
  )
}

export function InstructionsEditor() {
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [status, setStatus] = useState<InstructionsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasUnsavedChanges = content !== savedContent

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchInstructions()
      .then((data) => {
        if (cancelled) return
        setContent(data.content)
        setSavedContent(data.content)
        setStatus(data)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await saveInstructions(content)
      setSavedContent(content)
      // Refresh status after save to update sync badges
      const updated = await fetchInstructions()
      setStatus(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }, [content])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading instructions...
      </div>
    )
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">
            AGENTS.md
            {hasUnsavedChanges && (
              <span className="ml-1 text-yellow-500">*</span>
            )}
          </h2>
        </div>
        <Button
          size="sm"
          disabled={!hasUnsavedChanges || saving}
          onClick={handleSave}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Save className="h-3 w-3 mr-1" />
          )}
          Save
        </Button>
      </div>

      {status && (
        <div className="flex gap-4">
          <SyncStatusBadge
            label="CLAUDE.md"
            status={deriveSyncBadge(status.claudeExists, status.claudeSynced)}
          />
          <SyncStatusBadge
            label="GEMINI.md"
            status={deriveSyncBadge(status.geminiExists, status.geminiSynced)}
          />
        </div>
      )}

      <CodeEditor
        value={content}
        onChange={setContent}
        language="markdown"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
