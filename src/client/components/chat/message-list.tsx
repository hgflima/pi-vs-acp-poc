import { useRef, useEffect } from "react"
import type { Message } from "@/client/lib/types"
import { UserMessage } from "./user-message"
import { AssistantMessage } from "./assistant-message"

interface MessageListProps {
  messages: Message[]
  streaming: boolean
}

export function MessageList({ messages, streaming }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const prevMessageCount = useRef(messages.length)

  // Reset userScrolledUp when a new user message is added
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      const lastNew = messages[messages.length - 1]
      if (lastNew?.role === "user") {
        userScrolledUp.current = false
      }
    }
    prevMessageCount.current = messages.length
  }, [messages.length, messages])

  // Auto-scroll during streaming when user hasn't scrolled up
  useEffect(() => {
    if (streaming && !userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  })

  const handleScroll = () => {
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
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
