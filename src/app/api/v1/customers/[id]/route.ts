import { and, eq, sql } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, serializeCustomer, withApi } from "@/lib/api"

type Params = { id: string }

export const GET = withApi<Params>(async ({ params, caller }) => {
  const [customer] = await db
    .select()
    .from(schema.tollboothCustomers)
    .where(and(eq(schema.tollboothCustomers.id, params.id), eq(schema.tollboothCustomers.tenantId, caller.tenantId)))
  if (!customer) throw fail(404, "resource_missing", "No such customer")
  return jsonResponse(serializeCustomer(customer))
}, { scope: "payments:read" })

/** PATCH /api/v1/customers/:id — partial update. */
export const PATCH = withApi<Params>(async ({ params, caller, json }) => {
  const body = await json<{ name?: string | null; phone?: string | null; metadata?: Record<string, string> }>()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) patch.name = body.name?.trim().slice(0, 200) || null
  if (body.phone !== undefined) patch.phone = body.phone?.trim().slice(0, 40) || null
  if (body.metadata !== undefined) patch.metadata = body.metadata

  const [customer] = await db
    .update(schema.tollboothCustomers)
    .set(patch)
    .where(and(eq(schema.tollboothCustomers.id, params.id), eq(schema.tollboothCustomers.tenantId, caller.tenantId)))
    .returning()
  if (!customer) throw fail(404, "resource_missing", "No such customer")
  return jsonResponse(serializeCustomer(customer))
}, { scope: "payments:write" })

/** DELETE /api/v1/customers/:id — removes the profile. Past payments keep their record. */
export const DELETE = withApi<Params>(async ({ params, caller }) => {
  const deleted = await db
    .delete(schema.tollboothCustomers)
    .where(and(eq(schema.tollboothCustomers.id, params.id), eq(schema.tollboothCustomers.tenantId, caller.tenantId)))
    .returning({ id: schema.tollboothCustomers.id })
  if (!deleted.length) throw fail(404, "resource_missing", "No such customer")
  return jsonResponse({ object: "customer", id: params.id, deleted: true })
}, { scope: "payments:write" })
