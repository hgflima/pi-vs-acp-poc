import { useState, useCallback, useMemo, useRef } from "react"
import type { AutocompleteItem } from "@/client/lib/types"

type AutocompleteMode = "slash" | "mention"

interface UseAutocompleteOptions {
  items: AutocompleteItem[]
  onSelect: (item: AutocompleteItem) => void
}

interface UseAutocompleteReturn {
  isOpen: boolean
  mode: AutocompleteMode | null
  query: string
  filteredItems: AutocompleteItem[]
  selectedIndex: number
  handleInputChange: (value: string, cursorPosition: number) => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  close: () => void
}

const MAX_ITEMS = 10

function fuzzyMatch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

function detectTrigger(
  value: string,
  cursorPosition: number,
): { mode: AutocompleteMode; query: string; triggerIndex: number } | null {
  // Walk backwards from cursor to find trigger character
  const textBeforeCursor = value.slice(0, cursorPosition)

  // Find the last trigger character before cursor
  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const char = textBeforeCursor[i]

    // Stop at whitespace or newline — no trigger found in this "word"
    if (char === " " || char === "\n" || char === "\t") break

    if (char === "/") {
      // "/" must be at start of line (first char, or preceded by newline)
      if (i === 0 || textBeforeCursor[i - 1] === "\n") {
        const query = textBeforeCursor.slice(i + 1)
        return { mode: "slash", query, triggerIndex: i }
      }
      break
    }

    if (char === "@") {
      // "@" can be at start or after whitespace
      if (i === 0 || /\s/.test(textBeforeCursor[i - 1])) {
        const query = textBeforeCursor.slice(i + 1)
        return { mode: "mention", query, triggerIndex: i }
      }
      break
    }
  }

  return null
}

export function useAutocomplete({
  items,
  onSelect,
}: UseAutocompleteOptions): UseAutocompleteReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<AutocompleteMode | null>(null)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const triggerIndexRef = useRef<number>(-1)

  const filteredItems = useMemo(() => {
    if (!isOpen || mode === null) return []

    const modeItems = items.filter((item) => {
      if (mode === "slash") {
        return item.type === "skill" || item.type === "command" || item.type === "built-in"
      }
      // mention mode
      return item.type === "file" || item.type === "subagent"
    })

    if (!query) return modeItems.slice(0, MAX_ITEMS)

    return modeItems
      .filter(
        (item) =>
          fuzzyMatch(item.label, query) ||
          (item.description && fuzzyMatch(item.description, query)),
      )
      .slice(0, MAX_ITEMS)
  }, [isOpen, mode, items, query])

  const close = useCallback(() => {
    setIsOpen(false)
    setMode(null)
    setQuery("")
    setSelectedIndex(0)
    triggerIndexRef.current = -1
  }, [])

  const handleInputChange = useCallback(
    (value: string, cursorPosition: number) => {
      const trigger = detectTrigger(value, cursorPosition)

      if (!trigger) {
        if (isOpen) close()
        return
      }

      triggerIndexRef.current = trigger.triggerIndex
      setMode(trigger.mode)
      setQuery(trigger.query)
      setSelectedIndex(0)

      if (!isOpen) {
        setIsOpen(true)
      }
    },
    [isOpen, close],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || filteredItems.length === 0) return

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev <= 0 ? filteredItems.length - 1 : prev - 1,
          )
          break
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev >= filteredItems.length - 1 ? 0 : prev + 1,
          )
          break
        case "Enter":
        case "Tab":
          e.preventDefault()
          if (filteredItems[selectedIndex]) {
            onSelect(filteredItems[selectedIndex])
            close()
          }
          break
        case "Escape":
          e.preventDefault()
          close()
          break
      }
    },
    [isOpen, filteredItems, selectedIndex, onSelect, close],
  )

  return {
    isOpen,
    mode,
    query,
    filteredItems,
    selectedIndex,
    handleInputChange,
    handleKeyDown,
    close,
  }
}
