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
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
