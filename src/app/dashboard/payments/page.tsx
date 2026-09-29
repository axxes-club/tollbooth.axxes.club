import Link from "next/link"
import { requireContext } from "@/lib/context"
import { PageHeader, Empty, Stat, Notice } from "@/components/ui"
import { PaymentsTable } from "@/components/payments-table"
import { formatMoney } from "@/lib/fees"
import { getPayments, getVolume } from "../queries"

const FILTERS = [
  { value: "all", label: "All" },
  { value: "succeeded", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
  { value: "partially_refunded", label: "Partly refunded" },
  { value: "disputed", label: "Disputed" },
  { value: "expired", label: "Expired" },
  { value: "failed", label: "Failed" },
] as const

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mode?: string; q?: string }>
}) {
  const ctx = await requireContext()
  const params = await searchParams
  const active = FILTERS.find((f) => f.value === params.status)?.value ?? "all"
  const mode = params.mode === "test" || params.mode === "live" ? params.mode : undefined
  const q = params.q?.trim() ?? ""

  const [payments, volume] = await Promise.all([
    getPayments(ctx.tenant.id, 200, active === "all" ? undefined : active),
    getVolume(ctx.tenant.id, 30, mode),
  ])

  const filtered = q
    ? payments.filter(
        (p) =>
          p.description?.toLowerCase().includes(q.toLowerCase()) ||
          p.customerEmail?.toLowerCase().includes(q.toLowerCase()) ||
          p.reference?.toLowerCase().includes(q.toLowerCase()) ||
          p.id.toLowerCase().includes(q.toLowerCase())
      )
    : payments

  const primary = volume.sort((a, b) => b.gross - a.gross)[0]
  const currency = primary?.currency ?? "usd"

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every charge started through Tollbooth, newest first."
        action={
          <Link href="/api/dashboard/payments.csv" className="btn-ghost">
            Export CSV
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Gross · 30 days" value={formatMoney(primary?.gross ?? 0, currency)} hint="Value of all payments taken" />
        <Stat label="Refunded · 30 days" value={formatMoney(primary?.refunded ?? 0, currency)} hint="Returned to customers" />
        <Stat label="Paid · 30 days" value={(primary?.succeeded ?? 0).toLocaleString()} hint={`${(primary?.total ?? 0).toLocaleString()} checkouts started`} />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Search description, email or reference" className="input max-w-xs" aria-label="Search payments" />
        {mode && <input type="hidden" name="mode" value={mode} />}
        {active !== "all" && <input type="hidden" name="status" value={active} />}
        <button className="btn-ghost" type="submit">Search</button>
        {(q || mode) && (
          <Link href="/dashboard/payments" className="btn-ghost">
            Clear
          </Link>
        )}
      </form>

      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by status">
        {FILTERS.map((f) => {
          const href = new URLSearchParams()
          if (f.value !== "all") href.set("status", f.value)
          if (mode) href.set("mode", mode)
          if (q) href.set("q", q)
          const suffix = href.toString()
          return (
            <Link
              key={f.value}
              href={`/dashboard/payments${suffix ? `?${suffix}` : ""}`}
              className={`rounded-full px-3 py-1 text-xs ring-1 transition ${
                active === f.value ? "bg-accent text-accent-ink ring-accent" : "text-muted ring-line hover:text-text"
              }`}
            >
              {f.label}
            </Link>
          )
        })}
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
        {(["live", "test"] as const).map((m) => (
          <Link
            key={m}
            href={m === mode ? "/dashboard/payments" : `/dashboard/payments?mode=${m}`}
            className={`rounded-full px-3 py-1 text-xs capitalize ring-1 transition ${
              mode === m ? "bg-panel-2 text-text ring-line" : "text-muted ring-line hover:text-text"
            }`}
          >
            {m}
          </Link>
        ))}
      </nav>

      {filtered.length ? (
        <PaymentsTable payments={filtered} />
      ) : q ? (
        <Empty title="No matches" body={`Nothing matched "${q}".`} action={<Link href="/dashboard/payments" className="btn-ghost">Clear search</Link>} />
      ) : (
        <Empty
          title="No payments yet"
          body="Once a checkout is started it appears here within a second, whatever mode it's in."
          action={
            <div className="flex gap-2">
              <Link href="/dashboard/links" className="btn-primary">Create a payment link</Link>
              <Link href="/docs" className="btn-ghost">API docs</Link>
            </div>
          }
        />
      )}

      {volume.length > 1 && (
        <Notice tone="info" title="Multiple currencies">
          This workspace has taken payments in {volume.length} currencies. Figures above cover {currency.toUpperCase()} only — the API
          returns per-currency totals.
        </Notice>
      )}
    </>
  )
}
