import { and, desc, eq, lte, gte } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, listBody, withApi } from "@/lib/api"

/**
 * GET /api/v1/events
 *
 * The events Tollbooth has emitted, newest first — your audit trail, useful for
 * reconciling a payout at month end. Delivery status is included per endpoint.
 */
export const GET = withApi(async ({ url, caller }) => {
  const params = url.searchParams
  const conditions = [eq(schema.tollboothWebhookDeliveries.tenantId, caller.tenantId)]

  const type = params.get("type")
  if (type) conditions.push(eq(schema.tollboothWebhookDeliveries.eventType, type))
  const status = params.get("status")
  if (status) conditions.push(eq(schema.tollboothWebhookDeliveries.status, status))
  const since = params.get("since")
  if (since) conditions.push(gte(schema.tollboothWebhookDeliveries.createdAt, toDate(since)))

  const rows = await db
    .select()
    .from(schema.tollboothWebhookDeliveries)
    .where(and(...conditions))
    .orderBy(desc(schema.tollboothWebhookDeliveries.createdAt))
    .limit(Math.min(100, Number(params.get("limit")) || 20))

  return jsonResponse(
    listBody(
      rows.map((row) => ({
        object: "event",
        id: row.eventId,
        type: row.eventType,
        endpoint: row.endpointId,
        delivery_status: row.status,
        attempts: row.attempts,
        response_status: row.responseStatus,
        error: row.error,
        created: Math.floor(row.createdAt.getTime() / 1000),
      })),
      false
    )
  )
}, { scope: "payments:read" })

function toDate(value: string) {
  const asNumber = Number(value)
  const date = Number.isFinite(asNumber) && value !== "" ? new Date(asNumber * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) throw fail(400, "invalid_request_error", "since must be a unix timestamp or ISO date")
  return date
}
