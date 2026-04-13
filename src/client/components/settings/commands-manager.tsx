import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Pencil, Trash2, ArrowLeft, Save } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Badge } from "@/client/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/client/components/ui/dialog"
import { CodeEditor } from "./code-editor"
import {
  fetchHarnessItems,
  saveHarnessItem,
  deleteHarnessItem,
} from "@/client/lib/api"
import type { HarnessItem } from "@/client/lib/types"

function parseDescription(content: string): string {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return ""
  const frontmatter = match[1]
  const descLine = frontmatter.split("\n").find((l) => l.startsWith("description:"))
  return descLine?.replace("description:", "").trim().replace(/^["']|["']$/g, "") ?? ""
}

function buildCommandContent(name: string, description: string, prompt: string): string {
  return ["---", `name: ${name}`, `description: ${description}`, "---", "", prompt].join("\n")
}

type View = { mode: "list" } | { mode: "create" } | { mode: "edit"; item: HarnessItem }

export function CommandsManager() {
  const [items, setItems] = useState<HarnessItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ mode: "list" })

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchHarnessItems("commands")
      setItems(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load commands")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  if (view.mode === "create") {
    return (
      <CommandForm
        onBack={() => setView({ mode: "list" })}
        onSaved={() => { setView({ mode: "list" }); loadItems() }}
      />
    )
  }

  if (view.mode === "edit") {
    return (
      <CommandEditor
        item={view.item}
        onBack={() => setView({ mode: "list" })}
        onSaved={() => { setView({ mode: "list" }); loadItems() }}
      />
    )
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Commands</h2>
        <Button size="sm" onClick={() => setView({ mode: "create" })}>
          <Plus className="h-3 w-3 mr-1" />
          New Command
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading commands...
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No commands found. Create one to get started.
        </div>
      ) : (
        <div className="space-y-1 rounded-lg border p-1">
          {items.map((item) => (
            <CommandListItem
              key={item.name}
              item={item}
              onEdit={() => setView({ mode: "edit", item })}
              onDeleted={loadItems}
            />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

function CommandListItem({
  item,
  onEdit,
  onDeleted,
}: {
  item: HarnessItem
  onEdit: () => void
  onDeleted: () => void
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const description = item.content ? parseDescription(item.content) : ""

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      await deleteHarnessItem("commands", item.name)
      setDeleteOpen(false)
      onDeleted()
    } catch {
      // Keep dialog open on error
    } finally {
      setDeleting(false)
    }
  }, [item.name, onDeleted])

  return (
    <div className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">/{item.name}</span>
          <Badge variant="default" className="text-[10px]">Claude: Native</Badge>
          <Badge variant="secondary" className="text-[10px]">Gemini: Convertible</Badge>
        </div>
        {description && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{description}</div>
        )}
      </div>
      <div className="flex items-center gap-1 ml-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete command</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;/{item.name}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose><Button variant="ghost">Cancel</Button></DialogClose>
              <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
                {deleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function CommandForm({
  onBack,
  onSaved,
}: {
  onBack: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [prompt, setPrompt] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const content = buildCommandContent(name.trim(), description, prompt)
      await saveHarnessItem("commands", name.trim(), content)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }, [name, description, prompt, onSaved])

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3 w-3" />
        </Button>
        <h2 className="text-sm font-medium">New Command</h2>
      </div>

      <div className="space-y-3">
        <div>
          <Label>Name (kebab-case)</Label>
          <Input className="mt-1" placeholder="my-command" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <Input className="mt-1" placeholder="What this command does" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>Prompt Template</Label>
          <div className="mt-1">
            <CodeEditor value={prompt} onChange={setPrompt} language="markdown" />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <Button disabled={!name.trim() || saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Create Command
        </Button>
        <Button variant="ghost" onClick={onBack}>Cancel</Button>
      </div>
    </div>
  )
}

function CommandEditor({
  item,
  onBack,
  onSaved,
}: {
  item: HarnessItem
  onBack: () => void
  onSaved: () => void
}) {
  const [content, setContent] = useState(item.content ?? "")
  const [savedContent] = useState(item.content ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasUnsavedChanges = content !== savedContent

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await saveHarnessItem("commands", item.name, content)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }, [item.name, content, onSaved])

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <h2 className="text-sm font-medium">
            /{item.name}
            {hasUnsavedChanges && <span className="ml-1 text-yellow-500">*</span>}
          </h2>
        </div>
        <Button size="sm" disabled={!hasUnsavedChanges || saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save
        </Button>
      </div>

      <CodeEditor value={content} onChange={setContent} language="markdown" />

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
