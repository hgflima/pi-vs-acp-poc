import { Cog } from "lucide-react";
import type { ToolSegment } from "@/client/lib/types";
import { ToolStatusIcon } from "./tool-status-icon";

interface GenericCardProps {
  segment: ToolSegment;
}

export function GenericCard({ segment }: GenericCardProps) {
  const toolName = segment.toolName || "Tool";
  const hasArgs = Object.keys(segment.args).length > 0;
  const output = segment.error || segment.result;

  return (
    <div
      role="region"
      aria-label={`${segment.toolName} tool call`}
      className="my-4 rounded-lg border border-border overflow-hidden bg-muted"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted">
        <Cog className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{toolName}</span>
        <span className="ml-auto">
          <ToolStatusIcon status={segment.status} />
        </span>
      </div>

      {/* Content */}
      <div
        className="border-t border-border bg-background px-4 py-2 font-mono text-xs whitespace-pre-wrap max-h-64 overflow-auto"
        aria-live="polite"
        tabIndex={0}
      >
        {hasArgs && (
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Params</p>
            <pre className="text-foreground">{JSON.stringify(segment.args, null, 2)}</pre>
          </div>
        )}
        {hasArgs && output && <hr className="my-2 border-border" />}
        {output && (
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Result</p>
            <pre className={segment.error ? "text-red-500" : "text-foreground"}>
              {output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
