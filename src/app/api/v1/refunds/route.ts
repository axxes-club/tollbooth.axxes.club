import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { authenticateApiKey } from "@/lib/api-keys"
import { apiError, serializePayment } from "@/lib/api"
import { stripe } from "@/lib/stripe"

// POST /api/v1/refunds { payment_id, amount? } — full refund unless amount is given
export async function POST(req: Request) {
  const caller = await authenticateApiKey(req)
  if (!caller) return apiError(401, "authentication_error", "Missing or invalid API key")

  const body = await req.json().catch(() => null)
  const [payment] = await db.select().from(schema.tollboothPayments)
    .where(and(eq(schema.tollboothPayments.id, String(body?.payment_id ?? "")), eq(schema.tollboothPayments.tenantId, caller.tenantId))).catch(() => [])
  if (!payment) return apiError(404, "resource_missing", "No such payment")
  if (!payment.paymentIntentId || !["succeeded", "partially_refunded"].includes(payment.status))
    return apiError(400, "invalid_request_error", "Only completed payments can be refunded")

  const remaining = payment.amount - payment.amountRefunded
  const amount = body?.amount === undefined ? remaining : Number(body.amount)
  if (!Number.isInteger(amount) || amount < 1 || amount > remaining)
    return apiError(400, "invalid_request_error", `amount must be between 1 and ${remaining}`)

  try {
    await stripe().refunds.create(
      { payment_intent: payment.paymentIntentId, amount, reverse_transfer: true, refund_application_fee: true },
      { idempotencyKey: req.headers.get("idempotency-key") ?? undefined }
    )
  } catch (err) {
    return apiError(502, "api_error", err instanceof Error ? err.message : "Stripe error")
  }

  const refunded = payment.amountRefunded + amount
  const [updated] = await db.update(schema.tollboothPayments)
    .set({ amountRefunded: refunded, status: refunded >= payment.amount ? "refunded" : "partially_refunded", updatedAt: new Date() })
    .where(eq(schema.tollboothPayments.id, payment.id)).returning()
  return NextResponse.json(serializePayment(updated))
}
