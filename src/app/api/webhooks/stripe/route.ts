import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import type Stripe from "stripe"
import { db, schema } from "@/lib/db"
import { stripe } from "@/lib/stripe"

// Stripe → Tollbooth. One endpoint for platform events and one for connected-account events
// (account.updated) both point here.
export async function POST(req: Request) {
  // Comma-separated: the platform endpoint and the Connect endpoint each have their own secret
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!secrets.length) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })

  const payload = await req.text()
  const signature = req.headers.get("stripe-signature") ?? ""
  let event: Stripe.Event | null = null
  for (const secret of secrets) {
    try {
      event = stripe().webhooks.constructEvent(payload, signature, secret)
      break
    } catch {}
  }
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 })

  // Idempotent: each Stripe event is handled once
  const inserted = await db.insert(schema.tollboothEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning()
  if (!inserted.length) return NextResponse.json({ received: true, duplicate: true })

  const payments = schema.tollboothPayments
  const now = new Date()

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object
      if (session.payment_status === "paid") {
        await db.update(payments)
          .set({ status: "succeeded", paymentIntentId: String(session.payment_intent ?? ""), customerEmail: session.customer_details?.email ?? undefined, updatedAt: now })
          .where(eq(payments.checkoutSessionId, session.id))
      }
      break
    }
    case "checkout.session.async_payment_failed":
      await db.update(payments).set({ status: "failed", updatedAt: now }).where(eq(payments.checkoutSessionId, event.data.object.id))
      break
    case "checkout.session.expired":
      await db.update(payments).set({ status: "expired", updatedAt: now }).where(eq(payments.checkoutSessionId, event.data.object.id))
      break
    case "charge.refunded": {
      const charge = event.data.object
      if (charge.payment_intent) {
        await db.update(payments)
          .set({ amountRefunded: charge.amount_refunded, status: charge.refunded ? "refunded" : "partially_refunded", updatedAt: now })
          .where(eq(payments.paymentIntentId, String(charge.payment_intent)))
      }
      break
    }
    case "account.updated": {
      const account = event.data.object
      await db.update(schema.tollboothAccounts)
        .set({
          chargesEnabled: account.charges_enabled ? 1 : 0,
          payoutsEnabled: account.payouts_enabled ? 1 : 0,
          detailsSubmitted: account.details_submitted ? 1 : 0,
          country: account.country ?? null,
          defaultCurrency: account.default_currency ?? null,
          updatedAt: now,
        })
        .where(eq(schema.tollboothAccounts.stripeAccountId, account.id))
      break
    }
  }
  return NextResponse.json({ received: true })
}
