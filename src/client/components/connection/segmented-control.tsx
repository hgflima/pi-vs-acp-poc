import type { Provider } from "@/client/lib/types"
import { cn } from "@/client/lib/utils"

interface SegmentedControlProps {
  value: Provider
  onChange: (provider: Provider) => void
  disabled?: boolean
}

const providers: { value: Provider; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
]

export function SegmentedControl({ value, onChange, disabled }: SegmentedControlProps) {
  return (
    <div className="flex rounded-lg border bg-muted p-1">
      {providers.map((p) => (
        <button
          key={p.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(p.value)}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            value === p.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
