import { requireContext } from "@/lib/context"
import { PageHeader, Empty, Stat, StatusBadge } from "@/components/ui"
import { formatMoney } from "@/lib/fees"
import { getRefundRows, getVolume } from "../queries"

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

/** Every refund in one place, with what it cost and why it happened. */
export default async function RefundsPage() {
  const ctx = await requireContext()
  const [refunds, volume] = await Promise.all([getRefundRows(ctx.tenant.id, 200), getVolume(ctx.tenant.id, 30)])
  const primary = [...volume].sort((a, b) => b.refunded - a.refunded)[0]
  const currency = primary?.currency ?? "usd"

  const returned = refunds.reduce((sum, r) => sum + r.feeReturned, 0)

  return (
    <>
      <PageHeader title="Refunds" description="Money returned to customers, and the fees that came back with it." />

      {refunds.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Refunds" value={refunds.length.toLocaleString()} />
          <Stat label="Refunded · 30 days" value={formatMoney(primary?.refunded ?? 0, currency)} />
          <Stat label="Fees returned" value={formatMoney(returned, currency)} hint="Tollbooth gave this back" />
        </div>
      )}

      {refunds.length === 0 ? (
        <Empty title="No refunds yet" body="Refunds you issue — from here or the API — show up with the reason and the fee returned." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
                <th className="px-4 py-3 font-normal">Amount</th>
                <th className="px-4 py-3 font-normal">Payment</th>
                <th className="px-4 py-3 font-normal">Reason</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 text-right font-normal">Fee returned</th>
                <th className="px-4 py-3 font-normal">Date</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((refund) => (
                <tr key={refund.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{formatMoney(refund.amount, refund.currency)}</td>
                  <td className="px-4 py-3">
                    <a href={`/dashboard/payments/${refund.paymentId}`} className="font-mono text-xs text-accent hover:underline">
                      {refund.paymentId.slice(0, 8)}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {refund.reason ? refund.reason.replaceAll("_", " ") : "—"}
                    {refund.note && <span className="block text-xs">{refund.note}</span>}
                    {refund.createdByKind === "dashboard" && <span className="text-xs text-muted/70">from dashboard</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={refund.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{formatMoney(refund.feeReturned, refund.currency)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{dateFmt.format(refund.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
