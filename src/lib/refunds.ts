import "server-only"
import type Stripe from "stripe"
import { and, eq, inArray } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { refundFeeDelta } from "@/lib/fees"
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

  // Proportional slice of the fee we originally took, based on how much has been
  // given back in total. Working cumulatively is what stops successive partial
  // refunds from returning more fee than was ever charged.
  const refundedTotal = payment.amountRefunded + amount
  const alreadyReturned = payment.applicationFee - payment.netFee
  const feeReturned = refundFeeDelta(
    payment.applicationFee,
    alreadyReturned,
    amount,
    payment.amount,
    refundedTotal
  )

  const fullyRefunded = refundedTotal >= payment.amount
  const nextStatus = fullyRefunded ? "refunded" : "partially_refunded"
  const nextNetFee = Math.max(0, payment.netFee - feeReturned)

  // Claim the amount on the payment *before* calling Stripe, guarding on the value we
  // read. Two refunds racing for the same payment would otherwise both see the full
  // balance, both pass the check above, and both refund it — over-refunding the
  // customer and the fee. This conditional update is the point where exactly one of
  // them wins.
  const [reserved] = await db
    .update(schema.tollboothPayments)
    .set({ amountRefunded: refundedTotal, status: nextStatus, netFee: nextNetFee, updatedAt: new Date() })
    .where(
      and(
        eq(schema.tollboothPayments.id, payment.id),
        eq(schema.tollboothPayments.tenantId, args.tenantId),
        // Optimistic concurrency: if anything moved this since we read it, we lose.
        eq(schema.tollboothPayments.amountRefunded, payment.amountRefunded),
        inArray(schema.tollboothPayments.status, ["succeeded", "partially_refunded"])
      )
    )
    .returning()

  if (!reserved) {
    throw new RefundError(
      409,
      "refund_conflict",
      "This payment changed while the refund was being prepared. Fetch it again and refund what's actually left."
    )
  }

  // Declared up front so the rollback below can tell "Stripe refused" from
  // "Stripe accepted" without re-reading anything.
  let stripeRefund: Stripe.Refund
  try {
    stripeRefund = await stripe(payment.mode as "live" | "test").refunds.create(
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
  } catch (err) {
    // Stripe refused, so hand the reservation back. Guarded on our own write so this
    // can never roll back a refund that something else has since recorded.
    await db
      .update(schema.tollboothPayments)
      .set({ amountRefunded: payment.amountRefunded, status: payment.status, netFee: payment.netFee, updatedAt: new Date() })
      .where(
        and(eq(schema.tollboothPayments.id, payment.id), eq(schema.tollboothPayments.amountRefunded, refundedTotal))
      )
      .catch((rollbackError) => console.error("[tollbooth] failed to release refund reservation", rollbackError))
    throw err
  }

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

  const settled = reserved
  await emitRefund(refund!, settled).catch((e) => console.error("[tollbooth] refund.created emit failed", e))
  if (fullyRefunded) {
    await emitPayment(settled, "payment.refunded", { status: payment.status }).catch((e) =>
      console.error("[tollbooth] payment.refunded emit failed", e)
    )
  }
  return refund!
}
