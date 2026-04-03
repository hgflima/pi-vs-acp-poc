import { FileText } from "lucide-react";
import type { ToolSegment } from "@/client/lib/types";
import { ToolStatusIcon } from "./tool-status-icon";

interface FileCardProps {
  segment: ToolSegment;
}

export function FileCard({ segment }: FileCardProps) {
  const filePath = (segment.args as { file_path?: string })?.file_path || "File";
  const output = segment.error || segment.result;

  return (
    <div
      role="region"
      aria-label={`${segment.toolName} tool call`}
      className="my-4 rounded-lg border border-green-200 overflow-hidden bg-green-50"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-green-50">
        <FileText className="h-3.5 w-3.5 text-green-600" />
        <span className="font-mono text-xs truncate">{filePath}</span>
        <span className="ml-auto">
          <ToolStatusIcon status={segment.status} />
        </span>
      </div>

      {/* Content */}
      {output && (
        <div className="border-t border-green-200">
          <div
            className={`px-4 py-2 bg-white font-mono text-sm whitespace-pre-wrap max-h-64 overflow-auto ${
              segment.error ? "text-red-500" : "text-foreground"
            }`}
            aria-live="polite"
            tabIndex={0}
          >
            {output}
          </div>
        </div>
      )}
    </div>
  );
}
