import Link from "next/link"
import { feeDescription } from "@/lib/fees"

export const metadata = {
  title: "Payments that take an afternoon, not a quarter",
  description:
    "Tollbooth is a payment gateway for AXXES businesses: hosted checkout, a real API, signed webhooks and payouts to your bank. One percent, no monthly fee.",
}

const API_CALL = `curl https://tollbooth.axxes.club/api/v1/checkout-sessions \\
  -H "Authorization: Bearer $TOLLBOOTH_KEY" \\
  -H "Idempotency-Key: order_1234" \\
  -d '{
    "price": "vip_ticket",
    "customer_email": "buyer@example.com",
    "reference": "order_1234",
    "success_url": "https://yoursite.com/thanks"
  }'

# → 201 Created
# { "id": "9b2c…", "status": "pending", "checkout_url": "https://checkout.stripe.com/…" }`

const WEBHOOK = `{
  "id": "evt_a1b2c3",
  "type": "payment.succeeded",
  "created": 1735689600,
  "data": { "object": {
    "id": "9b2c…", "amount": 2500, "currency": "usd",
    "reference": "order_1234", "metadata": { "order_id": "1234" }
  }}
}`

/** Comparison against doing this yourself with Stripe Connect directly. */
const COMPARISON = [
  { them: "Create a Connect account, then work out the onboarding flow", us: "Click 'Set up payouts' and hand over to Stripe's hosted flow" },
  { them: "Build amounts, fees and transfer_data by hand", us: "Send a price id; the amount and fee stay server-side" },
  { them: "Decide which webhooks to subscribe to in the Stripe UI", us: "Pick events from a list of ten in our dashboard" },
  { them: "Write signature verification and retry logic", us: "Already done, with a delivery log you can inspect" },
  { them: "Test against a Stripe sandbox you configure yourself", us: "A test key that behaves identically, minus the money" },
  { them: "No-code selling needs a Checkout link and manual bookkeeping", us: "Payment links that land in the same ledger and API" },
]

const PROMISES = [
  { title: "The whole integration is one request", body: "POST a price, get back a checkout URL. There's no SDK requirement, no client secret, no frontend library — the hosted page handles cards, Apple Pay and Google Pay." },
  { title: "You get told, not left guessing", body: "A signed webhook the moment a payment succeeds, with retries and a delivery log. Polling is a fallback, not the plan." },
  { title: "Your money moves to your bank", body: "Each workspace has its own payout account. Onboarding is a few minutes; balances and the next payout date are on your dashboard." },
  { title: "Refunds don't cost you twice", body: "Refund all or part of a payment in one call. The share of our fee that covered the refunded money comes back to you automatically." },
  { title: "Test mode is a different key, not a different account", body: "A tb_test_ key behaves exactly like a live one and can only move money in a test environment. Ship your integration without touching a real card." },
  { title: "Prices are immutable, on purpose", body: "You can't edit what something cost after the fact. Change an amount by archiving the old price and adding a new one, so receipts stay honest." },
]

