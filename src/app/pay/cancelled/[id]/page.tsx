import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { Logo } from "@/components/logo"

export const metadata = { title: "Checkout cancelled" }

/** Shown when a buyer backs out of Stripe Checkout. Nothing was charged. */
export default async function CancelledPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [payment] = await db
    .select({ successUrl: schema.tollboothPayments.successUrl, description: schema.tollboothPayments.description })
    .from(schema.tollboothPayments)
    .where(eq(schema.tollboothPayments.id, id))

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-8">
          <h1 className="text-xl font-semibold tracking-tight">Checkout cancelled</h1>
          <p className="mt-3 text-sm text-muted">
            Nothing was charged{payment?.description ? ` for ${payment.description}` : ""}. You can close this page.
          </p>
          {payment?.successUrl ? (
            <a className="btn-ghost mt-6 w-full" href={payment.successUrl}>
              Back to the seller
            </a>
          ) : null}
        </div>
      </div>
    </main>
  )
}
