import { getTableColumns, type Column } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"

export type Ref = {
  /** Key of another resource in this product, or a raw table. */
  table: PgTable
  /** Column shown in the dropdown. */
  label: string
}

export type Resource = {
  key: string
  label: string
  singular: string
  description?: string
  table: PgTable
  /** Columns shown in the list table (first one links to the record). */
  list: string[]
  /** Columns shown in the create/edit form. Defaults to every editable column. */
  form?: string[]
  /** Foreign keys rendered as selects of the tenant's rows. */
  refs?: Record<string, Ref>
  /** Required identifiers prefilled with a generated value, e.g. { orderNumber: "PO" }. */
  generate?: Record<string, string>
  /** Column used for the status badge. */
  status?: string
  /** Money columns formatted as currency. */
  money?: string[]
}

export type FieldKind = "text" | "textarea" | "number" | "decimal" | "boolean" | "datetime" | "date" | "enum" | "uuid" | "json" | "array"

export type Field = {
  name: string
  label: string
  kind: FieldKind
  required: boolean
  /** NOT NULL with a DB default: leave unset when blank so the default applies. */
  omitWhenBlank: boolean
  options?: string[]
}

const SYSTEM = new Set(["id", "tenantId", "createdAt", "updatedAt", "deletedAt"])
const LONG_TEXT = /(description|notes|content|reason|resolution|action|text|html|message|body)$/i

export function humanize(name: string) {
  return name
    .replace(/Id$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
}

function kindOf(name: string, col: Column): FieldKind {
  const t = col.columnType
  if (col.enumValues && t === "PgEnumColumn") return "enum"
  if (t === "PgInteger" || t === "PgBigInt53" || t === "PgSmallInt") return "number"
  if (t === "PgNumeric" || t === "PgDoublePrecision" || t === "PgReal") return "decimal"
  if (t === "PgBoolean") return "boolean"
  if (t === "PgTimestamp" || t === "PgTimestampString") return "datetime"
  if (t === "PgDate" || t === "PgDateString") return "date"
  if (t === "PgUUID") return "uuid"
  if (t === "PgJsonb" || t === "PgJson") return "json"
  if (t === "PgArray") return "array"
  return LONG_TEXT.test(name) ? "textarea" : "text"
}

export function columnsOf(table: PgTable) {
  return getTableColumns(table) as Record<string, Column>
}

export function fieldsFor(resource: Resource): Field[] {
  const cols = columnsOf(resource.table)
  const names = resource.form ?? Object.keys(cols).filter((n) => !SYSTEM.has(n))
  return names.map((name) => {
    const col = cols[name]
    if (!col) throw new Error(`${resource.key}: unknown column "${name}"`)
    return {
      name,
      label: humanize(name),
      kind: kindOf(name, col),
      required: col.notNull && !col.hasDefault,
      omitWhenBlank: col.notNull && col.hasDefault,
      options: col.enumValues as string[] | undefined,
    }
  })
}

export function generateValue(prefix: string) {
  const d = new Date()
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  return `${prefix}-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

/** Converts submitted form values into typed column values. */
export function parseForm(resource: Resource, form: FormData) {
  const values: Record<string, unknown> = {}
  for (const f of fieldsFor(resource)) {
    const raw = form.get(f.name)
    const str = typeof raw === "string" ? raw.trim() : ""
    if (f.kind === "boolean") {
      values[f.name] = raw === "on"
      continue
    }
    if (str === "") {
      if (f.required) throw new Error(`${f.label} is required`)
      if (!f.omitWhenBlank) values[f.name] = null
      continue
    }
    switch (f.kind) {
      case "number": {
        const n = Number.parseInt(str, 10)
        if (Number.isNaN(n)) throw new Error(`${f.label} must be a whole number`)
        values[f.name] = n
        break
      }
      case "decimal":
        if (Number.isNaN(Number(str))) throw new Error(`${f.label} must be a number`)
        values[f.name] = str
        break
      case "datetime":
        values[f.name] = new Date(str)
        break
      case "enum":
        if (f.options && !f.options.includes(str)) throw new Error(`${f.label} is invalid`)
        values[f.name] = str
        break
      case "json":
        try {
          values[f.name] = JSON.parse(str)
        } catch {
          throw new Error(`${f.label} must be valid JSON`)
        }
        break
      case "array":
        values[f.name] = str.split(",").map((s) => s.trim()).filter(Boolean)
        break
      default:
        values[f.name] = str
    }
  }
  return values
}

export function formatValue(resource: Resource, name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (resource.money?.includes(name)) {
    const n = Number(value)
    return Number.isNaN(n) ? String(value) : n.toLocaleString("en-US", { style: "currency", currency: "USD" })
  }
  if (value instanceof Date) return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "object") return JSON.stringify(value)
  return String(value).replaceAll("_", " ")
}

export function toInputValue(kind: FieldKind, value: unknown): string {
  if (value === null || value === undefined) return ""
  if (kind === "datetime" && value instanceof Date) {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  }
  if (kind === "json") return JSON.stringify(value, null, 2)
  if (kind === "array" && Array.isArray(value)) return value.join(", ")
  return String(value)
}
