import Link from "next/link"
import { feeDescription } from "@/lib/fees"

export const metadata = {
  title: "Tollbooth — payments that wave you through",
  description: "Hosted checkout, payouts to your bank and one simple API for every AXXES business. Powered by Stripe.",
}

const FEATURES = [
  { title: "Hosted checkout", body: "Send customers to a fast, secure checkout that handles cards, Apple Pay and Google Pay. No PCI scope on your side." },
  { title: "Payouts to your bank", body: "Each workspace gets its own Stripe payout account. Onboarding takes about five minutes, then money lands on a rolling schedule." },
  { title: "One API for every app", body: "Tickets on afters.am, orders in Krates, invoices in the Suite — all start payments with the same three-line request." },
  { title: "Refunds in one call", body: "Full or partial refunds, with Tollbooth's fee returned automatically. No dashboards to dig through." },
  { title: "A ledger you can trust", body: "Signed Stripe webhooks, idempotent processing and a payment record for every checkout — started, paid, refunded or expired." },
  { title: "Built into AXXES", body: "Same AXXES account, same workspaces and roles. Owners manage payouts; your team sees every payment in one place." },
]

const STEPS = [
  { n: "01", title: "Connect payouts", body: "Verify your business with Stripe once. Tollbooth keeps the status in sync." },
  { n: "02", title: "Create an API key", body: "One key per app. Keys are hashed at rest and can be revoked in a click." },
  { n: "03", title: "Start a checkout", body: "POST an amount and a description, redirect to checkout_url. That's the whole integration." },
]

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[520px] max-w-4xl rounded-full bg-accent/20 blur-[120px]" />
        <div className="relative mx-auto grid max-w-6xl gap-14 px-4 pb-24 pt-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              <span className="size-1.5 rounded-full bg-accent" /> New from AXXES
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Payments that
              <br />
              <span className="text-accent">wave you through.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Tollbooth is the payment gateway for AXXES businesses: hosted checkout, payouts to your bank and one simple API
              for every app you run. Powered by Stripe.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard" className="btn-primary px-5 py-3 text-base">Start accepting payments</Link>
              <Link href="/docs" className="btn-ghost px-5 py-3 text-base">Read the docs</Link>
            </div>
            <p className="mt-5 text-sm text-muted">{feeDescription()} per payment, plus Stripe&apos;s fees. No monthly fee.</p>
          </div>

          {/* Product visual: request → checkout → paid */}
          <div className="relative">
            <div className="card overflow-hidden shadow-2xl shadow-accent/10">
              <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
                <span className="size-2.5 rounded-full bg-line" /><span className="size-2.5 rounded-full bg-line" /><span className="size-2.5 rounded-full bg-line" />
                <span className="ml-3 font-mono text-[11px] text-muted">POST /api/v1/checkout-sessions</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
<span className="text-muted">{"{"}</span>{"\n"}
{"  "}<span className="text-accent">&quot;amount&quot;</span>: <span className="text-text">2500</span>,{"\n"}
{"  "}<span className="text-accent">&quot;currency&quot;</span>: <span className="text-emerald-300">&quot;usd&quot;</span>,{"\n"}
{"  "}<span className="text-accent">&quot;description&quot;</span>: <span className="text-emerald-300">&quot;VIP ticket — Friday&quot;</span>,{"\n"}
{"  "}<span className="text-accent">&quot;success_url&quot;</span>: <span className="text-emerald-300">&quot;https://afters.am/thanks&quot;</span>{"\n"}
<span className="text-muted">{"}"}</span>
              </pre>
              <div className="border-t border-line bg-panel-2 px-5 py-4 font-mono text-[12.5px]">
                <span className="text-muted">→ 201</span>{" "}
                <span className="text-text">checkout_url</span>: <span className="text-emerald-300">&quot;https://checkout.stripe.com/…&quot;</span>
              </div>
            </div>
            <div className="card absolute -bottom-20 -left-4 w-64 p-4 shadow-xl sm:-left-10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Payment received</span>
                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">Succeeded</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">$25.00</p>
              <p className="mt-0.5 text-xs text-muted">VIP ticket — Friday · order_1234</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-line/60 bg-panel/50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 font-mono text-[11px] uppercase tracking-[0.2em] text-muted sm:px-6">
          <span>Powered by Stripe</span><span>Stripe Connect payouts</span><span>Signed webhooks</span><span>Built into the AXXES Suite</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Why Tollbooth</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Everything between &ldquo;Buy&rdquo; and money in the bank.</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-bg p-7">
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-line/60 bg-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Live in an afternoon.</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="card p-7">
                <span className="font-mono text-sm text-accent">{s.n}</span>
                <h3 className="mt-4 text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing teaser + CTA */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="card relative overflow-hidden p-10 text-center sm:p-16">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent)_0%,transparent_60%)] opacity-15" />
          <h2 className="relative text-3xl font-semibold tracking-tight sm:text-5xl">{feeDescription()} per payment.</h2>
          <p className="relative mt-4 text-lg text-muted">Plus Stripe&apos;s standard processing fees. No setup cost, no monthly fee, no lock-in.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="btn-primary px-5 py-3 text-base">Get started</Link>
            <Link href="/pricing" className="btn-ghost px-5 py-3 text-base">See pricing</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
