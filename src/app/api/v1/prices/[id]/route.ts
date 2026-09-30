import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, serializePrice, withApi } from "@/lib/api"

type Params = { id: string }

export const GET = withApi<Params>(async ({ params, caller }) => {
  const [price] = await db
    .select()
    .from(schema.tollboothPrices)
    .where(and(eq(schema.tollboothPrices.id, params.id), eq(schema.tollboothPrices.tenantId, caller.tenantId)))
  if (!price) throw fail(404, "resource_missing", "No such price")
  const [product] = price.productId
    ? await db.select().from(schema.tollboothProducts).where(eq(schema.tollboothProducts.id, price.productId))
    : [null]
  return jsonResponse(serializePrice(price, product?.name))
}, { scope: "payments:read" })

/** PATCH — the only field you can change is `active`. Amounts are immutable by design. */
export const PATCH = withApi<Params>(async ({ params, caller, json }) => {
  const body = await json<{ active?: boolean }>()
  if (typeof body.active !== "boolean") throw fail(400, "invalid_request_error", "Only `active` can be changed. Create a new price to change the amount.")

  const [price] = await db
    .update(schema.tollboothPrices)
    .set({ active: body.active ? 1 : 0, updatedAt: new Date() })
    .where(and(eq(schema.tollboothPrices.id, params.id), eq(schema.tollboothPrices.tenantId, caller.tenantId)))
    .returning()
  if (!price) throw fail(404, "resource_missing", "No such price")
  return jsonResponse(serializePrice(price))
}, { scope: "catalog:write" })
