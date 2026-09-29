import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { refundedFee } from "@/lib/fees"
import { stripe } from "@/lib/stripe"
import { emitPayment, emitRefund } from "@/lib/webhooks"
import type { TbRefund } from "@/lib/db/schema/tollbooth"

export class RefundError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string
  ) {
    super(message)
    this.name = "RefundError"
  }
}

type Args = {
  tenantId: string
  paymentId: string
  amount?: number
  reason?: string | null
  note?: string | null
  apiKeyId?: string | null
  createdByKind: "api" | "dashboard"
  idempotencyKey?: string | null
}

/**
 * Refunds a payment, in full or in part.
 *
 * Two things happen that are easy to get wrong by hand: the transfer back to the
 * connected account is reversed (`reverse_transfer`), and the application fee
 * covering the refunded amount is returned (`refund_application_fee`). Skip either
 * and the merchant pays for a refund out of their own pocket.
 */
export async function createRefund(args: Args): Promise<TbRefund> {
  const [payment] = await db
    .select()
    .from(schema.tollboothPayments)
    .where(and(eq(schema.tollboothPayments.id, args.paymentId), eq(schema.tollboothPayments.tenantId, args.tenantId)))
  if (!payment) throw new RefundError(404, "resource_missing", "No such payment")
  if (!payment.paymentIntentId || !["succeeded", "partially_refunded"].includes(payment.status))
    throw new RefundError(400, "payment_not_refundable", `A payment with status "${payment.status}" can't be refunded`)

  const remaining = payment.amount - payment.amountRefunded
  const amount = args.amount === undefined ? remaining : Number(args.amount)
  if (!Number.isInteger(amount) || amount < 1) throw new RefundError(400, "invalid_request_error", "amount must be a whole number in minor units")
  if (amount > remaining) throw new RefundError(400, "invalid_request_error", `Only ${remaining} of this payment is left to refund`)

  // Proportional slice of the fee we originally took on this money.
  const feeReturned = refundedFee(payment.applicationFee, amount, payment.amount)

  const stripeRefund = await stripe(payment.mode as "live" | "test").refunds.create(
    {
      payment_intent: payment.paymentIntentId,
      amount,
      reverse_transfer: true,
      refund_application_fee: true,
      reason: (args.reason ?? undefined) as "duplicate" | "fraudulent" | "requested_by_customer" | undefined,
      metadata: { tollbooth_payment_id: payment.id, tenant_id: payment.tenantId },
    },
    { idempotencyKey: args.idempotencyKey ?? undefined }
  )

  const [refund] = await db
    .insert(schema.tollboothRefunds)
    .values({
      tenantId: args.tenantId,
      paymentId: payment.id,
      stripeRefundId: stripeRefund.id,
      amount,
      currency: payment.currency,
      feeReturned,
      reason: args.reason ?? null,
      note: args.note ?? null,
      status: stripeRefund.status === "succeeded" || stripeRefund.status === "pending" ? stripeRefund.status : "failed",
      apiKeyId: args.apiKeyId ?? null,
      createdByKind: args.createdByKind,
    })
    .returning()

  const refundedTotal = payment.amountRefunded + amount
  const fullyRefunded = refundedTotal >= payment.amount

  // Recompute the fee we actually kept, so the ledger never overstates earnings.
  const [updated] = await db
    .update(schema.tollboothPayments)
    .set({
      amountRefunded: refundedTotal,
      status: fullyRefunded ? "refunded" : "partially_refunded",
      netFee: Math.max(0, payment.applicationFee - payment.amountRefunded === 0 ? payment.applicationFee - feeReturned : payment.netFee - feeReturned),
      updatedAt: new Date(),
    })
    .where(eq(schema.tollboothPayments.id, payment.id))
    .returning()

  const settled = updated ?? payment
  await emitRefund(refund!, settled).catch((e) => console.error("[tollbooth] refund.created emit failed", e))
  if (fullyRefunded) {
    await emitPayment(settled, "payment.refunded", { status: payment.status }).catch((e) =>
      console.error("[tollbooth] payment.refunded emit failed", e)
    )
  }
  return refund!
}
