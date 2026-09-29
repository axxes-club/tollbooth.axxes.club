import "server-only"
import { createHmac, randomUUID, timingSafeEqual } from "crypto"
import { and, asc, eq, inArray, lte, or, isNull } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { serializePayment, serializeRefund, serializeCustomer } from "@/lib/api"
import type { TbMode, TbPayment } from "@/lib/db/schema/tollbooth"

/**
 * The events a merchant can subscribe to. The list is deliberately short: a payment
 * gateway that emits a hundred event types is a gateway nobody can build against.
 */
export const WEBHOOK_EVENTS = [
  "payment.created",
  "payment.succeeded",
  "payment.failed",
  "payment.expired",
  "payment.refunded",
  "payment.disputed",
  "refund.created",
  "customer.created",
  "payout.paid",
  "payout.failed",
] as const
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]

/** How many times a delivery is attempted, and how long we wait between tries. */
const MAX_ATTEMPTS = 6
const RETRY_DELAYS_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000]
const REQUEST_TIMEOUT_MS = 10_000

export type WebhookEvent = {
  id: string
  type: WebhookEventType
  created: number
  mode: TbMode
  data: { object: Record<string, unknown> }
  previous_attributes?: { status: string }
}

// ------------------------------------------------------------------- signing

/**
 * `Tollbooth-Signature: t=<unix>,v1=<hex>` where the HMAC covers `${t}.${body}`.
 * Binding the timestamp into the signed string is what stops a captured delivery
 * from being replayed later to fake a second payment.
 */
export function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
  return { header: `t=${timestamp},v1=${mac}`, timestamp, mac }
}

/** Verifies a signature header. `tolerance` guards against replay. */
export function verifySignature(secret: string, header: string, body: string, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((pair) => pair.split("=") as [string, string]))
  const timestamp = Number(parts.t)
  const mac = parts.v1
  if (!timestamp || !mac || !Number.isFinite(timestamp)) return { ok: false as const, reason: "malformed" }

  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) {
    return { ok: false as const, reason: "timestamp_out_of_tolerance" }
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(mac)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false as const, reason: "signature_mismatch" }
  return { ok: true as const }
}

// ------------------------------------------------------------------ fan-out

function matches(endpoint: { events: string[] | null }, type: string) {
  const events = endpoint.events ?? []
  return events.length === 0 || events.includes("*") || events.includes(type)
}

/**
 * Queues one delivery per subscribed endpoint. Delivery itself happens in
 * `deliverPending`, so a slow merchant server never delays a Stripe webhook response.
 */
