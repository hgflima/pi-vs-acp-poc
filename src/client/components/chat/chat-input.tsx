import { useState, useRef, useCallback, useEffect } from "react"
import { Send, Square } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { cn } from "@/client/lib/cn"

interface ChatInputProps {
  onSend: (content: string) => void
  onStop: () => void
  streaming: boolean
  disabled: boolean
}

export function ChatInput({ onSend, onStop, streaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px"
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (!streaming && !disabled) {
          handleSend()
        }
      }
    },
    [handleSend, streaming, disabled],
  )

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-lg border bg-background p-2",
        "focus-within:ring-2 focus-within:ring-ring/50",
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
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
          disabled={disabled || value.trim() === ""}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
