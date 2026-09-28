import "server-only"
import { and, count, desc, eq, isNull, type SQL } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import { db } from "@/lib/db"
import { columnsOf, type Resource } from "@/lib/resource"
import { product } from "@/product.config"

export function getResource(key: string): Resource | undefined {
  return product.resources.find((r) => r.key === key)
}

function col(table: PgTable, name: string) {
  return columnsOf(table)[name] as unknown as PgColumn | undefined
}

/** Tenant filter, plus soft-delete filter when the table supports it. */
export function scope(table: PgTable, tenantId: string, ...extra: (SQL | undefined)[]) {
  const tenantCol = col(table, "tenantId")
  if (!tenantCol) throw new Error("Resource tables must have a tenantId column")
  const deleted = col(table, "deletedAt")
  return and(eq(tenantCol, tenantId), deleted ? isNull(deleted) : undefined, ...extra)
}

export async function listRows(resource: Resource, tenantId: string, limit = 200) {
  const created = col(resource.table, "createdAt")
  const q = db.select().from(resource.table).where(scope(resource.table, tenantId)).limit(limit)
  return (created ? await q.orderBy(desc(created)) : await q) as Record<string, unknown>[]
}

export async function countRows(table: PgTable, tenantId: string, extra?: SQL) {
  const [row] = await db.select({ n: count() }).from(table).where(scope(table, tenantId, extra))
  return row?.n ?? 0
}

export async function getRow(resource: Resource, tenantId: string, id: string) {
  const idCol = col(resource.table, "id")!
  const [row] = await db.select().from(resource.table).where(scope(resource.table, tenantId, eq(idCol, id))).limit(1)
  return row as Record<string, unknown> | undefined
}

/** Options for foreign-key selects, limited to the tenant's own rows. */
export async function refOptions(resource: Resource, tenantId: string) {
  const out: Record<string, { value: string; label: string }[]> = {}
  for (const [field, ref] of Object.entries(resource.refs ?? {})) {
    const idCol = col(ref.table, "id")!
    const labelCol = col(ref.table, ref.label)!
    const rows = await db
      .select({ value: idCol, label: labelCol })
      .from(ref.table)
      .where(scope(ref.table, tenantId))
      .limit(500)
    out[field] = rows.map((r) => ({ value: String(r.value), label: String(r.label ?? r.value) }))
  }
  return out
}

/** Rejects foreign keys that point at another tenant's rows. */
export async function assertRefsOwned(resource: Resource, tenantId: string, values: Record<string, unknown>) {
  for (const [field, ref] of Object.entries(resource.refs ?? {})) {
    const value = values[field]
    if (value === null || value === undefined) continue
    const idCol = col(ref.table, "id")!
    const [row] = await db.select({ id: idCol }).from(ref.table).where(scope(ref.table, tenantId, eq(idCol, String(value)))).limit(1)
    if (!row) throw new Error(`Selected ${field.replace(/Id$/, "")} was not found`)
  }
}
