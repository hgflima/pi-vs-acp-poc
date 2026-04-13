import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Pencil, Trash2, ArrowLeft, Save } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
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

function buildSkillContent(name: string, description: string, instructions: string, allowedTools: string): string {
  const lines = ["---", `name: ${name}`, `description: ${description}`]
  if (allowedTools.trim()) {
    const tools = allowedTools.split(",").map((t) => t.trim()).filter(Boolean)
    lines.push(`allowed-tools: [${tools.join(", ")}]`)
  }
  lines.push("---", "", instructions)
  return lines.join("\n")
}

type View = { mode: "list" } | { mode: "create" } | { mode: "edit"; item: HarnessItem }

export function SkillsManager() {
  const [items, setItems] = useState<HarnessItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ mode: "list" })

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchHarnessItems("skills")
      setItems(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skills")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  if (view.mode === "create") {
    return (
      <SkillForm
        onBack={() => setView({ mode: "list" })}
        onSaved={() => {
          setView({ mode: "list" })
          loadItems()
        }}
      />
    )
  }

  if (view.mode === "edit") {
    return (
      <SkillEditor
        item={view.item}
        onBack={() => setView({ mode: "list" })}
        onSaved={() => {
          setView({ mode: "list" })
          loadItems()
        }}
      />
    )
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Skills</h2>
        <Button size="sm" onClick={() => setView({ mode: "create" })}>
          <Plus className="h-3 w-3 mr-1" />
          New Skill
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading skills...
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No skills found. Create one to get started.
        </div>
      ) : (
        <div className="space-y-1 rounded-lg border p-1">
          {items.map((item) => (
            <SkillListItem
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

function SkillListItem({
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
      await deleteHarnessItem("skills", item.name)
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
        <div className="text-sm font-medium truncate">{item.name}</div>
        {description && (
          <div className="text-xs text-muted-foreground truncate">{description}</div>
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
              <DialogTitle>Delete skill</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{item.name}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
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

function SkillForm({
  onBack,
  onSaved,
}: {
  onBack: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [instructions, setInstructions] = useState("")
  const [allowedTools, setAllowedTools] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const content = buildSkillContent(name.trim(), description, instructions, allowedTools)
      await saveHarnessItem("skills", name.trim(), content)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }, [name, description, instructions, allowedTools, onSaved])

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3 w-3" />
        </Button>
        <h2 className="text-sm font-medium">New Skill</h2>
      </div>

      <div className="space-y-3">
        <div>
          <Label>Name (kebab-case)</Label>
          <Input
            className="mt-1"
            placeholder="my-skill"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Input
            className="mt-1"
            placeholder="What this skill does"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label>Allowed Tools (comma-separated, optional)</Label>
          <Input
            className="mt-1"
            placeholder="Read, Write, Bash"
            value={allowedTools}
            onChange={(e) => setAllowedTools(e.target.value)}
          />
        </div>
        <div>
          <Label>Instructions</Label>
          <div className="mt-1">
            <CodeEditor
              value={instructions}
              onChange={setInstructions}
              language="markdown"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <Button disabled={!name.trim() || saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Create Skill
        </Button>
        <Button variant="ghost" onClick={onBack}>Cancel</Button>
      </div>
    </div>
  )
}

function SkillEditor({
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
      await saveHarnessItem("skills", item.name, content)
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
            {item.name}
            {hasUnsavedChanges && <span className="ml-1 text-yellow-500">*</span>}
          </h2>
        </div>
        <Button size="sm" disabled={!hasUnsavedChanges || saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save
        </Button>
      </div>

      <CodeEditor
        value={content}
        onChange={setContent}
        language="markdown"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
