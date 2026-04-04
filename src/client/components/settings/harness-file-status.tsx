import { CheckCircle, FolderOpen, MinusCircle, XCircle, AlertTriangle } from "lucide-react"

interface HarnessFileStatusProps {
  filename: string
  status: "found" | "found-dir" | "not-found" | "error" | "too-large"
  size?: number
  count?: number
  error?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

const statusConfig = {
  found: {
    Icon: CheckCircle,
    iconClass: "text-green-700",
  },
  "found-dir": {
    Icon: FolderOpen,
    iconClass: "text-green-700",
  },
  "not-found": {
    Icon: MinusCircle,
    iconClass: "text-muted-foreground",
  },
  error: {
    Icon: XCircle,
    iconClass: "text-red-500",
  },
  "too-large": {
    Icon: AlertTriangle,
    iconClass: "text-amber-500",
  },
} as const

function getStatusText(props: HarnessFileStatusProps): { text: string; className: string } {
  switch (props.status) {
    case "found":
      return {
        text: `Loaded -- ${formatBytes(props.size ?? 0)}`,
        className: "text-muted-foreground",
      }
    case "found-dir":
      return {
        text: `${props.count ?? 0} items found`,
        className: "text-muted-foreground",
      }
    case "not-found":
      return {
        text: "Not found",
        className: "text-muted-foreground",
      }
    case "error":
      return {
        text: props.error ?? "Unknown error",
        className: "text-red-500",
      }
    case "too-large":
      return {
        text: `File too large (${formatBytes(props.size ?? 0)}, max 100 KB)`,
        className: "text-amber-500",
      }
  }
}

export function HarnessFileStatus(props: HarnessFileStatusProps) {
  const { filename, status } = props
  const { Icon, iconClass } = statusConfig[status]
  const { text, className } = getStatusText(props)

  return (
    <div className="flex h-10 items-center px-3 gap-2">
      <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
      <span className="text-sm">{filename}</span>
      <span className={`text-sm ml-auto ${className}`}>{text}</span>
    </div>
  )
}
