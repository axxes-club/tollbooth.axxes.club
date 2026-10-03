import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, withApi } from "@/lib/api"
import { CURRENCIES, isUuid } from "@/lib/fees"
import { createCheckout, NotReadyError, safeUrl } from "@/lib/payments"
import { serializePayment } from "@/lib/api"

/**
 * POST /api/v1/checkout-sessions
 *
 * Takes either a `price` (id or `lookup_key`) or a raw `amount`, and returns a hosted
 * checkout URL. The caller redirects the buyer there and gets a `payment.succeeded`
 * webhook. Send an `Idempotency-Key` so a retry can't charge twice.
 */
export const POST = withApi(async ({ req, caller, json, idempotency }) => {
  const body = await json<{
    amount?: number
    price?: string
    currency?: string
    description?: string
    quantity?: number
    reference?: string
    customer?: string
    customer_email?: string
    metadata?: Record<string, unknown>
    success_url?: string
    cancel_url?: string
  }>()

  const returnUrl = (value: unknown, field: string) => {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return ""
    const url = safeUrl(value)
    if (!url) throw fail(400, "invalid_request_error", `${field} must be an https URL`)
    return url
  }
  const successUrl = returnUrl(body.success_url, "success_url")
  const cancelUrl = returnUrl(body.cancel_url, "cancel_url")

  const metadata: Record<string, string> = {}
  if (body.metadata && typeof body.metadata === "object") {
    for (const [k, v] of Object.entries(body.metadata).slice(0, 20)) {
      metadata[String(k).slice(0, 40)] = String(v).slice(0, 500)
    }
  }

  const quantity = body.quantity === undefined ? 1 : Number(body.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
    throw fail(400, "invalid_request_error", "quantity must be a whole number between 1 and 99")

  // A price reference keeps the amount server-side, so a client can't choose what it pays.
  let price: typeof schema.tollboothPrices.$inferSelect | null = null
  if (body.price) {
    const reference = body.price
    const [byId, byLookup] = await Promise.all([
      isUuid(reference)
        ? db
            .select()
            .from(schema.tollboothPrices)
            .where(and(eq(schema.tollboothPrices.tenantId, caller.tenantId), eq(schema.tollboothPrices.id, reference)))
        : Promise.resolve([]),
      db
        .select()
        .from(schema.tollboothPrices)
        .where(and(eq(schema.tollboothPrices.tenantId, caller.tenantId), eq(schema.tollboothPrices.lookupKey, reference))),
    ])
    price = byId[0] ?? byLookup[0] ?? null
    if (!price) throw fail(404, "resource_missing", `No price matching "${reference}" in this workspace`)
    if (!price.active) throw fail(400, "price_inactive", "That price is no longer available")
  }

  let amount = price?.amount
  let currency = (price?.currency ?? body.currency ?? "usd").toLowerCase()
  let description = price?.nickname ?? body.description?.trim().slice(0, 250) ?? ""
  let priceId = price?.id ?? null

  if (!price) {
    amount = Number(body.amount)
    if (!Number.isInteger(amount) || amount < 50 || amount > 99_999_999)
      throw fail(400, "invalid_request_error", "amount must be an integer in minor units, at least 50")
    if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number]))
      throw fail(400, "invalid_request_error", `Unsupported currency "${currency}". Supported: ${CURRENCIES.join(", ")}`)
    description = body.description?.trim().slice(0, 250) ?? ""
    if (!description) throw fail(400, "invalid_request_error", "description is required when no price is given")
  } else if (!description) {
    const [product] = price.productId
      ? await db.select().from(schema.tollboothProducts).where(eq(schema.tollboothProducts.id, price.productId))
      : [null]
    description = product?.name ?? "Payment"
  }

  // Resolve the customer, or create one on the fly from the email we were given.
  let customerId: string | null = null
  let customerEmail: string | null = null
  if (body.customer) {
    if (!isUuid(body.customer)) throw fail(400, "invalid_request_error", "customer must be a customer id")
    const [customer] = await db
      .select()
      .from(schema.tollboothCustomers)
      .where(and(eq(schema.tollboothCustomers.id, body.customer), eq(schema.tollboothCustomers.tenantId, caller.tenantId)))
    if (!customer) throw fail(404, "resource_missing", "No such customer")
    customerId = customer.id
    customerEmail = customer.email
  } else if (typeof body.customer_email === "string" && body.customer_email.includes("@")) {
    customerEmail = body.customer_email.trim().slice(0, 320)
    const [existing] = await db
      .select()
      .from(schema.tollboothCustomers)
      .where(and(eq(schema.tollboothCustomers.tenantId, caller.tenantId), eq(schema.tollboothCustomers.email, customerEmail!)))
    if (existing) {
      customerId = existing.id
    } else {
      const [created] = await db
        .insert(schema.tollboothCustomers)
        .values({ tenantId: caller.tenantId, email: customerEmail, metadata })
        .returning()
      customerId = created!.id
    }
  }

  try {
    const payment = await createCheckout({
      tenantId: caller.tenantId,
      operation:idempotency,
      mode: caller.mode,
      apiKeyId: caller.apiKeyId,
      amount: amount!,
      currency,
      description,
      customerEmail,
      customerId,
      priceId,
      reference: typeof body.reference === "string" ? body.reference.slice(0, 200) : null,
      metadata,
      successUrl,
      cancelUrl,
      quantity,
      source: "api",
      idempotencyKey: req.headers.get("idempotency-key"),
    })
    return jsonResponse(serializePayment(payment), 201)
  } catch (err) {
    if (err instanceof NotReadyError) throw fail(409, "account_not_ready", err.message)
    throw err
  }
}, { scope: "payments:write" })
