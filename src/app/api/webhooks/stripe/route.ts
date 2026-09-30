import { after, NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import type Stripe from "stripe"
import { db, schema } from "@/lib/db"
import { stripe } from "@/lib/stripe"
import { markSucceeded, markTerminal } from "@/lib/payments"
import { deliverPending, emit, emitPayment } from "@/lib/webhooks"

// Stripe retries for up to 3 days, so this handler must answer fast. State changes
// are small indexed writes; outbound delivery happens after the response.
export const maxDuration = 30

/**
 * Stripe → Tollbooth.
 *
 * One endpoint serves both the platform account and the Connect account, because a
 * connected account's onboarding events (`account.updated`) arrive on their own
 * endpoint with a different signing secret. `STRIPE_WEBHOOK_SECRET` holds both,
 * comma-separated.
 */
export async function POST(req: Request) {
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (!secrets.length) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })

  const payload = await req.text()
  const signature = req.headers.get("stripe-signature") ?? ""

  // Try every (client, secret) pair: the platform endpoint and the Connect endpoint
  // each have their own secret, and each client signs with its own key.
  const candidates: [Stripe, string][] = []
  for (const mode of ["live", "test"] as const) {
    let client: Stripe
    try {
      client = stripe(mode)
    } catch {
      continue // that mode isn't configured here
    }
    for (const secret of secrets) candidates.push([client, secret])
  }

  let event: Stripe.Event | null = null
  for (const [client, secret] of candidates) {
    try {
      event = client.webhooks.constructEvent(payload, signature, secret)
      break
    } catch {
      // Not signed with this secret; try the next one.
    }
  }
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 })

  // Idempotent: Stripe sends the same event id again on every retry.
  const inserted = await db
    .insert(schema.tollboothEvents)
    .values({
      id: event.id,
      type: event.type,
      account: event.account ?? null,
      livemode: event.livemode ? 1 : 0,
    })
    .onConflictDoNothing()
    .returning()

  if (inserted.length) {
    try {
      await handle(event)
    } catch (err) {
      // A failure here must surface as a 5xx so Stripe retries, not a silent 200.
      console.error(`[tollbooth] webhook ${event.id} (${event.type}) failed`, err)
      await db.delete(schema.tollboothEvents).where(eq(schema.tollboothEvents.id, event.id))
      return NextResponse.json({ error: "Handler failed" }, { status: 500 })
    }
  }

  // Flush queued outbound events once we're done, off the response path.
  //
  // `after` needs a request scope. If it is unavailable, the deliveries still go out
  // on the next cron tick, so failing the webhook here would be worse than useless:
  // the event has already been applied and recorded, and a 500 would only make Stripe
  // retry something that succeeded.
  try {
    after(async () => {
      try {
        await deliverPending()
      } catch (err) {
        console.error("[tollbooth] delivery drain failed", err)
      }
    })
  } catch (err) {
    console.error("[tollbooth] could not defer webhook delivery", err)
  }

  return NextResponse.json({ received: true, duplicate: !inserted.length })
}

