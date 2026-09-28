import { StatusBadge } from "@/components/ui"
import { formatMoney } from "@/lib/fees"
import type { schema } from "@/lib/db"

type Payment = typeof schema.tollboothPayments.$inferSelect

export function PaymentsTable({ payments }: { payments: Payment[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
            <th className="px-4 py-3 font-normal">Amount</th>
            <th className="px-4 py-3 font-normal">Status</th>
            <th className="px-4 py-3 font-normal">Description</th>
            <th className="px-4 py-3 font-normal">Customer</th>
            <th className="px-4 py-3 font-normal">Date</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3 font-medium tabular-nums">
                {formatMoney(p.amount, p.currency)} <span className="text-xs uppercase text-muted">{p.currency}</span>
              </td>
              <td className="px-4 py-3"><StatusBadge value={p.status} /></td>
              <td className="max-w-[260px] truncate px-4 py-3 text-muted" title={p.description ?? ""}>
                {p.description}
                {p.reference && <span className="ml-2 font-mono text-[11px]">{p.reference}</span>}
              </td>
              <td className="px-4 py-3 text-muted">{p.customerEmail ?? "—"}</td>
              <td className="px-4 py-3 text-muted">{p.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