export async function emit(type: WebhookEventType, tenantId: string, mode: TbMode, data: Record<string, unknown>, previous?: { status: string }) {
  const endpoints = await db
    .select()
    .from(schema.tollboothWebhookEndpoints)
    .where(and(eq(schema.tollboothWebhookEndpoints.tenantId, tenantId), eq(schema.tollboothWebhookEndpoints.enabled, 1)))

  const event: WebhookEvent = {
    id: `evt_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    type,
    created: Math.floor(Date.now() / 1000),
    mode,
    data: { object: data },
    ...(previous ? { previous_attributes: previous } : {}),
  }

  const targets = endpoints.filter((e) => e.mode === mode && matches(e, type))
  if (!targets.length) return event

  await db.insert(schema.tollboothWebhookDeliveries).values(
    targets.map((endpoint) => ({
      endpointId: endpoint.id,
      tenantId,
      eventId: event.id,
      eventType: type,
      payload: event as unknown as Record<string, unknown>,
      status: "pending" as const,
      nextAttemptAt: new Date(),
    }))
  )
  return event
}

/** Convenience wrappers so call sites read as domain events, not transport concerns. */
export const emitPayment = (payment: TbPayment, type: WebhookEventType, previous?: { status: string }) =>
  emit(type, payment.tenantId, payment.mode as TbMode, serializePayment(payment), previous)

export const emitRefund = (refund: Parameters<typeof serializeRefund>[0], payment: TbPayment) =>
  emit("refund.created", refund.tenantId, payment.mode as TbMode, serializeRefund(refund))

// ----------------------------------------------------------------- delivery

/**
 * Sends one delivery and schedules the next attempt on failure. A 2xx is success;
 * everything else (including timeouts and connection errors) is retried with
 * backoff, up to MAX_ATTEMPTS, after which the endpoint is flagged as failing.
 */
export async function deliver(deliveryId: string) {
  const [row] = await db.select().from(schema.tollboothWebhookDeliveries).where(eq(schema.tollboothWebhookDeliveries.id, deliveryId))
  if (!row) return null
  const [endpoint] = await db.select().from(schema.tollboothWebhookEndpoints).where(eq(schema.tollboothWebhookEndpoints.id, row.endpointId))
  if (!endpoint) return null

  const body = JSON.stringify(row.payload ?? {})
  const { header } = signPayload(endpoint.secret, body)
  const attempt = row.attempts + 1

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let status: number | null = null
  let responseBody: string | null = null
  let error: string | null = null

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Tollbooth/1.0",
        "tollbooth-signature": header,
        "tollbooth-event-id": row.eventId,
        "tollbooth-event-type": row.eventType,
        "tollbooth-delivery-id": row.id,
        "tollbooth-attempt": String(attempt),
      },
      body,
      signal: controller.signal,
      redirect: "manual",
    })
    status = res.status
    responseBody = (await res.text().catch(() => "")).slice(0, 2_000)
    if (res.ok) error = null
    else error = `Endpoint responded ${res.status}`
  } catch (err) {
    error = err instanceof Error && err.name === "AbortError" ? "Request timed out" : `Could not reach endpoint: ${(err as Error).message}`
  } finally {
    clearTimeout(timer)
  }

  const ok = error === null
  const exhausted = attempt >= MAX_ATTEMPTS
  const nextDelay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? 0

  await db
    .update(schema.tollboothWebhookDeliveries)
    .set({
      status: ok ? "delivered" : exhausted ? "failed" : "pending",
      attempts: attempt,
      responseStatus: status,
      responseBody,
      error,
      deliveredAt: ok ? new Date() : null,
      nextAttemptAt: ok ? null : new Date(Date.now() + nextDelay),
    })
    .where(eq(schema.tollboothWebhookDeliveries.id, row.id))

  await db
    .update(schema.tollboothWebhookEndpoints)
    .set({
      lastDeliveryAt: new Date(),
      lastDeliveryStatus: ok ? "delivered" : exhausted ? "failed" : "retrying",
      // A run of failures disables the endpoint so a dead URL stops costing requests.
      failureCount: ok ? 0 : exhausted ? 9_999 : undefined,
      enabled: ok || !exhausted ? undefined : 0,
      updatedAt: new Date(),
    })
    .where(eq(schema.tollboothWebhookEndpoints.id, endpoint.id))

  return { ok, status, error, attempt }
}

/** Drains due deliveries. Called by the Stripe webhook, the dashboard and a cron. */
export async function deliverPending(limit = 25) {
  const due = await db
    .select({ id: schema.tollboothWebhookDeliveries.id })
    .from(schema.tollboothWebhookDeliveries)
    .where(
      and(
        eq(schema.tollboothWebhookDeliveries.status, "pending"),
        or(isNull(schema.tollboothWebhookDeliveries.nextAttemptAt), lte(schema.tollboothWebhookDeliveries.nextAttemptAt, new Date()))
      )
    )
    .orderBy(asc(schema.tollboothWebhookDeliveries.createdAt))
    .limit(limit)

  const results = []
  for (const row of due) results.push(await deliver(row.id))
  return results
}

/** Re-sends a delivery by hand from the dashboard. */
export async function replayDelivery(deliveryId: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(schema.tollboothWebhookDeliveries)
    .where(and(eq(schema.tollboothWebhookDeliveries.id, deliveryId), eq(schema.tollboothWebhookDeliveries.tenantId, tenantId)))
  if (!row) return null
  await db
    .update(schema.tollboothWebhookDeliveries)
    .set({ status: "pending", attempts: 0, error: null, nextAttemptAt: new Date() })
    .where(eq(schema.tollboothWebhookDeliveries.id, deliveryId))
  return deliver(deliveryId)
}

export { MAX_ATTEMPTS }
