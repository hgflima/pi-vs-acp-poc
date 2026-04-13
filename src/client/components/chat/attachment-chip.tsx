import { X, FileText, Image } from "lucide-react"
import { cn } from "@/client/lib/utils"
import type { ChatAttachment } from "@/client/lib/types"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface AttachmentChipProps {
  attachment: ChatAttachment
  onRemove: (id: string) => void
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const isImage = attachment.mimeType.startsWith("image/")

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1",
        "text-xs text-muted-foreground",
      )}
    >
      {isImage && attachment.preview ? (
        <img
          src={attachment.preview}
          alt={attachment.filename}
          className="h-8 w-8 rounded object-cover"
        />
      ) : isImage ? (
        <Image className="h-4 w-4 shrink-0" />
      ) : (
        <FileText className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate max-w-[120px]">{attachment.filename}</span>
      <span className="shrink-0">{formatFileSize(attachment.size)}</span>
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="ml-1 shrink-0 rounded-full p-0.5 hover:bg-muted-foreground/20"
        aria-label={`Remove ${attachment.filename}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
