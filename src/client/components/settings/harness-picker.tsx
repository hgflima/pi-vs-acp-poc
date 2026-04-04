import { useState, useCallback } from "react"
import { FolderOpen } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { Input } from "@/client/components/ui/input"

interface HarnessPickerProps {
  directory: string
  onDirectoryChange: (dir: string) => void
  onBrowse: () => void
}

export function HarnessPicker({ directory, onDirectoryChange, onBrowse }: HarnessPickerProps) {
  const [dragging, setDragging] = useState(false)
  const [inputValue, setInputValue] = useState("")

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)

    // Browser security: drag & drop of folders only gives the folder name, not the full path.
    // Extract the name and populate the input field so the user can confirm/edit the full path.
    const items = e.dataTransfer.items
    if (items && items.length > 0) {
      const item = items[0]
      const entry = item.webkitGetAsEntry?.()
      if (entry) {
        setInputValue(entry.name)
        return
      }
    }
    // Fallback: use files if available
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setInputValue(files[0].name)
    }
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (trimmed) {
      onDirectoryChange(trimmed)
    }
  }, [inputValue, onDirectoryChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  // Directory is set -- show path display
  if (directory) {
    return (
      <div className="flex items-center gap-2">
        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm truncate">{directory}</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0"
          onClick={() => onDirectoryChange("")}
        >
          Change Folder
        </Button>
      </div>
    )
  }

  // Empty state -- show drop zone + input
  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragging ? "border-primary bg-accent" : "border-border"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        aria-label="Drop project folder or click to browse"
      >
        <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Drop a project folder here</p>
        <p className="mt-1 text-xs text-muted-foreground">or</p>
        <Button variant="ghost" size="sm" className="mt-1" onClick={onBrowse}>
          Browse Files
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="/path/to/project"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button variant="ghost" size="sm" onClick={handleSubmit}>
          Go
        </Button>
      </div>
    </div>
  )
}