async function handle(event: Stripe.Event) {
  const payments = schema.tollboothPayments
  const now = new Date()

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object
      // `unpaid` here means an async method is still clearing; the async event settles it.
      if (session.payment_status !== "paid") break
      const paymentId = session.metadata?.tollbooth_payment_id ?? session.client_reference_id
      if (!paymentId) break
      await markSucceeded(paymentId, {
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
        customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
      })
      break
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object
      const paymentId = session.metadata?.tollbooth_payment_id ?? session.client_reference_id
      if (paymentId) await markTerminal(paymentId, "failed", "The customer's payment method was declined")
      break
    }

    case "checkout.session.expired": {
      const paymentId = event.data.object.metadata?.tollbooth_payment_id ?? event.data.object.client_reference_id
      if (paymentId) await markTerminal(paymentId, "expired", "The checkout page expired before it was paid")
      break
    }

    // A PaymentIntent can fail before Checkout reports it, e.g. a blocked card.
    case "payment_intent.payment_failed": {
      const intent = event.data.object
      const paymentId = intent.metadata?.tollbooth_payment_id
      if (paymentId) await markTerminal(paymentId, "failed", intent.last_payment_error?.message ?? "The payment failed")
      break
    }

    case "charge.refunded": {
      const charge = event.data.object
      const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
      if (!paymentIntent) break

      // Stripe is the source of truth for how much has been given back; our own
      // counter can drift if a refund was issued in the Stripe dashboard.
      const [updated] = await db
        .update(payments)
        .set({
          amountRefunded: charge.amount_refunded,
          status: charge.refunded ? "refunded" : "partially_refunded",
          // Recompute from the total refunded, flooring — the same rule
          // `refundFeeDelta` uses. Rounding here would hand back more fee than was
          // charged once a payment is refunded in several parts.
          netFee: sql`greatest(0, ${payments.applicationFee} - floor(${payments.applicationFee} * ${charge.amount_refunded} / greatest(${payments.amount}, 1)))`,
          updatedAt: now,
        })
        .where(eq(payments.paymentIntentId, paymentIntent))
        .returning()

      if (updated) {
        const fullyRefunded = charge.refunded
        await emitPayment(updated, fullyRefunded ? "payment.refunded" : "payment.succeeded", { status: "succeeded" }).catch(() => {})
      }
      break
    }

    // A charge succeeded: record its id so refunds and disputes can be traced back.
    case "charge.succeeded": {
      const charge = event.data.object
      const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
      if (paymentIntent) {
        await db
          .update(payments)
          .set({ chargeId: charge.id, updatedAt: now })
          .where(eq(payments.paymentIntentId, paymentIntent))
      }
      break
    }

    // A disputed charge reverses the transfer and the fee, with no refund object.
    case "charge.dispute.created": {
      const dispute = event.data.object
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id
      if (!chargeId) break
      const [disputed] = await db
        .update(payments)
        .set({
          status: "disputed",
          lastError: `Disputed: ${dispute.reason ?? "unknown reason"} (${dispute.amount} ${dispute.currency})`,
          updatedAt: now,
        })
        .where(eq(payments.chargeId, chargeId))
        .returning()
      if (disputed) {
        await emit("payment.disputed", disputed.tenantId, disputed.mode as "live" | "test", {
          object: "dispute",
          id: dispute.id,
          payment: disputed.id,
          amount: dispute.amount,
          currency: dispute.currency,
          reason: dispute.reason,
          status: dispute.status,
          evidence_due_by: dispute.evidence_details.due_by,
        }).catch((e) => console.error("[tollbooth] payment.disputed emit failed", e))
      }
      break
    }

    case "charge.dispute.closed": {
      const dispute = event.data.object
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id
      if (!chargeId) break
      // Won or lost: either way the payment is settled and needs no action.
      const [closed] = await db
        .update(payments)
        .set({ status: "succeeded", lastError: null, updatedAt: now })
        .where(and(eq(payments.chargeId, chargeId), eq(payments.status, "disputed")))
        .returning()
      if (closed) {
        await emitPayment(closed, "payment.succeeded", { status: "disputed" }).catch(() => {})
      }
      break
    }

    case "account.updated": {
      const account = event.data.object
      await db
        .update(schema.tollboothAccounts)
        .set({
          chargesEnabled: account.charges_enabled ? 1 : 0,
          payoutsEnabled: account.payouts_enabled ? 1 : 0,
          detailsSubmitted: account.details_submitted ? 1 : 0,
          country: account.country ?? null,
          defaultCurrency: account.default_currency ?? null,
          chargesDisabledReason: (account as { charges_disabled_reason?: string | null }).charges_disabled_reason ?? null,
          requirementsDue: (account.requirements?.currently_due ?? []) as string[],
          updatedAt: now,
        })
        .where(eq(schema.tollboothAccounts.stripeAccountId, account.id))
      break
    }

    case "payout.paid":
    case "payout.failed":
    case "payout.canceled": {
      const payout = event.data.object
      // A Connect webhook names the connected account on the event, not the payout.
      const accountId = event.account ?? null
      if (!accountId) break
      const [account] = await db
        .select()
        .from(schema.tollboothAccounts)
        .where(eq(schema.tollboothAccounts.stripeAccountId, accountId))
      if (!account) break
      const type = event.type === "payout.paid" ? "payout.paid" : "payout.failed"
      await emit(type, account.tenantId, payout.livemode ? "live" : "test", {
        object: "payout",
        id: payout.id,
        amount: Math.abs(payout.amount),
        currency: payout.currency,
        status: payout.status,
        arrival_date: payout.arrival_date,
      }).catch(() => {})
      break
    }
  }
}
