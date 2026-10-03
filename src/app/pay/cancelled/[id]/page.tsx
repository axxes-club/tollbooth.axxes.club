import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { Logo } from "@/components/logo"
import { isUuid } from "@/lib/fees"
import { safeUrl } from "@/lib/payments"

export const metadata = { title: "Checkout cancelled" }

/** Shown when a buyer backs out of Stripe Checkout. Nothing was charged. */
export default async function CancelledPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [payment] = isUuid(id) ? await db
    .select({ successUrl: schema.tollboothPayments.successUrl, description: schema.tollboothPayments.description })
    .from(schema.tollboothPayments)
    .where(eq(schema.tollboothPayments.id, id)) : []
  const sellerUrl = safeUrl(payment?.successUrl)

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-8">
          <h1 className="text-xl font-semibold tracking-tight">Checkout cancelled</h1>
          <p className="mt-3 text-sm text-muted">
            You left checkout{payment?.description ? ` for ${payment.description}` : ""}. If you already submitted a payment, check its status before trying again.
          </p>
          {payment && <a className="btn-ghost mt-4 w-full" href={`/pay/complete/${id}`}>View payment status</a>}
          {sellerUrl ? (
            <a className="btn-ghost mt-6 w-full" href={sellerUrl}>
              Back to the seller
            </a>
          ) : null}
        </div>
      </div>
    </main>
  )
}
