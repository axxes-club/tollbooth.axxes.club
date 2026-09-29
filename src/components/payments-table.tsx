import Link from "next/link"
import { StatusBadge } from "@/components/ui"
import { formatMoney } from "@/lib/fees"
import type { schema } from "@/lib/db"

type Payment = typeof schema.tollboothPayments.$inferSelect

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })

export function PaymentsTable({ payments, showFee = true }: { payments: Payment[]; showFee?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
            <th className="px-4 py-3 font-normal">Amount</th>
            <th className="px-4 py-3 font-normal">Status</th>
            <th className="px-4 py-3 font-normal">Description</th>
            {showFee && <th className="px-4 py-3 text-right font-normal">Fee</th>}
            <th className="px-4 py-3 font-normal">Customer</th>
            <th className="px-4 py-3 font-normal">Date</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-line/60 transition last:border-0 hover:bg-panel-2/40">
              <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                <Link href={`/dashboard/payments/${p.id}`} className="hover:underline">
                  {formatMoney(p.amount, p.currency)}
                </Link>
                {p.amountRefunded > 0 && (
                  <span className="ml-2 text-xs text-muted">−{formatMoney(p.amountRefunded, p.currency)}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-1.5">
                  <StatusBadge value={p.status} />
                  {p.mode === "test" && <StatusBadge value="test" />}
                </span>
              </td>
              <td className="max-w-[260px] px-4 py-3 text-muted">
                <span className="block truncate" title={p.description ?? ""}>
                  {p.description ?? "—"}
                </span>
                <span className="flex items-center gap-2 font-mono text-[11px] text-muted/80">
                  {p.reference && <span>{p.reference}</span>}
                  {p.source === "link" && <span className="rounded bg-white/5 px-1">link</span>}
                </span>
              </td>
              {showFee && <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{formatMoney(p.netFee, p.currency)}</td>}
              <td className="max-w-[200px] truncate px-4 py-3 text-muted">{p.customerEmail ?? "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                <span title={p.createdAt.toISOString()}>
                  {dateFmt.format(p.createdAt)} <span className="text-muted/70">{timeFmt.format(p.createdAt)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