const FAQ = [
  { q: "Is this just Stripe?", a: "Money movement and card handling are Stripe's, and we're explicit about it. What's ours is the layer you'd otherwise build: the API, the idempotency, the webhook delivery and retries, the dashboard, and the no-code checkout path. You never log into a Stripe dashboard to use it." },
  { q: "Why is it easier than Stripe?", a: "Fewer decisions. One key, one base URL, ten event types, a fee that's a flat percentage. There's no dashboard to configure, no product/pricing objects to reconcile, and no decision about which of 200 webhooks you need." },
  { q: "What does it cost?", a: `${feeDescription()} of each successful payment, on top of Stripe's standard processing. No monthly fee, no setup cost, no minimum. A refund returns the fee on the refunded amount.` },
  { q: "Who can use it?", a: "Any AXXES account with a workspace. It's already wired into members.axxes.club, so there's no separate sign-up — your existing account and team roles carry over." },
  { q: "When do I actually get paid?", a: "On Stripe's rolling schedule once your payout account is verified — usually two business days in the US. Your dashboard shows the available balance, the pending balance and the next payout date, read live from Stripe." },
]

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-32 h-64 bg-[radial-gradient(ellipse_at_top,var(--accent)_0%,transparent_65%)] opacity-[0.07]" />

        <div className="relative mx-auto grid max-w-6xl gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:pt-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
              <span className="size-1.5 rounded-full bg-accent" />
              {feeDescription()} per payment · no monthly fee
            </p>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Take payments
              <br />
              <span className="text-muted">without the project.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              A payment gateway for AXXES businesses. Hosted checkout, a real API, signed webhooks and payouts to your bank — without
              setting up a Stripe account or writing a client library.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/dashboard" className="btn-primary px-5 py-3 text-base">
                Start taking payments
              </Link>
              <Link href="/docs" className="btn-ghost px-5 py-3 text-base">
                Read the docs
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">
              Or skip the code entirely — <Link href="/dashboard/links" className="text-accent hover:underline">make a payment link</Link> and
              share it.
            </p>
          </div>

          {/* The actual product: a real request and a real response. */}
          <div className="card overflow-hidden shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="ml-2 font-mono text-[11px] text-muted">your-app / checkout</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-muted">
              {API_CALL}
            </pre>
            <div className="flex items-center justify-between border-t border-line bg-panel-2/50 px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Then, on your server</span>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent ring-1 ring-accent/25">
                payment.succeeded
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* What it replaces */}
      <section className="border-b border-line bg-panel/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">The honest version</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            What you would otherwise build yourself.
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            A production payments integration is a few weeks of work and a permanent maintenance burden. This is the finished version.
          </p>

          <div className="mt-10 overflow-hidden rounded-2xl border border-line">
            <div className="grid grid-cols-2 border-b border-line bg-panel-2/50">
              <p className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Rolling it yourself</p>
              <p className="border-l border-line px-5 py-3 font-mono text-[11px] uppercase tracking-[0.15em] text-accent">With Tollbooth</p>
            </div>
            {COMPARISON.map((row) => (
              <div key={row.them} className="grid grid-cols-2 border-b border-line/60 last:border-0">
                <p className="px-5 py-4 text-sm text-muted">{row.them}</p>
                <p className="border-l border-line px-5 py-4 text-sm">{row.us}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Details */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">Details worth knowing</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">The unglamorous parts, done properly.</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {PROMISES.map((item) => (
            <div key={item.title} className="bg-panel p-6">
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Getting started */}
      <section className="border-t border-line bg-panel/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">Getting started</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Three steps, most of them clicking.</h2>

          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { n: "01", title: "Connect payouts", body: "One click hands you to Stripe's onboarding. Most people finish in five minutes; we keep the status in sync for you.", meta: "Dashboard → Payouts" },
              { n: "02", title: "Add a price or a link", body: "Make a product with a price, then sell it from your app with one request — or make a payment link and skip the code entirely.", meta: "Products · Payment links" },
              { n: "03", title: "Go live", body: "Create a live key, point a webhook at your app, and take money. Or keep using the test key until you're completely sure.", meta: "Developers · Webhooks" },
            ].map((step) => (
              <li key={step.n} className="card flex flex-col p-6">
                <span className="font-mono text-sm text-accent">{step.n}</span>
                <h3 className="mt-4 text-lg font-medium">{step.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{step.body}</p>
                <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.15em] text-muted/70">{step.meta}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Webhooks */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">Webhooks</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">You find out immediately.</h2>
            <p className="mt-4 text-muted">
              We POST every event to your server the moment it happens, signed so you can prove it came from us. Failed deliveries are
              retried with backoff, and every attempt is logged with its response code — so &ldquo;it didn&apos;t arrive&rdquo; is always
              answerable.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm">
              {["HMAC-signed, with the timestamp inside the signature", "Ten event types — no guessing which to subscribe to", "Six attempts over 24 hours, then marked failed", "Replay any delivery by hand from the dashboard"].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="text-accent">✓</span>
                  <span className="text-muted">{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/docs#webhooks" className="btn-ghost mt-8">
              See the event reference
            </Link>
          </div>
          <pre className="card overflow-x-auto p-5 font-mono text-[12px] leading-relaxed text-muted">{WEBHOOK}</pre>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-line bg-panel/30">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Questions people actually ask</h2>
          <dl className="mt-8 divide-y divide-line">
            {FAQ.map((item) => (
              <div key={item.q} className="py-5">
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="card p-10 sm:p-14">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {feeDescription()} per payment. Nothing if you don't sell anything.
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            No setup fee, no monthly minimum, no contract. Create a test key and have a working checkout in the next ten minutes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn-primary px-5 py-3 text-base">
              Get started
            </Link>
            <Link href="/pricing" className="btn-ghost px-5 py-3 text-base">
              Pricing detail
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
