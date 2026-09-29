import Link from "next/link"
import { notFound } from "next/navigation"
import { requireContext } from "@/lib/context"
import { PageHeader, StatusBadge, Field, Code, Notice } from "@/components/ui"
import { RefundForm } from "./refund-form"
import { formatMoney, feeDescription } from "@/lib/fees"
import { getPayment } from "../../queries"

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext()
  const { id } = await params
  const payment = await getPayment(ctx.tenant.id, id)
  if (!payment) notFound()

  const refundable = payment.status === "succeeded" || payment.status === "partially_refunded"
  const remaining = payment.amount - payment.amountRefunded

  return (
    <>
      <PageHeader
        title={payment.description ?? "Payment"}
        description={
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge value={payment.status} />
            {payment.mode === "test" && <StatusBadge value="test" />}
            <span className="font-mono text-xs text-muted">{payment.id}</span>
          </span>
        }
        action={
          <Link href="/dashboard/payments" className="btn-ghost">
            All payments
          </Link>
        }
      />

      {payment.mode === "test" && (
        <div className="mb-6">
          <Notice tone="warn" title="This is a test payment">
            No real money moved. Test payments are excluded from your balance and payouts.
          </Notice>
        </div>
      )}

      {payment.status === "disputed" && (
        <div className="mb-6">
          <Notice tone="warn" title="This payment is disputed">
            {payment.lastError ?? "The cardholder has disputed this charge."} Respond with evidence in your Stripe dashboard before the
            deadline, or the funds will be returned to the customer.
          </Notice>
        </div>
      )}

      {payment.status === "pending" && payment.checkoutUrl && (
        <div className="mb-6">
          <Notice
            tone="info"
            title="Waiting on the customer"
            action={
              <a href={payment.checkoutUrl} className="btn-ghost" target="_blank" rel="noreferrer">
                Open checkout
              </a>
            }
          >
            This page is still open. It expires{" "}
            {payment.expiresAt ? dateFmt.format(payment.expiresAt) : "in 24 hours"}.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card p-6">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Field label="Amount">
              <span className="text-lg font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</span>
            </Field>
            <Field label="Refunded">
              <span className="tabular-nums">
                {formatMoney(payment.amountRefunded, payment.currency)}
                {payment.amountRefunded > 0 && <span className="ml-2 text-xs text-muted">of {formatMoney(payment.amount, payment.currency)}</span>}
              </span>
            </Field>
            <Field label="Tollbooth fee">
              <span className="tabular-nums">
                {formatMoney(payment.applicationFee, payment.currency)}
                <span className="ml-2 text-xs text-muted">{feeDescription()}</span>
              </span>
            </Field>
            <Field label="Fee kept after refunds">
              <span className="tabular-nums">{formatMoney(payment.netFee, payment.currency)}</span>
            </Field>
            <Field label="Customer">{payment.customerEmail ?? "—"}</Field>
            <Field label="Reference">{payment.reference ?? "—"}</Field>
            <Field label="Created">{dateFmt.format(payment.createdAt)}</Field>
            <Field label="Source">
              {payment.source === "link" ? (
                <Link href="/dashboard/links" className="text-accent hover:underline">
                  Payment link
                </Link>
              ) : (
                "API"
              )}
            </Field>
            {payment.checkoutSessionId && <Field label="Checkout session"><code className="font-mono text-xs">{payment.checkoutSessionId}</code></Field>}
            {payment.paymentIntentId && <Field label="Payment intent"><code className="font-mono text-xs">{payment.paymentIntentId}</code></Field>}
            {payment.chargeId && <Field label="Charge"><code className="font-mono text-xs">{payment.chargeId}</code></Field>}
            {payment.expiresAt && <Field label="Expires">{dateFmt.format(payment.expiresAt)}</Field>}
          </dl>

          {payment.lastError && (
            <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
              <p className="font-medium text-amber-200">{payment.status === "disputed" ? "Dispute" : "Last error"}</p>
              <p className="mt-1 text-muted">{payment.lastError}</p>
            </div>
          )}

          {Object.keys(payment.metadata ?? {}).length > 0 && (
            <div className="mt-6">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Metadata</p>
              <Code copyable>{JSON.stringify(payment.metadata, null, 2)}</Code>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {refundable ? (
            <div className="card p-5">
              <h2 className="font-medium">Refund</h2>
              <p className="mt-1 text-sm text-muted">
                {formatMoney(remaining, payment.currency)} is still refundable. Tollbooth returns the fee on whatever you refund.
              </p>
              <RefundForm paymentId={payment.id} currency={payment.currency} remaining={remaining} />
            </div>
          ) : payment.status === "refunded" ? (
            <div className="card p-5">
              <h2 className="font-medium">Fully refunded</h2>
              <p className="mt-1 text-sm text-muted">This payment has been returned to the customer in full.</p>
            </div>
          ) : (
            <div className="card p-5">
              <h2 className="font-medium">Refunds</h2>
              <p className="mt-1 text-sm text-muted">Only completed payments can be refunded.</p>
            </div>
          )}

          {payment.refunds.length > 0 && (
            <div className="card p-5">
              <h2 className="font-medium">Refund history</h2>
              <ul className="mt-3 space-y-3">
                {payment.refunds.map((refund) => (
                  <li key={refund.id} className="border-b border-line/60 pb-3 text-sm last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium tabular-nums">{formatMoney(refund.amount, refund.currency)}</span>
                      <StatusBadge value={refund.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {dateFmt.format(refund.createdAt)}
                      {refund.reason ? ` · ${refund.reason.replaceAll("_", " ")}` : ""}
                      {refund.createdByKind === "dashboard" ? " · from dashboard" : ""}
                    </p>
                    {refund.feeReturned > 0 && <p className="mt-0.5 text-xs text-muted">Fee returned: {formatMoney(refund.feeReturned, refund.currency)}</p>}
                    {refund.note && <p className="mt-1 text-xs text-muted">{refund.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
