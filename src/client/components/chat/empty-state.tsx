import { Sparkles } from "lucide-react"
import { Button } from "@/client/components/ui/button"

const suggestions = [
  "Explique este codigo",
  "Escreva um teste unitario",
  "Revise este PR",
]

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full">
      <Sparkles className="h-12 w-12 text-muted-foreground/30" />
      <h2 className="text-xl font-semibold">Como posso ajudar?</h2>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((text) => (
          <Button
            key={text}
            variant="outline"
            className="rounded-full"
            onClick={() => onSuggestionClick(text)}
          >
            {text}
          </Button>
        ))}
      </div>
    </div>
  )
}
