import { NextResponse } from "next/server"
import type { schema } from "@/lib/db"

type PaymentRow = typeof schema.tollboothPayments.$inferSelect

// Stripe-style error bodies so integrators get something predictable
export function apiError(status: number, type: string, message: string) {
  return NextResponse.json({ error: { type, message } }, { status })
}

export function serializePayment(p: PaymentRow) {
  return {
    object: "payment",
    id: p.id,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    amount_refunded: p.amountRefunded,
    application_fee: p.applicationFee,
    description: p.description,
    customer_email: p.customerEmail,
    reference: p.reference,
    metadata: p.metadata ?? {},
    checkout_url: p.status === "pending" ? p.checkoutUrl : null,
    created: Math.floor(p.createdAt.getTime() / 1000),
  }
}
