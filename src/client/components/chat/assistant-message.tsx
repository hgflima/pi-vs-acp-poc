import { memo } from "react";
import { Sparkles } from "lucide-react";
import type { AssistantMessage as AssistantMessageType } from "@/client/lib/types";
import { MarkdownRenderer } from "./markdown-renderer";
import { ThinkingIndicator } from "./thinking-indicator";
import { StreamingCursor } from "./streaming-cursor";
import { ToolCard } from "../tools/tool-card";

interface AssistantMessageProps {
  message: AssistantMessageType;
}

export const AssistantMessage = memo(function AssistantMessage({ message }: AssistantMessageProps) {
  return (
    <div className="flex gap-3 py-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium mb-1">Assistant</p>
        <div>
          {/* Thinking indicator: show when streaming but no segments yet (D-04) */}
          {message.streaming && message.segments.length === 0 && <ThinkingIndicator />}

          {/* Iterate segments: text via MarkdownRenderer, tools via ToolCard */}
          {message.segments.map((segment, i) => {
            if (segment.type === "text" && segment.content) {
              return (
                <div key={i}>
                  <MarkdownRenderer content={segment.content} />
                </div>
              );
            }
            if (segment.type === "tool") {
              return <ToolCard key={segment.toolId} segment={segment} />;
            }
            return null;
          })}

          {/* Streaming cursor after last segment (D-05) */}
          {message.streaming && <StreamingCursor />}
        </div>
      </div>
    </div>
  );
});
