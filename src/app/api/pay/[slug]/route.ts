import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { createCheckout, NotReadyError } from "@/lib/payments"
import { stripeMode } from "@/lib/stripe"

/**
 * POST /api/pay/:slug
 *
 * Opens a checkout session for a payment link. Public by design — this is the
 * no-code path, so it authenticates with the link itself rather than an API key.
 * The buyer's email is validated, and the amount always comes from the price, so
 * nothing about the payment can be tampered with from the browser.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const [link] = await db.select().from(schema.tollboothLinks).where(eq(schema.tollboothLinks.slug, slug))
  if (!link || !link.active) return NextResponse.json({ error: { message: "This payment link is no longer available" } }, { status: 404 })

  const [price] = link.priceId ? await db.select().from(schema.tollboothPrices).where(eq(schema.tollboothPrices.id, link.priceId)) : [null]
  if (!price || !price.active) return NextResponse.json({ error: { message: "This payment link is no longer available" } }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: { message: "Enter a valid email address" } }, { status: 400 })
  }

  const quantity = link.allowQuantity && Number.isInteger(body?.quantity) ? Math.min(99, Math.max(1, body.quantity)) : 1

  const [product] = price.productId
    ? await db.select().from(schema.tollboothProducts).where(eq(schema.tollboothProducts.id, price.productId))
    : [null]

  const [customer] = await db
    .select()
    .from(schema.tollboothCustomers)
    .where(and(eq(schema.tollboothCustomers.tenantId, link.tenantId), eq(schema.tollboothCustomers.email, email)))
  const customerId =
    customer?.id ??
    (
      await db
        .insert(schema.tollboothCustomers)
        .values({ tenantId: link.tenantId, email })
        .returning()
    )[0]?.id ??
    null

  try {
    const payment = await createCheckout({
      tenantId: link.tenantId,
      // A link isn't tied to an API key, so it follows the platform's own mode.
      // Hardcoding "live" would break every link on a test-mode deployment, and
      // would record test payments as though they were real.
      mode: stripeMode(),
      amount: price.amount,
      currency: price.currency,
      description: product?.name ?? link.name,
      customerEmail: email,
      customerId,
      priceId: price.id,
      linkId: link.id,
      metadata: product?.imageUrl ? { image_url: product.imageUrl } : {},
      successUrl: link.successUrl ?? "",
      cancelUrl: link.cancelUrl ?? "",
      quantity,
      source: "link",
    })
    return NextResponse.json({ checkout_url: payment.checkoutUrl, payment_id: payment.id })
  } catch (err) {
    if (err instanceof NotReadyError) {
      return NextResponse.json({ error: { message: "This seller isn't accepting payments right now" } }, { status: 409 })
    }
    console.error("[tollbooth] payment link checkout failed", err)
    return NextResponse.json({ error: { message: "We couldn't start the checkout. Please try again." } }, { status: 502 })
  }
}
