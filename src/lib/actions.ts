"use server"

import { eq } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireContext } from "@/lib/context"
import { assertRefsOwned, getResource, getRow, scope } from "@/lib/data"
import { columnsOf, parseForm } from "@/lib/resource"

export type FormState = { error?: string }

/** Surfaces the Postgres reason instead of drizzle's "Failed query: …" dump. */
function message(e: unknown) {
  if (!(e instanceof Error)) return "Could not save"
  const cause = (e as { cause?: { message?: string } }).cause?.message
  if (e.message.startsWith("Failed query")) {
    console.error(e)
    return cause ? `Could not save: ${cause}` : "Could not save. Check the values and try again."
  }
  return e.message
}

function resourceOrThrow(key: string) {
  const resource = getResource(key)
  if (!resource) throw new Error("Unknown resource")
  return resource
}

export async function createRecord(key: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireContext()
  const resource = resourceOrThrow(key)
  let id: string
  try {
    const values = parseForm(resource, form)
    await assertRefsOwned(resource, ctx.tenant.id, values)
    const [row] = await db
      .insert(resource.table)
      .values({ ...values, tenantId: ctx.tenant.id })
      .returning()
    id = String((row as Record<string, unknown>).id)
  } catch (e) {
    return { error: message(e) }
  }
  revalidatePath(`/${key}`)
  redirect(`/${key}/${id}`)
}

export async function updateRecord(key: string, id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireContext()
  const resource = resourceOrThrow(key)
  if (!(await getRow(resource, ctx.tenant.id, id))) return { error: "Not found" }
  try {
    const values = parseForm(resource, form)
    await assertRefsOwned(resource, ctx.tenant.id, values)
    const cols = columnsOf(resource.table)
    if (cols.updatedAt) values.updatedAt = new Date()
    await db
      .update(resource.table)
      .set(values)
      .where(scope(resource.table, ctx.tenant.id, eq(cols.id as unknown as PgColumn, id)))
  } catch (e) {
    return { error: message(e) }
  }
  revalidatePath(`/${key}`)
  revalidatePath(`/${key}/${id}`)
  return {}
}

export async function deleteRecord(key: string, id: string) {
  const ctx = await requireContext()
  const resource = resourceOrThrow(key)
  const cols = columnsOf(resource.table)
  const where = scope(resource.table, ctx.tenant.id, eq(cols.id as unknown as PgColumn, id))
  if (cols.deletedAt) {
    await db.update(resource.table).set({ deletedAt: new Date() }).where(where)
  } else {
    await db.delete(resource.table).where(where)
  }
  revalidatePath(`/${key}`)
  redirect(`/${key}`)
}
