import { Loader2, Check, X } from "lucide-react";
import type { ToolStatus } from "@/client/lib/types";

interface ToolStatusIconProps {
  status: ToolStatus;
}

export function ToolStatusIcon({ status }: ToolStatusIconProps) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" aria-label="Running" />;
    case "done":
      return <Check className="h-3.5 w-3.5 text-green-500" aria-label="Completed" />;
    case "error":
      return <X className="h-3.5 w-3.5 text-red-500" aria-label="Error" />;
  }
}
