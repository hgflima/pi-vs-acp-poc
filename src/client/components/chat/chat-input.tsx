import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { Send, Square } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { cn } from "@/client/lib/utils"
import type {
  ChatAttachment,
  AutocompleteItem,
  DiscoveredItem,
  DiscoveryResult,
  DiscoveryHarness,
} from "@/client/lib/types"
import { fetchProjectFiles, fetchHarnessItems } from "@/client/lib/api"
import { useAutocomplete } from "@/client/hooks/use-autocomplete"
import { useHarnessContext } from "@/client/contexts/harness-context"
import { AttachmentChip } from "./attachment-chip"
import { AutocompleteMenu } from "./autocomplete-menu"

const DISCOVERY_DEBOUNCE_MS = 150
const ACTIVE_DISCOVERY_HARNESS: DiscoveryHarness = "claude"

function discoveredToAutocomplete(item: DiscoveredItem): AutocompleteItem {
  return {
    label: item.name,
    description: item.description,
    type: item.type === "subagent" ? "subagent" : item.type,
    scope: item.scope,
    pluginName: item.pluginName,
    argumentHint: item.argumentHint,
  }
}

function sortDiscoveredItems(a: DiscoveredItem, b: DiscoveredItem): number {
  return a.name.localeCompare(b.name)
}

function isDiscoveryResult(
  value: unknown,
): value is DiscoveryResult {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as DiscoveryResult).items)
  )
}

const MAX_FILE_SIZE = 1024 * 1024 // 1MB
const MAX_ATTACHMENTS = 5

interface ChatInputProps {
  onSend: (content: string, extras?: { fileRefs?: string[]; attachments?: ChatAttachment[] }) => void
  onStop: () => void
  streaming: boolean
  disabled: boolean
}

function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const size = 80
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(reader.result as string)
          return
        }
        // crop to square center
        const min = Math.min(img.width, img.height)
        const sx = (img.width - min) / 2
        const sy = (img.height - min) / 2
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
        resolve(canvas.toDataURL("image/png"))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function fileToAttachment(file: File): Promise<ChatAttachment | null> {
  if (file.size > MAX_FILE_SIZE) {
    alert(`File "${file.name}" exceeds the 1MB size limit.`)
    return null
  }

  const isImage = file.type.startsWith("image/")

  if (isImage) {
    const preview = await generateThumbnail(file)
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(",")[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    return {
      id: crypto.randomUUID(),
      filename: file.name,
      mimeType: file.type,
      content: base64,
      size: file.size,
      preview,
    }
  }

  // Text/other files — read as text
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
  return {
    id: crypto.randomUUID(),
    filename: file.name,
    mimeType: file.type || "text/plain",
    content: text,
    size: file.size,
  }
}

/** Extract @refs from message text */
function extractFileRefs(text: string): string[] {
  const matches = text.match(/@([\w./_-]+)/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.slice(1)))]
}

