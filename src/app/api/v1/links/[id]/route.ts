import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, serializeLink, withApi } from "@/lib/api"
import { safeUrl } from "@/lib/payments"

type Params = { id: string }

export const GET = withApi<Params>(async ({ params, caller }) => {
  const [link] = await db
    .select()
    .from(schema.tollboothLinks)
    .where(and(eq(schema.tollboothLinks.id, params.id), eq(schema.tollboothLinks.tenantId, caller.tenantId)))
  if (!link) throw fail(404, "resource_missing", "No such payment link")
  const [price] = link.priceId
    ? await db.select().from(schema.tollboothPrices).where(eq(schema.tollboothPrices.id, link.priceId))
    : [null]
  return jsonResponse(serializeLink(link, price))
}, { scope: "payments:read" })

/** PATCH — turn a link off, rename it, or change where it sends people. */
export const PATCH = withApi<Params>(async ({ params, caller, json }) => {
  const body = await json<{ name?: string; active?: boolean; success_url?: string | null; cancel_url?: string | null; allow_quantity?: boolean }>()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 200)
  if (body.active !== undefined) patch.active = body.active ? 1 : 0
  if (body.allow_quantity !== undefined) patch.allowQuantity = body.allow_quantity ? 1 : 0
  if (body.success_url !== undefined) patch.successUrl = body.success_url ? safeUrl(body.success_url) : null
  if (body.cancel_url !== undefined) patch.cancelUrl = body.cancel_url ? safeUrl(body.cancel_url) : null

  const [link] = await db
    .update(schema.tollboothLinks)
    .set(patch)
    .where(and(eq(schema.tollboothLinks.id, params.id), eq(schema.tollboothLinks.tenantId, caller.tenantId)))
    .returning()
  if (!link) throw fail(404, "resource_missing", "No such payment link")
  const [price] = link.priceId
    ? await db.select().from(schema.tollboothPrices).where(eq(schema.tollboothPrices.id, link.priceId))
    : [null]
  return jsonResponse(serializeLink(link, price))
}, { scope: "catalog:write" })
