import { db, schema } from "@/lib/db"
import { fail, jsonResponse, listBody, paginate, serializeProduct, withApi } from "@/lib/api"
import { CURRENCIES } from "@/lib/fees"

/** GET /api/v1/products — newest first. */
export const GET = withApi(async ({ url, caller }) => {
  const { data, hasMore } = await paginate("products", caller.tenantId, {
    limit: Number(url.searchParams.get("limit")) || 20,
    startingAfter: url.searchParams.get("starting_after"),
  })
  return jsonResponse(listBody(data.map(serializeProduct), hasMore))
}, { scope: "payments:read" })

/** POST /api/v1/products — a product is the thing you sell. */
export const POST = withApi(async ({ caller, json }) => {
  const body = await json<{ name?: string; description?: string; metadata?: Record<string, string> }>()
  const name = body.name?.trim()
  if (!name) throw fail(400, "invalid_request_error", "name is required")

  const [product] = await db
    .insert(schema.tollboothProducts)
    .values({
      tenantId: caller.tenantId,
      name: name.slice(0, 200),
      description: body.description?.trim().slice(0, 500) ?? null,
      metadata: body.metadata ?? {},
    })
    .returning()
  return jsonResponse(serializeProduct(product!), 201)
}, { scope: "catalog:write" })
