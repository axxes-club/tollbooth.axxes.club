import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, serializeProduct, withApi } from "@/lib/api"

type Params = { id: string }

export const GET = withApi<Params>(async ({ params, caller }) => {
  const [product] = await db
    .select()
    .from(schema.tollboothProducts)
    .where(and(eq(schema.tollboothProducts.id, params.id), eq(schema.tollboothProducts.tenantId, caller.tenantId)))
  if (!product) throw fail(404, "resource_missing", "No such product")
  return jsonResponse(serializeProduct(product))
}, { scope: "payments:read" })

/** PATCH — change the name or description. Prices are never edited through this. */
export const PATCH = withApi<Params>(async ({ params, caller, json }) => {
  const body = await json<{ name?: string; description?: string; active?: boolean }>()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 200)
  if (body.description !== undefined) patch.description = String(body.description).trim().slice(0, 500) || null
  if (body.active !== undefined) patch.active = body.active ? 1 : 0

  const [product] = await db
    .update(schema.tollboothProducts)
    .set(patch)
    .where(and(eq(schema.tollboothProducts.id, params.id), eq(schema.tollboothProducts.tenantId, caller.tenantId)))
    .returning()
  if (!product) throw fail(404, "resource_missing", "No such product")
  return jsonResponse(serializeProduct(product))
}, { scope: "catalog:write" })

/** DELETE — archives the product. Its prices and past payments stay intact. */
export const DELETE = withApi<Params>(async ({ params, caller }) => {
  const deleted = await db
    .delete(schema.tollboothProducts)
    .where(and(eq(schema.tollboothProducts.id, params.id), eq(schema.tollboothProducts.tenantId, caller.tenantId)))
    .returning({ id: schema.tollboothProducts.id })
  if (!deleted.length) throw fail(404, "resource_missing", "No such product")
  return jsonResponse({ object: "product", id: params.id, deleted: true })
}, { scope: "catalog:write" })
