import { and, eq, inArray } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, listBody, paginate, serializePrice, withApi } from "@/lib/api"
import { CURRENCIES } from "@/lib/fees"

/** GET /api/v1/prices — newest first. Filter with `?product=`. */
export const GET = withApi(async ({ url, caller }) => {
  const product = url.searchParams.get("product")
  const { data, hasMore } = await paginate("prices", caller.tenantId, {
    limit: Number(url.searchParams.get("limit")) || 20,
    startingAfter: url.searchParams.get("starting_after"),
  }, product ? [eq(schema.tollboothPrices.productId, product)] : [])

  const names = await productNames(data.map((p) => p.productId))
  return jsonResponse(listBody(data.map((p) => serializePrice(p, names.get(p.productId ?? ""))), hasMore))
}, { scope: "payments:read" })

/**
 * POST /api/v1/prices
 *
 * A price is immutable once created. To change an amount, archive the old price
 * (`PATCH {"active": false}`) and create a new one, so old receipts stay truthful.
 */
export const POST = withApi(async ({ caller, json }) => {
  const body = await json<{
    product?: string
    amount?: number
    currency?: string
    nickname?: string
    lookup_key?: string
  }>()

  const amount = Number(body.amount)
  if (!Number.isInteger(amount) || amount < 50) throw fail(400, "invalid_request_error", "amount must be an integer in minor units, at least 50")

  const currency = String(body.currency ?? "usd").toLowerCase()
  if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number]))
    throw fail(400, "invalid_request_error", `Unsupported currency "${currency}". Supported: ${CURRENCIES.join(", ")}`)

  let productId: string | null = null
  if (body.product) {
    const [product] = await db
      .select()
      .from(schema.tollboothProducts)
      .where(and(eq(schema.tollboothProducts.id, body.product), eq(schema.tollboothProducts.tenantId, caller.tenantId)))
    if (!product) throw fail(404, "resource_missing", "No such product")
    productId = product.id
  }

  const lookupKey = body.lookup_key?.trim()
  if (lookupKey) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(lookupKey))
      throw fail(400, "invalid_request_error", "lookup_key may only contain letters, numbers, - and _ (max 64)")
    const [clash] = await db
      .select()
      .from(schema.tollboothPrices)
      .where(and(eq(schema.tollboothPrices.tenantId, caller.tenantId), eq(schema.tollboothPrices.lookupKey, lookupKey)))
    if (clash) throw fail(409, "lookup_key_taken", `lookup_key "${lookupKey}" is already used by another price`)
  }

  const [price] = await db
    .insert(schema.tollboothPrices)
    .values({
      tenantId: caller.tenantId,
      productId,
      nickname: body.nickname?.trim().slice(0, 200) ?? null,
      amount,
      currency,
      lookupKey: lookupKey ?? null,
    })
    .returning()

  const names = await productNames([price!.productId])
  return jsonResponse(serializePrice(price!, names.get(price!.productId ?? "")), 201)
}, { scope: "catalog:write" })

/** Resolves product ids to names in one query, so price lists don't N+1. */
async function productNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!unique.length) return new Map<string, string>()
  const rows = await db
    .select({ id: schema.tollboothProducts.id, name: schema.tollboothProducts.name })
    .from(schema.tollboothProducts)
    .where(inArray(schema.tollboothProducts.id, unique))
  return new Map(rows.map((row) => [row.id, row.name]))
}
