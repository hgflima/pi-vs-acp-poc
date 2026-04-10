import { useReducer, useRef, useCallback } from "react"
import type { Message, AssistantMessage, TextSegment, ToolSegment, ToolCardVariant } from "@/client/lib/types"
import { parseSSEStream } from "@/client/lib/stream-parser"

interface ChatState {
  messages: Message[]
  streaming: boolean
  error: string | null
}

type ChatAction =
  | { type: "ADD_USER_MESSAGE"; content: string }
  | { type: "START_STREAMING" }
  | { type: "APPEND_TEXT_DELTA"; data: string }
  | { type: "TOOL_START"; tool: string; id: string; params: Record<string, unknown> }
  | { type: "TOOL_UPDATE"; id: string; data: string }
  | { type: "TOOL_END"; id: string; result: string; status: "done" | "error" }
  | { type: "STOP_STREAMING" }
  | { type: "SET_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "CLEAR_MESSAGES" }

const initialState: ChatState = {
  messages: [],
  streaming: false,
  error: null,
}

function toolNameToVariant(toolName: string): ToolCardVariant {
  const lower = toolName.toLowerCase()
  switch (lower) {
    case "bash":
      return "bash"
    case "read":
    case "read_file":
    case "write":
    case "write_file":
    case "edit":
      return "file"
    case "glob":
    case "grep":
    case "find":
    case "ls":
    case "list_files":
      return "search"
    case "subagent":
    case "skill":
    case "agent":
      return "agent"
    case "toolsearch":
    case "tool_search":
      return "toolsearch"
    default:
      return "generic"
  }
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_USER_MESSAGE":
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: "user", content: action.content, timestamp: Date.now() },
        ],
      }

    case "START_STREAMING":
      return {
        ...state,
        streaming: true,
        error: null,
        messages: [
          ...state.messages,
          { role: "assistant", segments: [], streaming: true, timestamp: Date.now() },
        ],
      }

    case "APPEND_TEXT_DELTA": {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1] as AssistantMessage
      const segments = [...last.segments]
      const lastSeg = segments[segments.length - 1] as TextSegment | undefined

      if (lastSeg?.type === "text") {
        segments[segments.length - 1] = {
          ...lastSeg,
          content: lastSeg.content + action.data,
        }
      } else {
        segments.push({ type: "text", content: action.data })
      }

      msgs[msgs.length - 1] = { ...last, segments }
      return { ...state, messages: msgs }
    }

    case "TOOL_START": {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1] as AssistantMessage
      const segments = [
        ...last.segments,
        {
          type: "tool" as const,
          toolId: action.id,
          toolName: action.tool,
          variant: toolNameToVariant(action.tool),
          status: "running" as const,
          args: action.params,
        },
      ]
      msgs[msgs.length - 1] = { ...last, segments }
      return { ...state, messages: msgs }
    }

    case "TOOL_UPDATE": {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1] as AssistantMessage
      const matchIndex = last.segments.findIndex(
        (seg) => seg.type === "tool" && seg.toolId === action.id
      )
      if (matchIndex === -1) return state
      const segments = [...last.segments]
      const seg = segments[matchIndex] as ToolSegment
      segments[matchIndex] = {
        ...seg,
        result: (seg.result || "") + action.data,
      }
      msgs[msgs.length - 1] = { ...last, segments }
      return { ...state, messages: msgs }
    }

    case "TOOL_END": {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1] as AssistantMessage
      const matchIndex = last.segments.findIndex(
        (seg) => seg.type === "tool" && seg.toolId === action.id
      )
      if (matchIndex === -1) return state
      const segments = [...last.segments]
      const seg = segments[matchIndex] as ToolSegment
      if (action.status === "error") {
        segments[matchIndex] = { ...seg, status: "error", error: action.result }
      } else {
        segments[matchIndex] = { ...seg, status: "done", result: action.result }
      }
      msgs[msgs.length - 1] = { ...last, segments }
      return { ...state, messages: msgs }
    }

    case "STOP_STREAMING": {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, streaming: false }
      }
      return { ...state, streaming: false, messages: msgs }
    }

    case "SET_ERROR": {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, streaming: false }
      }
      return { ...state, streaming: false, error: action.message, messages: msgs }
    }

    case "CLEAR_ERROR":
      return { ...state, error: null }

    case "CLEAR_MESSAGES":
      return { ...initialState }

    default:
      return state
  }
}

export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialState)
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (
      content: string,
      config:
        | { runtime?: "pi"; model: string; provider: "anthropic" | "openai" }
        | { runtime: "acp"; acpAgent: string }
    ) => {
      dispatch({ type: "ADD_USER_MESSAGE", content })
      dispatch({ type: "START_STREAMING" })

      const controller = new AbortController()
      abortControllerRef.current = controller

      const body =
        config.runtime === "acp"
          ? { runtime: "acp" as const, message: content, acpAgent: config.acpAgent }
          : {
              runtime: "pi" as const,
              message: content,
              model: config.model,
              provider: config.provider,
            }

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) {
          let errMsg = "Request failed"
          try {
            const err = await response.json()
            errMsg = err.error || errMsg
          } catch {
            /* use default */
          }
          dispatch({ type: "SET_ERROR", message: errMsg })
          return
        }

        for await (const event of parseSSEStream(response, controller.signal)) {
          switch (event.type) {
            case "text_delta":
              dispatch({ type: "APPEND_TEXT_DELTA", data: event.data })
              break
            case "tool_start":
              dispatch({
                type: "TOOL_START",
                tool: event.tool,
                id: event.id,
                params: event.params,
              })
              break
            case "tool_update":
              dispatch({
                type: "TOOL_UPDATE",
                id: event.id,
                data: event.data,
              })
              break
            case "tool_end":
              dispatch({
                type: "TOOL_END",
                id: event.id,
                result: event.result,
                status: event.status,
              })
              break
            case "error":
              dispatch({ type: "SET_ERROR", message: event.message })
              break
            case "done":
              break
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User clicked stop -- not an error, text is preserved
        } else {
          dispatch({
            type: "SET_ERROR",
            message: err instanceof Error ? err.message : "Connection error",
          })
        }
      } finally {
        dispatch({ type: "STOP_STREAMING" })
        abortControllerRef.current = null
      }
    },
    []
  )

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort()
    dispatch({ type: "CLEAR_MESSAGES" })
  }, [])

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" })
  }, [])

  return {
    messages: state.messages,
    streaming: state.streaming,
    error: state.error,
    sendMessage,
    stopGeneration,
    clearMessages,
    clearError,
  }
}
