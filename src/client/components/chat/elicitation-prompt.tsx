import { useState } from "react"
import { Button } from "@/client/components/ui/button"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import type {
  ElicitationSchema,
  ElicitationPropertySchema,
} from "@agentclientprotocol/sdk"

export interface ElicitationPromptProps {
  id: string
  message: string
  requestedSchema: ElicitationSchema
  onRespond: (id: string, response: Record<string, unknown>) => Promise<boolean>
}

type FormValue = string | number | boolean | string[]

function defaultValue(schema: ElicitationPropertySchema): FormValue {
  switch (schema.type) {
    case "boolean":
      return false
    case "number":
    case "integer":
      return ""
    case "array":
      return []
    case "string":
    default:
      return ""
  }
}

export function ElicitationPrompt({
  id,
  message,
  requestedSchema,
  onRespond,
}: ElicitationPromptProps) {
  const properties = requestedSchema.properties ?? {}
  const required = new Set(requestedSchema.required ?? [])

  const [values, setValues] = useState<Record<string, FormValue>>(() => {
    const init: Record<string, FormValue> = {}
    for (const [key, prop] of Object.entries(properties)) {
      init[key] = defaultValue(prop)
    }
    return init
  })
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setField = (key: string, value: FormValue) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    for (const key of required) {
      const v = values[key]
      const prop = properties[key]
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
        errs[key] = "Required"
        continue
      }
      if (prop?.type === "number" || prop?.type === "integer") {
        if (typeof v === "string" && Number.isNaN(Number(v))) {
          errs[key] = "Must be a number"
        }
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleAccept = async () => {
    if (!validate()) return
    const content: Record<string, unknown> = {}
    for (const [key, prop] of Object.entries(properties)) {
      const v = values[key]
      if (v === undefined || v === "") continue
      if (prop.type === "number" || prop.type === "integer") {
        const num = Number(v)
        if (!Number.isNaN(num)) content[key] = num
        continue
      }
      content[key] = v
    }
    setSubmitting(true)
    try {
      await onRespond(id, { action: { action: "accept", content } })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    setSubmitting(true)
    try {
      await onRespond(id, { action: { action: "cancel" } })
    } finally {
      setSubmitting(false)
    }
  }

  const renderField = (key: string, prop: ElicitationPropertySchema) => {
    const fieldId = `elic-${id}-${key}`
    const error = errors[key]
    const labelText =
      ("title" in prop && prop.title) || key + (required.has(key) ? " *" : "")

    if (prop.type === "boolean") {
      return (
        <div key={key} className="flex items-center gap-2 py-1">
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(values[key])}
            onChange={(e) => setField(key, e.target.checked)}
          />
          <Label htmlFor={fieldId}>{labelText}</Label>
        </div>
      )
    }

    if (prop.type === "array") {
      const items = ("items" in prop ? prop.items : undefined) as
        | { enum?: string[]; oneOf?: Array<{ const: string; title?: string }> }
        | undefined
      const options: Array<{ value: string; label: string }> =
        items?.enum?.map((v) => ({ value: v, label: v })) ??
        items?.oneOf?.map((o) => ({ value: o.const, label: o.title ?? o.const })) ??
        []
      const selected = (values[key] as string[]) ?? []
      return (
        <div key={key} className="flex flex-col gap-1 py-1">
          <Label>{labelText}</Label>
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => {
              const checked = selected.includes(opt.value)
              return (
                <label key={opt.value} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, opt.value]
                        : selected.filter((v) => v !== opt.value)
                      setField(key, next)
                    }}
                  />
                  {opt.label}
                </label>
              )
            })}
          </div>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )
    }

    if (prop.type === "string") {
      const enumValues = ("enum" in prop ? prop.enum : undefined) as
        | string[]
        | undefined
      if (enumValues && enumValues.length > 0) {
        return (
          <div key={key} className="flex flex-col gap-1 py-1">
            <Label htmlFor={fieldId}>{labelText}</Label>
            <select
              id={fieldId}
              className="border border-border rounded-md px-2 py-1 bg-background text-foreground"
              value={String(values[key] ?? "")}
              onChange={(e) => setField(key, e.target.value)}
            >
              <option value="">—</option>
              {enumValues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        )
      }
      return (
        <div key={key} className="flex flex-col gap-1 py-1">
          <Label htmlFor={fieldId}>{labelText}</Label>
          <Input
            id={fieldId}
            type="text"
            value={String(values[key] ?? "")}
            onChange={(e) => setField(key, e.target.value)}
          />
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )
    }

    if (prop.type === "number" || prop.type === "integer") {
      return (
        <div key={key} className="flex flex-col gap-1 py-1">
          <Label htmlFor={fieldId}>{labelText}</Label>
          <Input
            id={fieldId}
            type="number"
            value={String(values[key] ?? "")}
            onChange={(e) => setField(key, e.target.value)}
          />
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )
    }

    return null
  }

  return (
    <div className="my-3 rounded-md border border-border bg-card p-3 text-card-foreground">
      <div className="text-sm mb-2">{message}</div>
      <div className="flex flex-col gap-1">
        {Object.entries(properties).map(([key, prop]) => renderField(key, prop))}
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={handleAccept} disabled={submitting}>
          Submit
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
