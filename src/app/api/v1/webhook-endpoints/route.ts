import { desc, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, listBody, serializeEndpoint, withApi } from "@/lib/api"
import { generateWebhookSecret } from "@/lib/api-keys"
import { safeUrl } from "@/lib/payments"
import { WEBHOOK_EVENTS } from "@/lib/webhooks"

/** GET /api/v1/webhook-endpoints — where your events are being sent. */
export const GET = withApi(async ({ url, caller }) => {
  const rows = await db
    .select()
    .from(schema.tollboothWebhookEndpoints)
    .where(eq(schema.tollboothWebhookEndpoints.tenantId, caller.tenantId))
    .orderBy(desc(schema.tollboothWebhookEndpoints.createdAt))
    .limit(Number(url.searchParams.get("limit")) || 20)
  return jsonResponse(listBody(rows.map(serializeEndpoint), false))
}, { scope: "payments:read" })

/**
 * POST /api/v1/webhook-endpoints
 *
 * The response is the only time `secret` is returned. Store it: it's what signs
 * every delivery, and without it you can't tell a real event from a forged one.
 */
export const POST = withApi(async ({ caller, json }) => {
  const body = await json<{ url?: string; events?: string[]; description?: string }>()
  const url = safeUrl(body.url)
  if (!url) throw fail(400, "invalid_request_error", "url must be an https URL")

  const events = validateEvents(body.events)

  const [endpoint] = await db
    .insert(schema.tollboothWebhookEndpoints)
    .values({
      tenantId: caller.tenantId,
      url,
      description: body.description?.trim().slice(0, 200) ?? null,
      secret: generateWebhookSecret(),
      events,
      mode: caller.mode,
      createdById: caller.apiKeyId,
    })
    .returning()

  return jsonResponse({ ...serializeEndpoint(endpoint!), secret: endpoint!.secret }, 201)
}, { scope: "webhooks:write" })

function validateEvents(input: unknown): string[] {
  if (input === undefined) return ["*"]
  if (!Array.isArray(input)) throw fail(400, "invalid_request_error", "events must be an array of event names")
  if (input.includes("*")) return ["*"]
  const unknown = input.filter((e) => !WEBHOOK_EVENTS.includes(e as (typeof WEBHOOK_EVENTS)[number]))
  if (unknown.length) throw fail(400, "invalid_request_error", `Unknown events: ${unknown.join(", ")}. Valid: ${WEBHOOK_EVENTS.join(", ")}, or ["*"]`)
  return input as string[]
}
