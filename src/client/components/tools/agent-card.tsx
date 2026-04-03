import { Bot } from "lucide-react";
import type { ToolSegment } from "@/client/lib/types";
import { ToolStatusIcon } from "./tool-status-icon";

interface AgentCardProps {
  segment: ToolSegment;
}

export function AgentCard({ segment }: AgentCardProps) {
  const agentName = segment.toolName || "Agent";
  const output = segment.error || segment.result;
  const showContent = segment.status !== "running" && output;

  return (
    <div
      role="region"
      aria-label={`${segment.toolName} tool call`}
      className="my-4 rounded-lg border border-orange-200 overflow-hidden bg-orange-50"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-orange-50">
        <Bot className="h-3.5 w-3.5 text-orange-600" />
        <span className="text-xs font-medium">{agentName}</span>
        <span className="ml-auto">
          <ToolStatusIcon status={segment.status} />
        </span>
      </div>

      {/* Content -- only shown when not running */}
      {showContent && (
        <div className="border-t border-orange-200">
          <div
            className="px-4 py-2 bg-white text-sm max-h-64 overflow-auto"
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
