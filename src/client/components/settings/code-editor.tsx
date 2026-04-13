import { useEffect, useRef } from "react"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { oneDark } from "@codemirror/theme-one-dark"
import { markdown } from "@codemirror/lang-markdown"
import { json } from "@codemirror/lang-json"
import { yaml } from "@codemirror/lang-yaml"
import { cn } from "@/client/lib/utils"

interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: "markdown" | "json" | "yaml" | "toml" | "auto"
  filename?: string
  readOnly?: boolean
  className?: string
}

function detectLanguage(filename: string): "markdown" | "json" | "yaml" | undefined {
  const ext = filename.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "md":
    case "markdown":
      return "markdown"
    case "json":
      return "json"
    case "yml":
    case "yaml":
      return "yaml"
    default:
      return undefined
  }
}

function getLanguageExtension(lang: string | undefined) {
  switch (lang) {
    case "markdown":
      return markdown()
    case "json":
      return json()
    case "yaml":
      return yaml()
    default:
      return []
  }
}

export function CodeEditor({
  value,
  onChange,
  language = "auto",
  filename,
  readOnly = false,
  className,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const resolvedLang =
    language === "auto" && filename
      ? detectLanguage(filename)
      : language === "auto"
        ? undefined
        : language === "toml"
          ? undefined
          : language

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        oneDark,
        getLanguageExtension(resolvedLang),
        updateListener,
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        keymap.of([]),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only recreate editor when language or readOnly changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedLang, readOnly])

  // Sync external value changes without recreating the editor
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentContent = view.state.doc.toString()
    if (currentContent !== value) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className={cn(
        "min-h-[200px] rounded-md border border-border overflow-hidden [&_.cm-editor]:min-h-[200px] [&_.cm-editor]:outline-none [&_.cm-scroller]:min-h-[200px]",
        className,
      )}
    />
  )
}
