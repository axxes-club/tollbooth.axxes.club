import Link from "next/link"
import { requireContext } from "@/lib/context"
import { PageHeader, StatusBadge, Field, Notice } from "@/components/ui"
import { feeDescription, formatMoney } from "@/lib/fees"
import { stripeMode, stripeConfigured } from "@/lib/stripe"
import { getAccount } from "../queries"
import { refreshAccountAction, startOnboarding, updatePayoutDetails } from "../actions"

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/**
 * Payouts and platform settings.
 *
 * Balance figures are read live from Stripe on refresh rather than accumulated from
 * our own rows, because a merchant reconciling a bank account needs the number their
 * processor actually holds — not our estimate of it.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const ctx = await requireContext()
  const { onboarding } = await searchParams
  const account = await getAccount(ctx.tenant.id)
  const canManage = ["owner", "admin"].includes(ctx.role)
  const ready = !!account?.chargesEnabled
  const currency = account?.defaultCurrency ?? "usd"

  return (
    <>
      <PageHeader title="Payouts & settings" description="Where your money goes, and how Tollbooth is set up for this workspace." />

      {!stripeConfigured() && (
        <div className="mb-6">
          <Notice tone="warn" title="Payments aren't fully configured">
            <code className="font-mono text-xs">STRIPE_SECRET_KEY</code> and{" "}
            <code className="font-mono text-xs">STRIPE_SECRET_KEY_TEST</code> both need to be set before this workspace can take payments.
          </Notice>
        </div>
      )}

      {onboarding === "done" && !ready && (
        <div className="mb-6">
          <Notice tone="info" title="Thanks — we're checking">
            Stripe is reviewing your details. This usually takes a few minutes. Hit refresh below once you&apos;re done.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-medium">Payout account</h2>
                <p className="mt-1 text-sm text-muted">
                  {account ? <span className="font-mono text-xs">{account.stripeAccountId}</span> : "Not connected yet."}
                  {account?.country && ` · ${account.country}`}
                  {account?.defaultCurrency && ` · ${account.defaultCurrency.toUpperCase()}`}
                </p>
              </div>
              <StatusBadge value={ready ? "active" : account ? "in_progress" : "not connected"} />
            </div>

            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
              <Flag label="Details submitted" on={!!account?.detailsSubmitted} />
              <Flag label="Charges enabled" on={!!account?.chargesEnabled} />
              <Flag label="Payouts enabled" on={!!account?.payoutsEnabled} />
            </dl>

            {account?.requirementsDue && account.requirementsDue.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
                <p className="font-medium text-amber-200">Still needed from you</p>
                <ul className="mt-2 space-y-1 text-muted">
                  {account.requirementsDue.map((requirement) => (
                    <li key={requirement} className="font-mono text-xs">
                      {requirement.replaceAll(".", " › ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {account?.chargesDisabledReason && !account.chargesEnabled && (
              <p className="mt-4 text-sm text-amber-300">Stripe: {account.chargesDisabledReason.replaceAll("_", " ")}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {canManage && !ready && (
                <form action={startOnboarding}>
                  <button className="btn-primary">{account ? "Continue payout setup" : "Set up payouts"}</button>
                </form>
              )}
              {canManage && account?.detailsSubmitted && (
                <form action={updatePayoutDetails}>
                  <button className="btn-ghost">Update payout details</button>
                </form>
              )}
              {account && (
                <form action={refreshAccountAction}>
                  <button className="btn-ghost">Refresh status</button>
                </form>
              )}
            </div>
            {!canManage && <p className="mt-4 text-xs text-muted">Only workspace owners and admins can change payout settings.</p>}
          </section>

          {account && (
            <section className="card p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">Balance</h2>
                <p className="text-xs text-muted">Read from Stripe on refresh</p>
              </div>
              <dl className="mt-5 grid gap-5 sm:grid-cols-3">
                <Field label="Available">
                  <span className="text-xl font-semibold tabular-nums">{formatMoney(account.balanceAvailable, currency)}</span>
                </Field>
                <Field label="Pending">
                  <span className="tabular-nums">{formatMoney(account.balancePending, currency)}</span>
                </Field>
                <Field label="Next payout">
                  <span className="tabular-nums">{account.nextPayoutAt ? dateFmt.format(account.nextPayoutAt) : "Not scheduled"}</span>
                </Field>
              </dl>
              {account.payoutSchedule && <p className="mt-4 text-xs text-muted">Schedule: {account.payoutSchedule.replaceAll("_", " ")}</p>}
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-medium">Billing</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <Field label="Tollbooth fee">
                <span className="font-medium">{feeDescription()}</span>
                <span className="mt-0.5 block text-xs text-muted">per successful payment, on top of Stripe&apos;s processing</span>
              </Field>
              <Field label="Monthly fee">
                <span className="font-medium">None</span>
              </Field>
              <Field label="Platform mode">
                <span className="font-medium capitalize">{stripeMode()}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {stripeMode() === "live" ? "Real money" : "Test money — set STRIPE_SECRET_KEY to go live"}
                </span>
              </Field>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="font-medium">Workspace</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <Field label="Name">{ctx.tenant.name}</Field>
              <Field label="Your role">
                <span className="capitalize">{ctx.role}</span>
              </Field>
              <Field label="Signed in as">{ctx.user.email}</Field>
            </dl>
          </section>
        </div>
      </div>
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
