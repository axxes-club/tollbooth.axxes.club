import { and, eq, inArray } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, listBody, paginate, serializeLink, withApi } from "@/lib/api"
import { safeUrl } from "@/lib/payments"
import { isUuid } from "@/lib/fees"
import { uniqueLinkSlug } from "@/lib/slugs"

/** GET /api/v1/links — your no-code checkout pages, newest first. */
export const GET = withApi(async ({ url, caller }) => {
  const { data, hasMore } = await paginate("links", caller.tenantId, {
    limit: Number(url.searchParams.get("limit")) || 20,
    startingAfter: url.searchParams.get("starting_after"),
  })

  const prices = await pricesFor(data.map((l) => l.priceId))
  return jsonResponse(listBody(data.map((l) => serializeLink(l, prices.get(l.priceId ?? ""))), hasMore))
}, { scope: "payments:read" })

/**
 * POST /api/v1/links
 *
 * Creates a shareable `/pay/<slug>` page for a price. Send it to anyone; they pay
 * on a hosted page and your `payment.succeeded` webhook fires as normal. This is the
 * path for people who never write code.
 */
export const POST = withApi(async ({ caller, json }) => {
  const body = await json<{ price?: string; name?: string; slug?: string; success_url?: string; cancel_url?: string; allow_quantity?: boolean }>()
  if (!body.price) throw fail(400, "invalid_request_error", "price is required (an id or a lookup_key)")

  // A link can reference a price by id or by its short lookup_key.
  const [byId, byLookup] = await Promise.all([
    isUuid(body.price)
      ? db
          .select()
          .from(schema.tollboothPrices)
          .where(and(eq(schema.tollboothPrices.tenantId, caller.tenantId), eq(schema.tollboothPrices.id, body.price!)))
      : Promise.resolve([]),
    db
      .select()
      .from(schema.tollboothPrices)
      .where(and(eq(schema.tollboothPrices.tenantId, caller.tenantId), eq(schema.tollboothPrices.lookupKey, body.price!))),
  ])
  const priceRow = byId[0] ?? byLookup[0] ?? null

  if (!priceRow) throw fail(404, "resource_missing", `No price matching "${body.price}"`)
  if (!priceRow.active) throw fail(400, "price_inactive", "That price is no longer available")

  const [product] = priceRow.productId
    ? await db.select().from(schema.tollboothProducts).where(eq(schema.tollboothProducts.id, priceRow.productId))
    : [null]

  const [link] = await db
    .insert(schema.tollboothLinks)
    .values({
      tenantId: caller.tenantId,
      priceId: priceRow.id,
      slug: await uniqueLinkSlug(body.slug),
      name: body.name?.trim().slice(0, 200) ?? product?.name ?? priceRow.nickname ?? "Payment",
      successUrl: safeUrl(body.success_url),
      cancelUrl: safeUrl(body.cancel_url),
      allowQuantity: body.allow_quantity ? 1 : 0,
    })
    .returning()

  return jsonResponse(serializeLink(link!, priceRow), 201)
}, { scope: "catalog:write" })

async function pricesFor(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!unique.length) return new Map<string, (typeof schema.tollboothPrices.$inferSelect)>()
  const rows = await db.select().from(schema.tollboothPrices).where(inArray(schema.tollboothPrices.id, unique))
  return new Map(rows.map((row) => [row.id, row]))
}
