import { and, desc, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, listBody, serializeDelivery, withApi } from "@/lib/api"

type Params = { id: string }

/**
 * GET /api/v1/webhook-endpoints/:id/deliveries
 *
 * The delivery log, newest first — status, attempt count, response code and the
 * error text. Filter with `?status=failed` to find what needs attention.
 */
export const GET = withApi<Params>(async ({ params, url, caller }) => {
  const [endpoint] = await db
    .select({ id: schema.tollboothWebhookEndpoints.id })
    .from(schema.tollboothWebhookEndpoints)
    .where(and(eq(schema.tollboothWebhookEndpoints.id, params.id), eq(schema.tollboothWebhookEndpoints.tenantId, caller.tenantId)))
  if (!endpoint) throw fail(404, "resource_missing", "No such webhook endpoint")

  const status = url.searchParams.get("status")
  const conditions = [eq(schema.tollboothWebhookDeliveries.endpointId, params.id)]
  if (status) conditions.push(eq(schema.tollboothWebhookDeliveries.status, status))

  const rows = await db
    .select()
    .from(schema.tollboothWebhookDeliveries)
    .where(and(...conditions))
    .orderBy(desc(schema.tollboothWebhookDeliveries.createdAt))
    .limit(Math.min(100, Number(url.searchParams.get("limit")) || 20))

  return jsonResponse(listBody(rows.map(serializeDelivery), false))
}, { scope: "payments:read" })
