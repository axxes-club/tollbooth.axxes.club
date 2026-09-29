import { and, eq, sql } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, listBody, serializeDelivery, serializeEndpoint, withApi } from "@/lib/api"
import { generateWebhookSecret } from "@/lib/api-keys"
import { safeUrl } from "@/lib/payments"
import { replayDelivery, WEBHOOK_EVENTS } from "@/lib/webhooks"

type Params = { id: string }

export const GET = withApi<Params>(async ({ params, caller }) => {
  const [endpoint] = await db
    .select()
    .from(schema.tollboothWebhookEndpoints)
    .where(and(eq(schema.tollboothWebhookEndpoints.id, params.id), eq(schema.tollboothWebhookEndpoints.tenantId, caller.tenantId)))
  if (!endpoint) throw fail(404, "resource_missing", "No such webhook endpoint")
  return jsonResponse(serializeEndpoint(endpoint))
}, { scope: "payments:read" })

/** PATCH — change the URL, the event list, or pause deliveries. */
export const PATCH = withApi<Params>(async ({ params, caller, json }) => {
  const body = await json<{ url?: string; events?: string[]; description?: string; enabled?: boolean }>()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body.url !== undefined) {
    const url = safeUrl(body.url)
    if (!url) throw fail(400, "invalid_request_error", "url must be an https URL")
    patch.url = url
  }
  if (body.events !== undefined) {
    if (!Array.isArray(body.events)) throw fail(400, "invalid_request_error", "events must be an array")
    const unknown = body.events.filter((e) => e !== "*" && !WEBHOOK_EVENTS.includes(e as (typeof WEBHOOK_EVENTS)[number]))
    if (unknown.length) throw fail(400, "invalid_request_error", `Unknown events: ${unknown.join(", ")}`)
    patch.events = body.events.includes("*") ? ["*"] : body.events
  }
  if (body.description !== undefined) patch.description = String(body.description).slice(0, 200) || null
  if (body.enabled !== undefined) {
    patch.enabled = body.enabled ? 1 : 0
    // Re-enabling also clears the failure flag that auto-paused the endpoint.
    if (body.enabled) patch.failureCount = 0
  }

  const [endpoint] = await db
    .update(schema.tollboothWebhookEndpoints)
    .set(patch)
    .where(and(eq(schema.tollboothWebhookEndpoints.id, params.id), eq(schema.tollboothWebhookEndpoints.tenantId, caller.tenantId)))
    .returning()
  if (!endpoint) throw fail(404, "resource_missing", "No such webhook endpoint")
  return jsonResponse(serializeEndpoint(endpoint))
}, { scope: "webhooks:write" })

/** POST .../rotate — issue a new signing secret. The old one stops working immediately. */
export const POST = withApi<Params>(async ({ params, caller }) => {
  const secret = generateWebhookSecret()
  const [endpoint] = await db
    .update(schema.tollboothWebhookEndpoints)
    .set({ secret, updatedAt: new Date() })
    .where(and(eq(schema.tollboothWebhookEndpoints.id, params.id), eq(schema.tollboothWebhookEndpoints.tenantId, caller.tenantId)))
    .returning()
  if (!endpoint) throw fail(404, "resource_missing", "No such webhook endpoint")
  return jsonResponse({ ...serializeEndpoint(endpoint), secret })
}, { scope: "webhooks:write" })

/** DELETE — stops deliveries and removes the endpoint along with its delivery log. */
export const DELETE = withApi<Params>(async ({ params, caller }) => {
  const deleted = await db
    .delete(schema.tollboothWebhookEndpoints)
    .where(and(eq(schema.tollboothWebhookEndpoints.id, params.id), eq(schema.tollboothWebhookEndpoints.tenantId, caller.tenantId)))
    .returning({ id: schema.tollboothWebhookEndpoints.id })
  if (!deleted.length) throw fail(404, "resource_missing", "No such webhook endpoint")
  return jsonResponse({ object: "webhook_endpoint", id: params.id, deleted: true })
}, { scope: "webhooks:write" })
