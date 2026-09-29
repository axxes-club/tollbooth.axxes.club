import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { formatMoney } from "@/lib/fees"
import { Logo } from "@/components/logo"

export const metadata = { title: "Thank you" }

/**
 * Fallback thank-you page.
 *
 * A payment link can point at the merchant's own page, but when it doesn't (or
 * before the webhook lands) this shows the outcome. The status is read from our own
 * record, so it can briefly read "processing" — the merchant's webhook is the
 * authoritative signal, not this page.
 */
export default async function CompletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [payment] = await db.select().from(schema.tollboothPayments).where(eq(schema.tollboothPayments.id, id))

  if (!payment) {
    return (
      <Shell title="We couldn't find that payment" tone="warn">
        <p className="text-sm text-muted">If you were charged, you&apos;ll get an email receipt shortly. Nothing more to do.</p>
      </Shell>
    )
  }

  if (payment.status === "pending") {
    return (
      <Shell title="Confirming your payment" tone="pending">
        <p className="text-sm text-muted">
          We&apos;re waiting for {payment.customerEmail ?? "your bank"} to confirm. This usually takes a few seconds. You can safely close this
          page — we&apos;ll email a receipt either way.
        </p>
      </Shell>
    )
  }

  if (payment.status !== "succeeded") {
    return (
      <Shell title="That payment didn't go through" tone="warn">
        <p className="text-sm text-muted">No money was taken. If this keeps happening, try a different card or contact the seller.</p>
      </Shell>
    )
  }

  return (
    <Shell title="Payment received" tone="good">
      <p className="text-3xl font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</p>
      <p className="mt-2 text-sm text-muted">{payment.description}</p>
      <p className="mt-6 text-xs text-muted">
        Receipt sent to {payment.customerEmail ?? "your email"}. Reference <code className="font-mono">{payment.id.slice(0, 8)}</code>
      </p>
    </Shell>
  )
}

function Shell({ title, tone, children }: { title: string; tone: "good" | "warn" | "pending"; children: React.ReactNode }) {
  const ring = { good: "border-emerald-400/30", warn: "border-amber-400/30", pending: "border-line" }[tone]
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className={`card p-8 ${ring}`}>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </main>
  )
}
