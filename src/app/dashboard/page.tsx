import Link from "next/link"
import { requireContext } from "@/lib/context"
import { PageHeader, Stat, Empty, Notice, Sparkline, StatusBadge } from "@/components/ui"
import { PaymentsTable } from "@/components/payments-table"
import { formatMoney, feeDescription } from "@/lib/fees"
import { stripeConfigured } from "@/lib/stripe"
import { getAccount, getPayments, getVolume, getDailyVolume, getOnboarding } from "./queries"

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

/**
 * The landing screen for a signed-in merchant.
 *
 * Answers three questions in order: am I set up, what happened recently, and what
 * does the money look like. Onboarding is the first thing shown until it's done,
 * because an unfinished setup is the only real blocker.
 */
export default async function Overview() {
  const ctx = await requireContext()
  const [account, volume, daily, recent, onboarding] = await Promise.all([
    getAccount(ctx.tenant.id),
    getVolume(ctx.tenant.id, 30),
    getDailyVolume(ctx.tenant.id, 30),
    getPayments(ctx.tenant.id, 8),
    getOnboarding(ctx.tenant.id),
  ])

  const primary = [...volume].sort((a, b) => b.gross - a.gross)[0]
  const currency = primary?.currency ?? account?.defaultCurrency ?? "usd"
  const setupComplete = onboarding.done === onboarding.total

  return (
    <>
      <PageHeader
        title={`Good to see you, ${ctx.user.name?.split(" ")[0] ?? "there"}`}
        description={`Payments for ${ctx.tenant.name}.`}
        action={
          <Link href="/dashboard/links" className="btn-primary">
            New payment link
          </Link>
        }
      />

      {!stripeConfigured() && (
        <div className="mb-6">
          <Notice tone="warn" title="Payments aren't fully configured">
            Set <code className="font-mono text-xs">STRIPE_SECRET_KEY</code> and{" "}
            <code className="font-mono text-xs">STRIPE_SECRET_KEY_TEST</code> in the environment. Until then no charge can be started.
          </Notice>
        </div>
      )}

      {!setupComplete && (
        <section className="card mb-8 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Finish setting up</h2>
            <p className="text-sm text-muted">
              {onboarding.done} of {onboarding.total} done
            </p>
          </div>
          <ol className="mt-5 space-y-1">
            {onboarding.steps.map((step, index) => (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className={`flex items-start gap-3 rounded-xl p-3 transition hover:bg-panel-2 ${step.done ? "opacity-60" : ""}`}
                >
                  <span
                    className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium ${
                      step.done ? "bg-emerald-400/15 text-emerald-300" : "bg-panel-2 text-muted"
                    }`}
                  >
                    {step.done ? "✓" : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${step.done ? "line-through" : ""}`}>{step.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{step.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {account?.chargesDisabledReason && (
        <div className="mb-6">
          <Notice tone="warn" title="Charges are paused">
            Stripe says: {account.chargesDisabledReason.replaceAll("_", " ")}.{" "}
            <Link href="/dashboard/settings" className="underline underline-offset-2">
              Fix this
            </Link>
          </Notice>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Available to pay out"
          value={account ? formatMoney(account.balanceAvailable, currency) : "—"}
          hint={account?.nextPayoutAt ? `Next payout ${dateFmt.format(account.nextPayoutAt)}` : "Set up payouts to see this"}
          href="/dashboard/settings"
        />
        <Stat label="Gross · 30 days" value={formatMoney(primary?.gross ?? 0, currency)} hint={`${(primary?.succeeded ?? 0).toLocaleString()} payments`} href="/dashboard/payments" />
        <Stat
          label="Refunded · 30 days"
          value={formatMoney(primary?.refunded ?? 0, currency)}
          hint={primary && primary.gross > 0 ? `${((primary.refunded / primary.gross) * 100).toFixed(1)}% of gross` : "None yet"}
        />
        <Stat label="Tollbooth fees · 30 days" value={formatMoney(primary?.fees ?? 0, currency)} hint={feeDescription()} />
      </div>

      {daily.length > 1 && (
        <section className="card mt-6 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted">Volume, last 30 days</h2>
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
              peak {formatMoney(Math.max(...daily.map((d) => d.gross)), currency)}
            </p>
          </div>
          <div className="mt-4">
            <Sparkline points={daily.map((d) => d.gross)} />
          </div>
        </section>
      )}

      <div className="mt-10 mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted">Recent payments</h2>
        <Link href="/dashboard/payments" className="text-xs text-accent hover:underline">
          View all
        </Link>
      </div>

      {recent.length ? (
        <PaymentsTable payments={recent} />
      ) : (
        <Empty
          title="No payments yet"
          body="The fastest way to take money is a payment link — it needs no code at all. Or charge from your app with one API call."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/dashboard/links" className="btn-primary">
                Create a payment link
              </Link>
              <Link href="/dashboard/developers" className="btn-ghost">
                Get an API key
              </Link>
            </div>
          }
        />
      )}

      {!stripeConfigured() && (
        <p className="mt-6 text-xs text-muted">
          Current platform mode: <StatusBadge value="test" /> — set <code className="font-mono">STRIPE_SECRET_KEY</code> to accept real money.
        </p>
      )}
    </>
  )
}
