import { Search } from "lucide-react";
import type { ToolSegment } from "@/client/lib/types";
import { ToolStatusIcon } from "./tool-status-icon";

interface SearchCardProps {
  segment: ToolSegment;
}

export function SearchCard({ segment }: SearchCardProps) {
  const args = segment.args as { pattern?: string; directory?: string };
  const pattern = args?.pattern || args?.directory || "Search";
  const output = segment.error || segment.result;

  return (
    <div
      role="region"
      aria-label={`${segment.toolName} tool call`}
      className="my-4 rounded-lg border border-blue-200 overflow-hidden bg-blue-50"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-blue-50">
        <Search className="h-3.5 w-3.5 text-blue-600" />
        <span className="font-mono text-xs truncate">{pattern}</span>
        <span className="ml-auto">
          <ToolStatusIcon status={segment.status} />
        </span>
      </div>

      {/* Content */}
      {output && (
        <div className="border-t border-blue-200">
          <div
            className="px-4 py-2 bg-white font-mono text-xs whitespace-pre-wrap max-h-64 overflow-auto"
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
