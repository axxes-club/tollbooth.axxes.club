import Link from "next/link"
import { feeDescription, applicationFee } from "@/lib/fees"
import { formatMoney } from "@/lib/fees"

export const metadata = { title: "Pricing", description: "One percentage per successful payment. No monthly fee, no minimum, no contract." }

/** Worked examples, because a percentage fee means nothing until you apply it. */
const EXAMPLES = [500, 2500, 10_000, 25_000].map((amount) => ({
  amount,
  fee: applicationFee(amount),
  net: amount - applicationFee(amount),
}))

const FAQ = [
  { q: "What's in the fee, exactly?", a: "Tollbooth takes a percentage of each successful payment, before it reaches your payout account. Stripe then takes its own standard processing fee on top — typically 2.9% + 30¢ for a US card. Both are visible; neither is hidden in a fee you discover later." },
  { q: "What does a refund cost me?", a: "Nothing extra. The slice of our fee that covered the refunded amount is returned to you automatically, and the transfer back to your account is reversed. A full refund puts you back where you started." },
  { q: "When do I get paid?", a: "On Stripe's rolling schedule, once your payout account is verified — usually two business days in the US. Your dashboard shows available, pending and the next payout date, read live from Stripe rather than estimated." },
  { q: "Do I pay anything while I'm building?", a: "No. Test-mode keys can only move money inside Stripe's test environment, so the entire integration can be built and exercised at no cost. You only start paying when a live key takes a real payment." },
  { q: "Is there a minimum or a contract?", a: "No minimum, no contract, no monthly fee. Cancel by not using it. Your payment history and receipts stay available to you either way." },
  { q: "What about disputes and chargebacks?", a: "They follow Stripe's standard rules for the platform account. A disputed payment is flagged on the payment in your dashboard, and Stripe's dispute tooling is where you respond with evidence." },
]

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">Pricing</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          {feeDescription()} of each payment you take.
        </h1>
        <p className="mt-4 text-lg text-muted">
          That's the whole price list. No setup fee, no monthly minimum, no contract, and nothing at all while you build.
        </p>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="card p-8 ring-1 ring-accent/30">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Standard</h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">Everything included</span>
          </div>
          <p className="mt-6 text-5xl font-semibold tracking-tight">{feeDescription()}</p>
          <p className="mt-2 text-muted">per successful payment, plus Stripe's processing fees</p>

          <ul className="mt-8 space-y-3 text-sm">
            {[
              "Hosted checkout with cards, Apple Pay and Google Pay",
              "Payment links — sell with no code at all",
              "Products and prices, with immutable amounts",
              "Full and partial refunds, fee returned automatically",
              "Signed webhooks with retries and a delivery log",
              "Separate test and live keys",
              "Payouts to your bank, balances read live from Stripe",
              "CSV export, customer list, dashboard for your whole team",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="text-accent">✓</span>
                <span className="text-muted">{item}</span>
              </li>
            ))}
          </ul>

          <Link href="/dashboard" className="btn-primary mt-8 w-full py-3">
            Start taking payments
          </Link>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-medium">What you actually keep</h2>
            <p className="mt-1 text-sm text-muted">On a $25 ticket, before Stripe's own processing fee:</p>
            <dl className="mt-5 space-y-3 text-sm">
              {EXAMPLES.map((row) => (
                <div key={row.amount} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-3 last:border-0 last:pb-0">
                  <dt className="tabular-nums text-muted">Charge {formatMoney(row.amount, "usd")}</dt>
                  <dd className="text-right tabular-nums">
                    <span className="text-muted">−{formatMoney(row.fee, "usd")}</span>
                    <span className="ml-3 font-medium">{formatMoney(row.net, "usd")}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card p-6">
            <h2 className="font-medium">Enterprise</h2>
            <p className="mt-1 text-sm text-muted">For higher volume or an unusual arrangement.</p>
            <ul className="mt-5 space-y-3 text-sm">
              {["Volume pricing", "Custom payout schedules", "A named contact who knows your account", "Help migrating off another processor"].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="text-muted">✓</span>
                  <span className="text-muted">{item}</span>
                </li>
              ))}
            </ul>
            <a href="mailto:hello@axxes.club?subject=Tollbooth%20Enterprise" className="btn-ghost mt-6 w-full">
              Talk to us
            </a>
          </div>
        </div>
      </div>

      <section className="mt-20 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
        <dl className="mt-6 divide-y divide-line">
          {FAQ.map((item) => (
            <div key={item.q} className="py-5">
              <dt className="font-medium">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  )
}
