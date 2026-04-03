import { User } from "lucide-react";
import type { UserMessage as UserMessageType } from "@/client/lib/types";

interface UserMessageProps {
  message: UserMessageType;
}

export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className="flex gap-3 py-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <User className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium mb-1">You</p>
        <div className="bg-muted rounded-lg px-4 py-3">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    </div>
  );
}
