"use client"

import { useActionState } from "react"
import type { Field } from "@/lib/resource"
import type { FormState } from "@/lib/actions"

type Props = {
  fields: (Field & { value: string })[]
  refs: Record<string, { value: string; label: string }[]>
  action: (prev: FormState, form: FormData) => Promise<FormState>
  submitLabel: string
}

export function RecordForm({ fields, refs, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {})

  return (
    <form action={formAction} className="card space-y-5 p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((f) => {
          const wide = f.kind === "textarea" || f.kind === "json"
          const options = refs[f.name]
          return (
            <label key={f.name} className={`block ${wide ? "sm:col-span-2" : ""} ${f.kind === "boolean" ? "flex items-center gap-3 self-end py-2" : ""}`}>
              {f.kind !== "boolean" && (
                <span className="mb-1.5 block text-xs font-medium text-muted">
                  {f.label}
                  {f.required && <span className="text-accent"> *</span>}
                </span>
              )}
              {options ? (
                <>
                  <select className="input" name={f.name} defaultValue={f.value} required={f.required}>
                    <option value="">{options.length ? "Select…" : "Nothing to select yet"}</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {!options.length && f.required && (
                    <span className="mt-1 block text-xs text-muted">Create a {f.label.toLowerCase()} first, then come back.</span>
                  )}
                </>
              ) : f.kind === "enum" ? (
                <select className="input capitalize" name={f.name} defaultValue={f.value} required={f.required}>
                  {!f.required && <option value="">—</option>}
                  {f.options?.map((o) => (
                    <option key={o} value={o}>{o.replaceAll("_", " ")}</option>
                  ))}
                </select>
              ) : f.kind === "boolean" ? (
                <>
                  <input type="checkbox" name={f.name} defaultChecked={f.value === "true"} className="size-4 accent-[var(--accent)]" />
                  <span className="text-sm">{f.label}</span>
                </>
              ) : f.kind === "textarea" || f.kind === "json" ? (
                <textarea
                  className={`input min-h-28 ${f.kind === "json" ? "font-mono text-xs" : ""}`}
                  name={f.name}
                  defaultValue={f.value}
                  required={f.required}
                  placeholder={f.kind === "json" ? "{ }" : undefined}
                />
              ) : (
                <input
                  className="input"
                  name={f.name}
                  defaultValue={f.value}
                  required={f.required}
                  placeholder={f.kind === "array" ? "comma, separated" : f.kind === "uuid" ? "ID" : undefined}
                  type={f.kind === "number" || f.kind === "decimal" ? "number" : f.kind === "datetime" ? "datetime-local" : f.kind === "date" ? "date" : "text"}
                  step={f.kind === "decimal" ? "0.01" : undefined}
                />
              )}
            </label>
          )
        })}
      </div>
      {state.error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
      <div className="flex justify-end border-t border-line pt-5">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  )
}
