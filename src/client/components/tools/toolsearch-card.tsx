import { Wrench } from "lucide-react";
import type { ToolSegment } from "@/client/lib/types";
import { ToolStatusIcon } from "./tool-status-icon";

interface ToolsearchCardProps {
  segment: ToolSegment;
}

export function ToolsearchCard({ segment }: ToolsearchCardProps) {
  const output = segment.result;

  return (
    <div
      role="region"
      aria-label="toolsearch tool call"
      className="my-4 rounded-lg border border-border overflow-hidden bg-muted"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Tool Search</span>
        <span className="ml-auto">
          <ToolStatusIcon status={segment.status} />
        </span>
      </div>

      {/* Content */}
      {output && (
        <div className="border-t border-border">
          <div
            className="px-4 py-2 bg-background text-sm max-h-64 overflow-auto"
            aria-live="polite"
            tabIndex={0}
          >
            {output.split("\n").map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
