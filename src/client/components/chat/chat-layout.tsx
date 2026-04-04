import { useCallback } from "react"
import { useChat } from "@/client/hooks/use-chat"
import { useAgent } from "@/client/hooks/use-agent"
import { useHarness } from "@/client/hooks/use-harness"
import { ChatHeader } from "./chat-header"
import { ChatInput } from "./chat-input"
import { MessageList } from "./message-list"
import { EmptyState } from "./empty-state"
import { ErrorDisplay } from "./error-display"
import type { AgentId } from "@/client/lib/types"

export function ChatLayout() {
  const { messages, streaming, error, sendMessage, stopGeneration, clearMessages, clearError } =
    useChat()
  const agent = useAgent()
  const { harness } = useHarness()

  const handleSend = useCallback(
    (content: string) => {
      if (!agent.model) return // guard against no model selected
      sendMessage(content, {
        model: agent.model,
        provider: agent.provider,
      })
    },
    [sendMessage, agent.model, agent.provider],
  )

  const handleRetry = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMsg && lastUserMsg.role === "user" && agent.model) {
      clearError()
      sendMessage(lastUserMsg.content, {
        model: agent.model,
        provider: agent.provider,
      })
    }
  }, [messages, clearError, sendMessage, agent.model, agent.provider])

  const handleNewChat = useCallback(() => {
    clearMessages()
  }, [clearMessages])

  const handleAgentSwitch = useCallback((id: AgentId) => {
    clearMessages()
    agent.switchAgent(id)
  }, [clearMessages, agent.switchAgent])

  const handleModelSwitch = useCallback((modelId: string) => {
    clearMessages()
    agent.switchModel(modelId)
  }, [clearMessages, agent.switchModel])

  const handleSuggestionClick = useCallback(
    (text: string) => {
      handleSend(text)
    },
    [handleSend],
  )

  return (
    <div className="flex flex-col h-screen bg-background">
      <ChatHeader
        onNewChat={handleNewChat}
        agentCurrent={agent.current}
        agentModel={agent.model}
        agentLabel={agent.label}
        agentIcon={agent.icon}
        availableModels={agent.availableModels}
        agentLoading={agent.loading}
        needsAuth={agent.needsAuth}
        agentProvider={agent.provider}
        onAgentSwitch={handleAgentSwitch}
        onModelSwitch={handleModelSwitch}
        onAuthenticate={agent.authenticate}
        harnessApplied={harness.applied}
      />
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
            disabled={false}
          />
        </div>
      </div>
    </div>
  )
}
