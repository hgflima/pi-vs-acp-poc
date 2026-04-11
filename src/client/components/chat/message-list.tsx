import { useRef, useEffect } from "react"
import type { Message } from "@/client/lib/types"
import type { PendingPrompt } from "@/client/hooks/use-interactive-prompts"
import { UserMessage } from "./user-message"
import { AssistantMessage } from "./assistant-message"
import { PermissionPrompt } from "./permission-prompt"
import { ElicitationPrompt } from "./elicitation-prompt"

interface MessageListProps {
  messages: Message[]
  streaming: boolean
  pendingPrompts?: Map<string, PendingPrompt>
  onRespondToPrompt?: (id: string, response: Record<string, unknown>) => Promise<boolean>
}

export function MessageList({ messages, streaming, pendingPrompts, onRespondToPrompt }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const isAutoScrolling = useRef(false)

  const scrollToBottom = () => {
    const el = scrollContainerRef.current
    if (!el) return
    isAutoScrolling.current = true
    el.scrollTop = el.scrollHeight
    // Reset flag after browser processes the scroll event
    requestAnimationFrame(() => { isAutoScrolling.current = false })
  }

  // Reset userScrolledUp when a new user message is added
  useEffect(() => {
    userScrolledUp.current = false
    scrollToBottom()
  }, [messages.length])

  // Auto-scroll: poll during streaming to catch all DOM updates
  useEffect(() => {
    if (!streaming) return
    const id = setInterval(() => {
      if (userScrolledUp.current) return
      scrollToBottom()
    }, 50)
    return () => clearInterval(id)
  }, [streaming])

  const handleScroll = () => {
    // Ignore scroll events triggered by our programmatic scrolling
    if (isAutoScrolling.current) return
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUp.current = distanceFromBottom > 50
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 h-full overflow-y-auto px-4"
    >
      <div className="max-w-3xl mx-auto w-full">
        {messages.map((message, index) =>
          message.role === "user" ? (
            <UserMessage key={index} message={message} />
          ) : (
            <AssistantMessage key={index} message={message} />
          ),
        )}
        {pendingPrompts && onRespondToPrompt &&
          Array.from(pendingPrompts.values()).map((p) => {
            if (p.kind === "permission") {
              return (
                <PermissionPrompt
                  key={p.id}
                  id={p.id}
                  toolCallId={p.toolCallId}
                  options={p.options}
                  onRespond={onRespondToPrompt}
                />
              )
            }
            return (
              <ElicitationPrompt
                key={p.id}
                id={p.id}
                message={p.message}
                requestedSchema={p.requestedSchema}
                onRespond={onRespondToPrompt}
              />
            )
          })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
