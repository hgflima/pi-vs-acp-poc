import { Terminal } from "lucide-react";
import type { ToolSegment } from "@/client/lib/types";
import { ToolStatusIcon } from "./tool-status-icon";

interface BashCardProps {
  segment: ToolSegment;
}

export function BashCard({ segment }: BashCardProps) {
  const command = (segment.args as { command?: string })?.command || "";
  const output = segment.error || segment.result;

  return (
    <div
      role="region"
      aria-label="bash tool call"
      className="my-4 rounded-lg border border-zinc-700 overflow-hidden bg-zinc-900"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 text-xs">
        <Terminal className="h-3.5 w-3.5" />
        <span className="font-medium">Terminal</span>
        <span className="ml-auto">
          <ToolStatusIcon status={segment.status} />
        </span>
      </div>

      {/* Command */}
      <div className="px-4 py-2 font-mono text-sm text-zinc-200">
        <span className="text-zinc-500">$ </span>
        {command}
      </div>

      {/* Output */}
      {output && (
        <div className="border-t border-zinc-700">
          <div
            className={`px-4 py-2 font-mono text-xs whitespace-pre-wrap max-h-64 overflow-auto ${
              segment.error ? "text-red-400" : "text-zinc-400"
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
