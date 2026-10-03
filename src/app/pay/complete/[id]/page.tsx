import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { formatMoney, isUuid } from "@/lib/fees"
import { Logo } from "@/components/logo"
import { PaymentRefresh } from "./payment-refresh"

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
  const [payment] = isUuid(id) ? await db.select().from(schema.tollboothPayments).where(eq(schema.tollboothPayments.id, id)) : []

  if (!payment) {
    return (
      <Shell title="We couldn't find that payment" tone="warn">
        <p className="text-sm text-muted">We can&apos;t confirm this payment. If you see a charge, contact the seller with your payment reference.</p>
      </Shell>
    )
  }

  if (payment.status === "pending") {
    return (
      <Shell title="Confirming your payment" tone="pending">
        <p className="text-sm text-muted">
          Confirmation is still pending. You can safely close this page. Contact the seller if the status does not update; avoid paying again while it is pending.
        </p>
        <PaymentRefresh />
      </Shell>
    )
  }

  const outcomes: Record<string, { title: string; message: string; tone: "good" | "warn" | "pending" }> = {
    partially_refunded: { title: "Payment partially refunded", message: "Part of your payment has been refunded. Contact the seller with any questions.", tone: "good" },
    refunded: { title: "Payment refunded", message: "Your payment has been refunded. Your bank determines when the refund appears.", tone: "good" },
    disputed: { title: "Payment under dispute", message: "This payment is under dispute. Contact the seller or your bank for help.", tone: "warn" },
    expired: { title: "Checkout expired", message: "This checkout is no longer available. Return to the seller to start a new checkout.", tone: "warn" },
    failed: { title: "Payment could not be completed", message: "Contact the seller if you see a charge or a temporary bank hold before trying again.", tone: "warn" },
  }
  if (payment.status !== "succeeded") {
    const outcome = outcomes[payment.status] ?? { title: "Payment status unavailable", message: "Contact the seller to confirm the outcome before paying again.", tone: "warn" as const }
    return (
      <Shell title={outcome.title} tone={outcome.tone}>
        <p className="text-sm text-muted">{outcome.message}</p>
        {payment.status === "partially_refunded" && <p className="mt-4 text-sm">Original payment {formatMoney(payment.amount, payment.currency, payment.mode as "live" | "test")}</p>}
        {payment.amountRefunded > 0 && <p className="mt-4 text-sm">Refunded {formatMoney(payment.amountRefunded, payment.currency, payment.mode as "live" | "test")}</p>}
      </Shell>
    )
  }

  return (
    <Shell title="Payment received" tone="good">
      <p className="text-3xl font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency, payment.mode as "live" | "test")}</p>
      <p className="mt-2 text-sm text-muted">{payment.description}</p>
      <p className="mt-6 text-xs text-muted">
        Reference <code className="font-mono">{payment.id}</code>. Keep this reference if you need to contact the seller.
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
