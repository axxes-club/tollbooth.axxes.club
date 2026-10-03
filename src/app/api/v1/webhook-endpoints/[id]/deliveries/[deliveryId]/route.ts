import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, serializeDelivery, withApi } from "@/lib/api"
import { replayDelivery } from "@/lib/webhooks"

type Params = { id: string; deliveryId: string }

/** GET /api/v1/webhook-endpoints/:id/deliveries/:deliveryId — one delivery in full. */
export const GET = withApi<Params>(async ({ params, caller }) => {
  const [row] = await db
    .select()
    .from(schema.tollboothWebhookDeliveries)
    .where(
      and(
        eq(schema.tollboothWebhookDeliveries.id, params.deliveryId),
        eq(schema.tollboothWebhookDeliveries.endpointId, params.id),
        eq(schema.tollboothWebhookDeliveries.tenantId, caller.tenantId),
      )
    )
  if (!row) throw fail(404, "resource_missing", "No such delivery for this endpoint")
  return jsonResponse(serializeDelivery(row))
}, { scope: "payments:read" })

/**
 * POST …/deliveries/:deliveryId/replay
 *
 * Re-sends a delivery by hand. Useful when a deploy was broken, or when you've just
 * fixed the receiver. The event is delivered again as-is, with a fresh signature.
 */
export const POST = withApi<Params>(async ({ params, caller }) => {
  const result = await replayDelivery(params.deliveryId, caller.tenantId, params.id)
  if (!result) throw fail(404, "resource_missing", "No such delivery for this endpoint")
  return jsonResponse({
    object: "event_delivery_replay",
    delivered: result.ok,
    status: result.status,
    attempts: result.attempt,
    error: result.error,
  })
}, { scope: "webhooks:write" })
