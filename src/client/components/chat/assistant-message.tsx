import { memo } from "react";
import { Sparkles } from "lucide-react";
import type { AssistantMessage as AssistantMessageType } from "@/client/lib/types";
import { MarkdownRenderer } from "./markdown-renderer";
import { ThinkingIndicator } from "./thinking-indicator";
import { StreamingCursor } from "./streaming-cursor";

interface AssistantMessageProps {
  message: AssistantMessageType;
}

export const AssistantMessage = memo(function AssistantMessage({ message }: AssistantMessageProps) {
  const hasContent = message.segments.some(
    (s) => s.type === "text" && s.content.length > 0
  );
  const textContent = message.segments
    .filter((s) => s.type === "text")
    .map((s) => s.content)
    .join("");

  return (
    <div className="flex gap-3 py-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium mb-1">Assistant</p>
        <div>
          {/* Thinking indicator: show when streaming but no content yet (D-04) */}
          {message.streaming && !hasContent && <ThinkingIndicator />}

          {/* Markdown-rendered text segments */}
          {hasContent && (
            <div>
              <MarkdownRenderer content={textContent} />
              {/* Streaming cursor after last text (D-05) */}
              {message.streaming && <StreamingCursor />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
