import Link from "next/link"
import { requireContext } from "@/lib/context"
import { PageHeader, Empty } from "@/components/ui"
import { PaymentsTable } from "@/components/payments-table"
import { getPayments } from "../queries"

const FILTERS = ["all", "succeeded", "pending", "refunded", "failed", "expired"] as const

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireContext()
  const { status } = await searchParams
  const active = FILTERS.includes(status as (typeof FILTERS)[number]) ? status! : "all"
  const payments = await getPayments(ctx.tenant.id, 200, active === "all" ? undefined : active)

  return (
    <>
      <PageHeader title="Payments" description="Every checkout started through Tollbooth." />
      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/dashboard/payments" : `/dashboard/payments?status=${f}`}
            className={`rounded-full px-3 py-1 text-xs capitalize ring-1 ${active === f ? "bg-accent text-accent-ink ring-accent" : "text-muted ring-line hover:text-text"}`}
          >
            {f}
          </Link>
        ))}
      </nav>
      {payments.length ? <PaymentsTable payments={payments} /> : <Empty title="Nothing here" body="No payments match this filter yet." />}
    </>
  )
}
