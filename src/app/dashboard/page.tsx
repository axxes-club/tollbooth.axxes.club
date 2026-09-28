import Link from "next/link"
import { requireContext } from "@/lib/context"
import { PageHeader, Stat, Empty } from "@/components/ui"
import { PaymentsTable } from "@/components/payments-table"
import { formatMoney } from "@/lib/fees"
import { getAccount, getPayments, getVolume } from "./queries"

export default async function Overview() {
  const ctx = await requireContext()
  const [account, volume, recent] = await Promise.all([getAccount(ctx.tenant.id), getVolume(ctx.tenant.id), getPayments(ctx.tenant.id, 8)])
  const primary = volume.sort((a, b) => b.gross - a.gross)[0]
  const currency = primary?.currency ?? account?.defaultCurrency ?? "usd"

  return (
    <>
      <PageHeader title="Overview" description={`Payments for ${ctx.tenant.name}, last 30 days.`} />

      {!account?.chargesEnabled && (
        <div className="card mb-8 flex flex-col gap-4 border-accent/40 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{account ? "Finish setting up payouts" : "Start accepting payments"}</p>
            <p className="mt-1 text-sm text-muted">
              Connect a Stripe payout account for {ctx.tenant.name}. It takes about five minutes, and money lands in your bank on a rolling schedule.
            </p>
          </div>
          <Link href="/dashboard/settings" className="btn-primary shrink-0">{account ? "Continue setup" : "Set up payouts"}</Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Gross volume" value={formatMoney(primary?.gross ?? 0, currency)} hint={volume.length > 1 ? `plus ${volume.length - 1} other currencies` : currency.toUpperCase()} href="/dashboard/payments" />
        <Stat label="Successful payments" value={(primary?.succeeded ?? 0).toLocaleString()} hint={`${(primary?.total ?? 0).toLocaleString()} started`} />
        <Stat label="Refunded" value={formatMoney(primary?.refunded ?? 0, currency)} hint={`Tollbooth fees ${formatMoney(primary?.fees ?? 0, currency)}`} />
      </div>

      <h2 className="mb-3 mt-10 text-sm font-medium text-muted">Recent payments</h2>
      {recent.length ? (
        <PaymentsTable payments={recent} />
      ) : (
        <Empty
          title="No payments yet"
          body="Create an API key, then start a checkout from your app. Payments appear here as they happen."
          action={<Link href="/dashboard/developers" className="btn-ghost">Get an API key</Link>}
        />
      )}
    </>
  )
}
