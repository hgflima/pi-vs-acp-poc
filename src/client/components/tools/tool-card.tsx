import type { ToolSegment } from "@/client/lib/types";
import { BashCard } from "./bash-card";
import { FileCard } from "./file-card";
import { SearchCard } from "./search-card";
import { AgentCard } from "./agent-card";
import { ToolsearchCard } from "./toolsearch-card";
import { GenericCard } from "./generic-card";

interface ToolCardProps {
  segment: ToolSegment;
}

export function ToolCard({ segment }: ToolCardProps) {
  switch (segment.variant) {
    case "bash":
      return <BashCard segment={segment} />;
    case "file":
      return <FileCard segment={segment} />;
    case "search":
      return <SearchCard segment={segment} />;
    case "agent":
      return <AgentCard segment={segment} />;
    case "toolsearch":
      return <ToolsearchCard segment={segment} />;
    case "generic":
    default:
      return <GenericCard segment={segment} />;
  }
}