export function ChatInput({ onSend, onStop, streaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [mentionItems, setMentionItems] = useState<AutocompleteItem[]>([])
  const [slashItems, setSlashItems] = useState<AutocompleteItem[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragCounterRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const { harnessRevision } = useHarnessContext()

  const handleAutocompleteSelect = useCallback(
    (item: AutocompleteItem) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const cursor = textarea.selectionStart
      const text = value
      let triggerIdx = -1
      let triggerChar = ""

      // Walk back from cursor to find trigger character (@ or /)
      for (let i = cursor - 1; i >= 0; i--) {
        if (text[i] === "@" || text[i] === "/") {
          triggerChar = text[i]
          triggerIdx = i
          break
        }
        if (text[i] === " " || text[i] === "\n") break
      }

      if (triggerIdx === -1) return

      const before = text.slice(0, triggerIdx)
      const after = text.slice(cursor)
      const insertion = `${triggerChar}${item.label} `
      const newValue = before + insertion + after
      setValue(newValue)

      requestAnimationFrame(() => {
        const newCursor = before.length + insertion.length
        textarea.selectionStart = newCursor
        textarea.selectionEnd = newCursor
        textarea.focus()
      })
    },
    [value],
  )

  const allAutocompleteItems = useMemo(
    () => [...slashItems, ...mentionItems],
    [slashItems, mentionItems],
  )

  const autocomplete = useAutocomplete({
    items: allAutocompleteItems,
    onSelect: handleAutocompleteSelect,
  })

  // Fetch mention items when autocomplete is open in mention mode
  useEffect(() => {
    if (!autocomplete.isOpen || autocomplete.mode !== "mention") return

    let cancelled = false
    const query = autocomplete.query

    async function fetchItems() {
      const [subagentsResult, filesResult] = await Promise.all([
        fetchHarnessItems("subagents").catch(() => []),
        fetchProjectFiles(query).catch(() => []),
      ])

      if (cancelled) return

      const subagentItems: AutocompleteItem[] = Array.isArray(subagentsResult)
        ? subagentsResult.map((s) => ({
            label: s.name,
            description: s.description || "Subagent",
            type: "subagent" as const,
          }))
        : []

      const fileItems: AutocompleteItem[] = filesResult.map((f) => ({
        label: f.path,
        description: "File",
        type: "file" as const,
      }))

      // Subagents first, then files
      setMentionItems([...subagentItems, ...fileItems])
    }

    fetchItems()
    return () => { cancelled = true }
  }, [autocomplete.isOpen, autocomplete.mode, autocomplete.query])

  // Fetch slash items from native discovery (skills + commands in parallel).
  // Debounced 150ms while menu is open to prevent per-keystroke fetch storm (spec §15).
  const slashMenuOpen = autocomplete.isOpen && autocomplete.mode === "slash"
  useEffect(() => {
    if (!slashMenuOpen) return
    let cancelled = false

    const timer = window.setTimeout(() => {
      async function load() {
        const [skillsRes, commandsRes] = await Promise.all([
          fetchHarnessItems("skills", {
            agent: ACTIVE_DISCOVERY_HARNESS,
            includeShadowed: false,
          }).catch(() => null),
          fetchHarnessItems("commands", {
            agent: ACTIVE_DISCOVERY_HARNESS,
            includeShadowed: false,
          }).catch(() => null),
        ])
        if (cancelled) return

        const skills = isDiscoveryResult(skillsRes) ? skillsRes.items : []
        const commands = isDiscoveryResult(commandsRes) ? commandsRes.items : []

        const merged: DiscoveredItem[] = [...skills, ...commands]
          .filter((item) => item.userInvocable)
          .sort(sortDiscoveredItems)

        setSlashItems(merged.map(discoveredToAutocomplete))
      }
      load()
    }, DISCOVERY_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [slashMenuOpen, harnessRevision])

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px"
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const addAttachments = useCallback(
    async (files: File[]) => {
      const remaining = MAX_ATTACHMENTS - attachments.length
      if (remaining <= 0) {
        alert(`Maximum ${MAX_ATTACHMENTS} attachments per message.`)
        return
      }
      const toProcess = files.slice(0, remaining)
      if (toProcess.length < files.length) {
        alert(`Only ${remaining} more attachment(s) allowed. Some files were skipped.`)
      }
      const results = await Promise.all(toProcess.map(fileToAttachment))
      const valid = results.filter((r): r is ChatAttachment => r !== null)
      if (valid.length > 0) {
        setAttachments((prev) => [...prev, ...valid])
      }
    },
    [attachments.length],
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed && attachments.length === 0) return
    const fileRefs = extractFileRefs(trimmed)
    const extras: { fileRefs?: string[]; attachments?: ChatAttachment[] } = {}
    if (fileRefs.length > 0) extras.fileRefs = fileRefs
    if (attachments.length > 0) extras.attachments = [...attachments]
    onSend(trimmed, Object.keys(extras).length > 0 ? extras : undefined)
    setValue("")
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, attachments.length, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let autocomplete handle keys when open
      if (autocomplete.isOpen) {
        const key = e.key
        if (key === "ArrowUp" || key === "ArrowDown" || key === "Tab" || key === "Escape") {
          autocomplete.handleKeyDown(e)
          return
        }
        if (key === "Enter" && autocomplete.filteredItems.length > 0) {
          autocomplete.handleKeyDown(e)
          return
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (!streaming && !disabled) {
          handleSend()
        }
      }
    },
    [handleSend, streaming, disabled, autocomplete],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      setValue(newValue)
      autocomplete.handleInputChange(newValue, e.target.selectionStart)
    },
    [autocomplete],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === "file") {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) {
        e.preventDefault()
        addAttachments(files)
      }
      // If no files, let default paste behavior handle plain text
    },
    [addAttachments],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        addAttachments(files)
      }
    },
    [addAttachments],
  )

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col rounded-lg border bg-background p-2 transition-colors",
        "focus-within:ring-2 focus-within:ring-ring/50",
        isDragOver && "border-blue-500 bg-blue-50/10 ring-2 ring-blue-500/50",
      )}
    >
      <AutocompleteMenu
        isOpen={autocomplete.isOpen}
        items={autocomplete.filteredItems}
        selectedIndex={autocomplete.selectedIndex}
        onSelect={handleAutocompleteSelect}
      />
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2 pb-2">
          {attachments.map((att) => (
            <AttachmentChip
              key={att.id}
              attachment={att}
              onRemove={removeAttachment}
            />
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Send a message..."
          disabled={disabled}
          rows={1}
          className={cn(
            "flex-1 bg-transparent border-0 outline-none resize-none text-sm",
            "placeholder:text-muted-foreground",
            "min-h-[40px] max-h-[160px] py-2 px-2",
            "disabled:opacity-50",
          )}
        />
        {streaming ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onStop}
            aria-label="Stop generation"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSend}
            disabled={disabled || (value.trim() === "" && attachments.length === 0)}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
