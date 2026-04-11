import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/client/components/ui/popover"
import type { ChatModeState } from "@/client/hooks/use-chat"

interface ModeChipProps {
  modeState: ChatModeState | null
  onCycle: (nextModeId: string) => void
}

export function ModeChip({ modeState, onCycle }: ModeChipProps) {
  const [open, setOpen] = useState(false)

  if (!modeState || modeState.availableModes.length === 0) {
    return null
  }

  const eligible = modeState.availableModes.filter(
    (m) => !modeState.unavailableModes.has(m.id),
  )
  if (eligible.length === 0) return null

  const current =
    eligible.find((m) => m.id === modeState.currentModeId) ?? eligible[0]

  const handleSelect = (modeId: string) => {
    setOpen(false)
    if (modeId === current.id) return
    onCycle(modeId)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex h-5 items-center rounded-full border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            {current.name}
          </button>
        }
      />
      <PopoverContent className="w-[240px] p-2" align="start">
        <p className="text-xs font-medium uppercase text-muted-foreground px-2 py-1">
          Mode
        </p>
        <div className="space-y-0.5">
          {eligible.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`flex flex-col items-start w-full px-3 py-2 rounded-md text-sm hover:bg-accent text-left ${
                m.id === current.id ? "bg-accent" : ""
              }`}
              onClick={() => handleSelect(m.id)}
            >
              <span className="font-medium">{m.name}</span>
              {m.description && (
                <span className="text-xs text-muted-foreground mt-0.5">
                  {m.description}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
