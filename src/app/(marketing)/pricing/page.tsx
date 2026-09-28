import Link from "next/link"
import { feeDescription } from "@/lib/fees"

export const metadata = { title: "Pricing", description: "Simple, per-payment pricing for Tollbooth." }

const FAQ = [
  { q: "What are Stripe's fees?", a: "Stripe charges its standard processing fee on each payment (for US cards, typically 2.9% + 30¢). Tollbooth's fee is added on top and only applies to successful payments." },
  { q: "When do I get paid?", a: "Payouts go to your bank on Stripe's rolling schedule once your payout account is verified — usually two business days in the US." },
  { q: "What happens on a refund?", a: "The customer gets their money back, and Tollbooth's fee on the refunded amount is returned to you automatically." },
  { q: "Do I need an AXXES Suite subscription?", a: "No. Any AXXES account with a workspace can use Tollbooth. If you already use the Suite, it's built right in." },
]

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Pricing</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Pay per payment. That&apos;s it.</h1>
        <p className="mt-4 text-lg text-muted">No setup fees, no monthly minimums, no contracts.</p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="card relative p-8 ring-1 ring-accent/40">
          <p className="font-medium">Standard</p>
          <p className="mt-6 text-5xl font-semibold tracking-tight">{feeDescription()}</p>
          <p className="mt-2 text-muted">per successful payment, plus Stripe&apos;s processing fees</p>
          <ul className="mt-8 space-y-3 text-sm">
            {["Hosted checkout with cards, Apple Pay and Google Pay", "Payouts to your bank via Stripe Connect", "API keys for every app", "Full and partial refunds", "Payments dashboard for your whole team", "Signed webhooks and idempotent requests"].map((f) => (
              <li key={f} className="flex gap-3"><span className="text-accent">✓</span>{f}</li>
            ))}
          </ul>
          <Link href="/dashboard" className="btn-primary mt-8 w-full py-3">Get started</Link>
        </div>
        <div className="card p-8">
          <p className="font-medium">Enterprise</p>
          <p className="mt-6 text-5xl font-semibold tracking-tight">Custom</p>
          <p className="mt-2 text-muted">for high volume and platforms</p>
          <ul className="mt-8 space-y-3 text-sm">
            {["Volume pricing", "Custom payout schedules", "Dedicated support channel", "Help migrating from another processor"].map((f) => (
              <li key={f} className="flex gap-3"><span className="text-muted">✓</span>{f}</li>
            ))}
          </ul>
          <a href="mailto:hello@axxes.club?subject=Tollbooth%20Enterprise" className="btn-ghost mt-8 w-full py-3">Talk to us</a>
        </div>
      </div>

      <section className="mt-20 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
        <dl className="mt-6 divide-y divide-line">
          {FAQ.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  )
}
