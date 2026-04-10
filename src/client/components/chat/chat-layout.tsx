import { useCallback, useEffect, useState } from "react"
import { useChat } from "@/client/hooks/use-chat"
import { useAgent } from "@/client/hooks/use-agent"
import { useHarness } from "@/client/hooks/use-harness"
import { useRuntime } from "@/client/hooks/use-runtime"
import { deleteAcpSession } from "@/client/lib/api"
import { ChatHeader } from "./chat-header"
import { ChatInput } from "./chat-input"
import { MessageList } from "./message-list"
import { EmptyState } from "./empty-state"
import { ErrorDisplay } from "./error-display"
import type { AgentId } from "@/client/lib/types"

function newChatId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function ChatLayout() {
  const { messages, streaming, error, sendMessage, stopGeneration, clearMessages, clearError } =
    useChat()
  const agent = useAgent()
  const { harness } = useHarness()
  const runtime = useRuntime()
  const [chatId, setChatId] = useState<string>(() => newChatId())

  const rotateChatId = useCallback(() => {
    setChatId(newChatId())
  }, [])

  // Cleanup server-side ACP session when chatId changes or component unmounts.
  // Captures the current chatId + runtime via closure; runs with OLD values
  // after they change, which is exactly when the old session must be released.
  useEffect(() => {
    const currentRuntime = runtime.runtime
    return () => {
      if (currentRuntime === "acp") {
        void deleteAcpSession(chatId)
      }
    }
  }, [chatId, runtime.runtime])

  const dispatchSend = useCallback(
    (content: string) => {
      if (runtime.runtime === "acp") {
        if (!runtime.acpAgent) return
        sendMessage(content, { runtime: "acp", acpAgent: runtime.acpAgent, chatId })
        return
      }
      if (!agent.model) return
      sendMessage(content, {
        runtime: "pi",
        model: agent.model,
        provider: agent.provider,
      })
    },
    [sendMessage, runtime.runtime, runtime.acpAgent, agent.model, agent.provider, chatId],
  )

  const handleSend = useCallback(
    (content: string) => {
      dispatchSend(content)
    },
    [dispatchSend],
  )

  const handleRetry = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMsg && lastUserMsg.role === "user") {
      clearError()
      dispatchSend(lastUserMsg.content)
    }
  }, [messages, clearError, dispatchSend])

  const handleNewChat = useCallback(() => {
    clearMessages()
    rotateChatId()
  }, [clearMessages, rotateChatId])

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
        connectedAgents={agent.connectedAgents}
        onAgentSwitch={handleAgentSwitch}
        onModelSwitch={handleModelSwitch}
        onAuthenticate={agent.authenticate}
        harnessApplied={harness.applied}
        runtime={runtime.runtime}
        acpAgent={runtime.acpAgent}
        acpStatus={runtime.acpStatus}
        acpLoading={runtime.acpLoading}
        acpError={runtime.acpError}
        onRuntimeSwitch={(mode) => {
          clearMessages()
          rotateChatId()
          runtime.setRuntime(mode)
        }}
        onAcpAgentSwitch={(id) => {
          clearMessages()
          rotateChatId()
          runtime.setAcpAgent(id)
        }}
        onRefreshAcpStatus={runtime.refreshAcpStatus}
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
