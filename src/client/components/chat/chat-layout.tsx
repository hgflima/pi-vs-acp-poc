import { useCallback } from "react"
import { useChat } from "@/client/hooks/use-chat"
import { useAuth } from "@/client/hooks/use-auth"
import { ChatHeader } from "./chat-header"
import { ChatInput } from "./chat-input"
import { MessageList } from "./message-list"
import { EmptyState } from "./empty-state"
import { ErrorDisplay } from "./error-display"

export function ChatLayout() {
  const { messages, streaming, error, sendMessage, stopGeneration, clearMessages, clearError } =
    useChat()
  const { auth } = useAuth()

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content, {
        model: "claude-sonnet-4-20250514",
        provider: auth.provider || "anthropic",
      })
    },
    [sendMessage, auth.provider],
  )

  const handleRetry = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMsg && lastUserMsg.role === "user") {
      clearError()
      sendMessage(lastUserMsg.content, {
        model: "claude-sonnet-4-20250514",
        provider: auth.provider || "anthropic",
      })
    }
  }, [messages, clearError, sendMessage, auth.provider])

  const handleNewChat = useCallback(() => {
    clearMessages()
  }, [clearMessages])

  const handleSuggestionClick = useCallback(
    (text: string) => {
      handleSend(text)
    },
    [handleSend],
  )

  return (
    <div className="flex flex-col h-screen bg-background">
      <ChatHeader onNewChat={handleNewChat} />
      <div className="flex-1 overflow-hidden">
        {messages.length === 0 && !streaming ? (
          <EmptyState onSuggestionClick={handleSuggestionClick} />
        ) : (
          <MessageList messages={messages} streaming={streaming} />
        )}
      </div>
      {error && (
        <div className="px-4 pb-2 max-w-3xl mx-auto w-full">
          <ErrorDisplay error={error} onRetry={handleRetry} onDismiss={clearError} />
        </div>
      )}
      <div className="border-t px-4 py-3">
        <div className="max-w-3xl mx-auto w-full">
          <ChatInput
            onSend={handleSend}
            onStop={stopGeneration}
            streaming={streaming}
            disabled={!auth.provider}
          />
        </div>
      </div>
    </div>
  )
}
