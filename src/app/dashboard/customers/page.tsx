import { requireContext } from "@/lib/context"
import { PageHeader, Empty, Stat } from "@/components/ui"
import { formatMoney } from "@/lib/fees"
import { getCustomers } from "../queries"

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })

/**
 * Customers. Tollbooth creates one automatically the first time an email is seen, so
 * this list fills in whether or not the merchant ever asks for it.
 */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireContext()
  const { q } = await searchParams
  const all = await getCustomers(ctx.tenant.id)

  const query = q?.trim().toLowerCase()
  const customers = query
    ? all.filter((c) => c.email.toLowerCase().includes(query) || c.name?.toLowerCase().includes(query))
    : all

  const repeat = all.filter((c) => c.paymentCount > 1).length
  const lifetime = all.reduce((sum, c) => sum + c.totalSpent, 0)
  const currency = all.find((c) => c.paymentCount > 0)?.metadata?.currency ?? "usd"

  return (
    <>
      <PageHeader title="Customers" description="Buyers who've paid this workspace, newest first." />

      {all.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Customers" value={all.length.toLocaleString()} />
          <Stat label="Repeat buyers" value={repeat.toLocaleString()} hint={all.length ? `${((repeat / all.length) * 100).toFixed(0)}% came back` : undefined} />
          <Stat label="Lifetime value" value={formatMoney(lifetime, currency)} hint="Across all customers" />
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="Search by name or email" className="input max-w-xs" aria-label="Search customers" />
        <button className="btn-ghost" type="submit">Search</button>
      </form>

      {customers.length === 0 ? (
        <Empty
          title={query ? "No matches" : "No customers yet"}
          body={
            query
              ? `Nothing matched "${q}".`
              : "A customer is created the first time someone pays with a new email address, or when you create one through the API."
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
                <th className="px-4 py-3 font-normal">Email</th>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 text-right font-normal">Payments</th>
                <th className="px-4 py-3 text-right font-normal">Total spent</th>
                <th className="px-4 py-3 font-normal">Last paid</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">{customer.email}</td>
                  <td className="px-4 py-3 text-muted">{customer.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{customer.paymentCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(customer.totalSpent, currency)}</td>
                  <td className="px-4 py-3 text-muted">{customer.lastPaidAt ? dateFmt.format(customer.lastPaidAt) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
