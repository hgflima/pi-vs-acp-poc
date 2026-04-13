import { useEffect, useRef, useState } from "react"
import type { Message, AssistantMessage, ToolSegment } from "@/client/lib/types"

type AgentStatus =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "reasoning" }
  | { kind: "tool_execution"; toolName: string }
  | { kind: "error"; message: string }

function deriveStatus(
  streaming: boolean,
  error: string | null,
  messages: Message[],
): AgentStatus {
  if (error) return { kind: "error", message: error }
  if (!streaming) return { kind: "idle" }

  const last = messages[messages.length - 1]
  if (!last || last.role !== "user") {
    // Streaming started but no assistant message yet
    return { kind: "thinking" }
  }

  if (last.role === "assistant") {
    const assistant = last as AssistantMessage
    const segments = assistant.segments
    if (segments.length === 0) return { kind: "thinking" }

    const lastSeg = segments[segments.length - 1]
    if (lastSeg.type === "tool" && (lastSeg as ToolSegment).status === "running") {
      return { kind: "tool_execution", toolName: (lastSeg as ToolSegment).toolName }
    }

    // If streaming but the only content so far is empty text, treat as reasoning
    const hasSubstantiveText = segments.some(
      (s) => s.type === "text" && s.content.trim().length > 0,
    )
    if (!hasSubstantiveText) return { kind: "reasoning" }

    return { kind: "thinking" }
  }

  return { kind: "thinking" }
}

interface StatuslineProps {
  streaming: boolean
  error: string | null
  messages: Message[]
  connected?: boolean
}

export function Statusline({ streaming, error, messages, connected = true }: StatuslineProps) {
  const status = deriveStatus(streaming, error, messages)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer for tool_execution
  useEffect(() => {
    if (status.kind === "tool_execution") {
      setElapsed(0)
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } else {
      setElapsed(0)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [status.kind, status.kind === "tool_execution" ? (status as { toolName: string }).toolName : ""])

  const dot = statusDot(status)
  const text = statusText(status, elapsed)

  return (
    <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground transition-opacity duration-150">
      <div className="flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${dot.color} ${dot.pulse ? "animate-pulse" : ""}`} />
        <span className="transition-opacity duration-150">{text}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
        <span>{connected ? "Connected" : "Disconnected"}</span>
      </div>
    </div>
  )
}

function statusDot(status: AgentStatus): { color: string; pulse: boolean } {
  switch (status.kind) {
    case "idle":
      return { color: "bg-gray-400", pulse: false }
    case "thinking":
      return { color: "bg-blue-500", pulse: true }
    case "reasoning":
      return { color: "bg-purple-500", pulse: true }
    case "tool_execution":
      return { color: "bg-yellow-500", pulse: false }
    case "error":
      return { color: "bg-red-500", pulse: false }
  }
}

function statusText(status: AgentStatus, elapsed: number): string {
  switch (status.kind) {
    case "idle":
      return "Ready"
    case "thinking":
      return "Thinking..."
    case "reasoning":
      return "Reasoning..."
    case "tool_execution": {
      const secs = String(elapsed).padStart(2, "0")
      return `${status.toolName} ${secs}s`
    }
    case "error":
      return status.message
  }
}
