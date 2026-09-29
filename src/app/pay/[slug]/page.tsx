import { notFound } from "next/navigation"
import { and, eq, sql } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { formatMoney } from "@/lib/fees"
import { PayButton } from "./pay-button"

export const metadata = { title: "Checkout" }

/**
 * The no-code checkout page.
 *
 * A payment link renders here: the buyer sees what they're buying, enters an email,
 * and pays on a hosted Stripe page. No integration, no code, no Stripe account to
 * set up. Everything that happens is recorded as a normal payment, so it shows up in
 * the merchant's API and dashboard like any other charge.
 */
export default async function PayPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ email?: string }> }) {
  const { slug } = await params
  const { email: prefilled } = await searchParams

  const [link] = await db
    .select()
    .from(schema.tollboothLinks)
    .where(eq(schema.tollboothLinks.slug, slug))
  if (!link || !link.active) notFound()

  const [price] = link.priceId
    ? await db.select().from(schema.tollboothPrices).where(eq(schema.tollboothPrices.id, link.priceId))
    : [null]
  if (!price || !price.active) notFound()

  const [product] = price.productId
    ? await db.select().from(schema.tollboothProducts).where(eq(schema.tollboothProducts.id, price.productId))
    : [null]

  const [account] = await db
    .select({ chargesEnabled: schema.tollboothAccounts.chargesEnabled })
    .from(schema.tollboothAccounts)
    .where(eq(schema.tollboothAccounts.tenantId, link.tenantId))
  const ready = !!account?.chargesEnabled

  // Count the view once per render of a real link, for the merchant's dashboard.
  await db
    .update(schema.tollboothLinks)
    .set({ viewCount: sql`${schema.tollboothLinks.viewCount} + 1` })
    .where(eq(schema.tollboothLinks.id, link.id))

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="card p-7 sm:p-8">
          <div className="flex items-start gap-4">
            {product?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt="" className="size-16 rounded-lg object-cover" />
            ) : null}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">{product?.name ?? link.name}</h1>
              {product?.description ? <p className="mt-1 text-sm leading-relaxed text-muted">{product.description}</p> : null}
            </div>
          </div>

          <div className="mt-6 flex items-baseline justify-between border-y border-line py-4">
            <span className="text-sm text-muted">{link.allowQuantity ? "Total" : "Amount due"}</span>
            <span className="text-2xl font-semibold tabular-nums" data-amount>
              {formatMoney(price.amount, price.currency)}
            </span>
          </div>

          {ready ? (
            <PayButton slug={link.id} defaultEmail={prefilled ?? ""} allowQuantity={!!link.allowQuantity} unitAmount={price.amount} currency={price.currency} />
          ) : (
            <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
              <p className="font-medium text-amber-200">This page isn't accepting payments yet</p>
              <p className="mt-1 text-muted">The seller still needs to finish payout setup. Try again shortly.</p>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          Payments processed by{" "}
          <a href="/" className="underline decoration-line underline-offset-2 hover:text-text">
            Tollbooth
          </a>{" "}
          · Card details go straight to our payment processor, never to us.
        </p>
      </div>
    </main>
  )
}
