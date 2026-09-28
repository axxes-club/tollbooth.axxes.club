import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { authenticateApiKey } from "@/lib/api-keys"
import { apiError, serializePayment } from "@/lib/api"
import { applicationFee } from "@/lib/fees"
import { stripe } from "@/lib/stripe"

const CURRENCIES = new Set(["usd", "eur", "gbp", "cad", "aud", "mxn"])

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:") ? url.toString() : null
  } catch {
    return null
  }
}

// POST /api/v1/checkout-sessions — start a hosted Stripe Checkout for a one-off payment
export async function POST(req: Request) {
  const caller = await authenticateApiKey(req)
  if (!caller) return apiError(401, "authentication_error", "Missing or invalid API key")

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return apiError(400, "invalid_request_error", "Body must be JSON")

  const amount = Number(body.amount)
  const currency = String(body.currency ?? "usd").toLowerCase()
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 250) : ""
  const successUrl = httpsUrl(body.success_url)
  const cancelUrl = httpsUrl(body.cancel_url)
  if (!Number.isInteger(amount) || amount < 50 || amount > 99_999_999)
    return apiError(400, "invalid_request_error", "amount must be an integer in minor units (at least 50)")
  if (!CURRENCIES.has(currency)) return apiError(400, "invalid_request_error", `Unsupported currency: ${currency}`)
  if (!description) return apiError(400, "invalid_request_error", "description is required")
  if (!successUrl || !cancelUrl) return apiError(400, "invalid_request_error", "success_url and cancel_url must be https URLs")

  const metadata: Record<string, string> = {}
  if (body.metadata && typeof body.metadata === "object") {
    for (const [k, v] of Object.entries(body.metadata).slice(0, 20)) metadata[String(k).slice(0, 40)] = String(v).slice(0, 500)
  }
  const customerEmail = typeof body.customer_email === "string" && body.customer_email.includes("@") ? body.customer_email.trim() : null
  const reference = typeof body.reference === "string" ? body.reference.slice(0, 200) : null

  const [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, caller.tenantId))
  if (!account?.chargesEnabled)
    return apiError(409, "account_not_ready", "This workspace hasn't finished payout setup in Tollbooth yet")

  const fee = applicationFee(amount)
  const [payment] = await db
    .insert(schema.tollboothPayments)
    .values({ tenantId: caller.tenantId, apiKeyId: caller.apiKeyId, amount, currency, applicationFee: fee, description, customerEmail, reference, metadata })
    .returning()

  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency, unit_amount: amount, product_data: { name: description } } }],
        customer_email: customerEmail ?? undefined,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: payment.id,
        metadata: { tollbooth_payment_id: payment.id, tenant_id: caller.tenantId },
        payment_intent_data: {
          application_fee_amount: fee || undefined,
          transfer_data: { destination: account.stripeAccountId },
          metadata: { ...metadata, tollbooth_payment_id: payment.id },
        },
      },
      { idempotencyKey: req.headers.get("idempotency-key") ?? undefined }
    )
    const [updated] = await db
      .update(schema.tollboothPayments)
      .set({ checkoutSessionId: session.id, checkoutUrl: session.url, updatedAt: new Date() })
      .where(eq(schema.tollboothPayments.id, payment.id))
      .returning()
    return NextResponse.json(serializePayment(updated), { status: 201 })
  } catch (err) {
    await db.update(schema.tollboothPayments).set({ status: "failed", updatedAt: new Date() }).where(eq(schema.tollboothPayments.id, payment.id))
    const message = err instanceof Error ? err.message : "Stripe error"
    return apiError(502, "api_error", message)
  }
}
