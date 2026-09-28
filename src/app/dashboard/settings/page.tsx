import { requireContext } from "@/lib/context"
import { PageHeader, StatusBadge } from "@/components/ui"
import { feeDescription } from "@/lib/fees"
import { stripeMode } from "@/lib/stripe"
import { getAccount } from "../queries"
import { openStripeDashboard, refreshAccount, startOnboarding } from "../actions"

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const ctx = await requireContext()
  const { onboarding } = await searchParams
  const account = await getAccount(ctx.tenant.id)
  const canManage = ["owner", "admin"].includes(ctx.role)
  const ready = !!account?.chargesEnabled

  return (
    <>
      <PageHeader title="Payouts & settings" description="Where your money goes, and how Tollbooth is set up for this workspace." />

      {onboarding === "done" && !ready && (
        <p className="card mb-6 p-4 text-sm text-muted" role="status">
          Thanks! Stripe is reviewing your details — this usually takes a few minutes. Refresh the status below.
        </p>
      )}

      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-medium">Stripe payout account</p>
            <p className="mt-1 text-sm text-muted">
              {account ? <span className="font-mono">{account.stripeAccountId}</span> : "Not connected yet."}
              {account?.country && ` · ${account.country}`}
              {account?.defaultCurrency && ` · ${account.defaultCurrency.toUpperCase()}`}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge value={ready ? "active" : account ? "in_progress" : "not connected"} />
          </div>
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <Flag label="Details submitted" on={!!account?.detailsSubmitted} />
          <Flag label="Charges enabled" on={!!account?.chargesEnabled} />
          <Flag label="Payouts enabled" on={!!account?.payoutsEnabled} />
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          {canManage && !ready && (
            <form action={startOnboarding}>
              <button className="btn-primary">{account ? "Continue setup with Stripe" : "Set up payouts with Stripe"}</button>
            </form>
          )}
          {canManage && account?.detailsSubmitted ? (
            <form action={openStripeDashboard}>
              <button className="btn-ghost">Open Stripe dashboard</button>
            </form>
          ) : null}
          {account && (
            <form action={refreshAccount}>
              <button className="btn-ghost">Refresh status</button>
            </form>
          )}
        </div>
        {!canManage && <p className="mt-4 text-xs text-muted">Only workspace owners and admins can change payout settings.</p>}
      </section>

      <section className="card mt-6 grid gap-4 p-6 text-sm sm:grid-cols-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Tollbooth fee</p>
          <p className="mt-2 font-medium">{feeDescription()} per payment</p>
          <p className="mt-1 text-xs text-muted">On top of Stripe&apos;s processing fees.</p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Mode</p>
          <p className="mt-2 font-medium capitalize">{stripeMode()}</p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Workspace</p>
          <p className="mt-2 font-medium">{ctx.tenant.name}</p>
        </div>
      </section>
    </>
  )
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2 rounded-full ${on ? "bg-emerald-400" : "bg-line"}`} />
      <span className={on ? "text-text" : "text-muted"}>{label}</span>
    </div>
  )
}
