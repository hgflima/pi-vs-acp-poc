import { Fragment, useRef, useEffect } from "react"
import { cn } from "@/client/lib/utils"
import type {
  AutocompleteItem,
  AutocompleteItemType,
  DiscoveredScope,
} from "@/client/lib/types"

interface AutocompleteMenuProps {
  isOpen: boolean
  items: AutocompleteItem[]
  selectedIndex: number
  onSelect: (item: AutocompleteItem) => void
  position?: { bottom: number; left: number }
}

const TYPE_BADGES: Record<AutocompleteItemType, { label: string; className: string }> = {
  skill: { label: "S", className: "bg-purple-500/20 text-purple-400" },
  command: { label: "C", className: "bg-blue-500/20 text-blue-400" },
  "built-in": { label: "B", className: "bg-green-500/20 text-green-400" },
  file: { label: "@", className: "bg-orange-500/20 text-orange-400" },
  subagent: { label: "@", className: "bg-pink-500/20 text-pink-400" },
}

const SCOPE_LABEL: Record<DiscoveredScope, string> = {
  personal: "Personal",
  project: "Project",
  plugin: "Plugin",
  bundled: "Bundled",
  enterprise: "Enterprise",
}

const DESCRIPTION_TRUNCATE = 80

function scopeHeaderLabel(item: AutocompleteItem): string | null {
  if (!item.scope) return null
  if (item.scope === "plugin") {
    return item.pluginName ? `Plugin: ${item.pluginName}` : "Plugin"
  }
  return SCOPE_LABEL[item.scope]
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function AutocompleteMenu({
  isOpen,
  items,
  selectedIndex,
  onSelect,
  position,
}: AutocompleteMenuProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  if (!isOpen || items.length === 0) return null

  const style = position
    ? { bottom: `${position.bottom}px`, left: `${position.left}px` }
    : undefined

  let lastGroupKey: string | null = null

  return (
    <div
      ref={listRef}
      role="listbox"
      style={style}
      className={cn(
        "absolute z-50 w-80 max-h-[320px] overflow-y-auto",
        "rounded-md border bg-popover text-popover-foreground shadow-md",
        !position && "bottom-full left-0 mb-2",
      )}
    >
      {items.map((item, index) => {
        const badge = TYPE_BADGES[item.type]
        const isSelected = index === selectedIndex

        const header = scopeHeaderLabel(item)
        const groupKey =
          item.scope === "plugin"
            ? `plugin:${item.pluginName ?? ""}`
            : item.scope ?? "_"
        const showHeader = header !== null && groupKey !== lastGroupKey
        if (header !== null) lastGroupKey = groupKey

        const fullDescription = item.description ?? ""
        const displayDescription = fullDescription
          ? truncate(fullDescription, DESCRIPTION_TRUNCATE)
          : ""

        return (
          <Fragment key={`${item.type}-${item.scope ?? "_"}-${item.label}`}>
            {showHeader && (
              <div
                role="presentation"
                className={cn(
                  "sticky top-0 z-10 bg-popover/95 backdrop-blur",
                  "px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider",
                  "text-muted-foreground border-b border-border/50",
                )}
              >
                {header}
              </div>
            )}
            <button
              ref={isSelected ? selectedRef : undefined}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(item)}
              title={fullDescription || undefined}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                "outline-none transition-colors",
                isSelected
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                  badge.className,
                )}
              >
                {badge.label}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-medium">{item.label}</span>
                {displayDescription && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {displayDescription}
                  </span>
                )}
              </div>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
