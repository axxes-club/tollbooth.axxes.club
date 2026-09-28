import Link from "next/link"

export const metadata = { title: "API docs", description: "Tollbooth API reference: checkout sessions, payments, refunds and webhooks." }

const SECTIONS = [
  { id: "authentication", label: "Authentication" },
  { id: "checkout", label: "Create a checkout" },
  { id: "payments", label: "Payments" },
  { id: "refunds", label: "Refunds" },
  { id: "statuses", label: "Payment statuses" },
  { id: "errors", label: "Errors" },
  { id: "idempotency", label: "Idempotency" },
]

function Code({ children }: { children: string }) {
  return <pre className="card mt-4 overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-muted">{children}</pre>
}

function Param({ name, type, required, children }: { name: string; type: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line/60 py-3 sm:grid-cols-[220px_1fr]">
      <p className="font-mono text-sm">
        {name} <span className="text-xs text-muted">{type}</span>
        {required && <span className="ml-2 text-[11px] uppercase tracking-wider text-accent">required</span>}
      </p>
      <p className="text-sm text-muted">{children}</p>
    </div>
  )
}

export default function DocsPage() {
  return (
    <main className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[200px_1fr]">
      <nav className="lg:sticky lg:top-24 lg:self-start" aria-label="Sections">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">API reference</p>
        <ul className="mt-4 space-y-1 text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id}><a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-muted hover:bg-panel hover:text-text">{s.label}</a></li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0 max-w-3xl space-y-16">
        <header>
          <h1 className="text-4xl font-semibold tracking-tight">Tollbooth API</h1>
          <p className="mt-4 text-lg text-muted">
            A small REST API over HTTPS with JSON bodies. Base URL: <code className="font-mono text-text">https://tollbooth.axxes.club/api/v1</code>
          </p>
        </header>

        <section id="authentication" className="scroll-mt-24">
          <h2 className="text-2xl font-semibold tracking-tight">Authentication</h2>
          <p className="mt-3 text-muted">
            Create an API key in <Link href="/dashboard/developers" className="text-accent hover:underline">Dashboard → Developers</Link>. Keys
            belong to one workspace, start with <code className="font-mono text-text">tb_live_</code> and are shown once. Send them as a bearer token,
            from your server only.
          </p>
          <Code>{`Authorization: Bearer tb_live_…`}</Code>
        </section>

        <section id="checkout" className="scroll-mt-24">
          <h2 className="text-2xl font-semibold tracking-tight">Create a checkout</h2>
          <p className="mt-3 text-muted">
            <code className="font-mono text-text">POST /checkout-sessions</code> creates a payment and a hosted Stripe Checkout page. Redirect your
            customer to <code className="font-mono text-text">checkout_url</code>; they return to your <code className="font-mono text-text">success_url</code> when they&apos;ve paid.
            Your workspace must have finished payout setup.
          </p>
          <div className="mt-6">
            <Param name="amount" type="integer" required>Amount in minor units (cents). Minimum 50.</Param>
            <Param name="currency" type="string">usd (default), eur, gbp, cad, aud or mxn.</Param>
            <Param name="description" type="string" required>Shown to the customer at checkout, e.g. &ldquo;VIP ticket — Friday&rdquo;.</Param>
            <Param name="success_url" type="https URL" required>Where the customer lands after paying.</Param>
            <Param name="cancel_url" type="https URL" required>Where the customer lands if they back out.</Param>
            <Param name="customer_email" type="string">Prefills checkout and appears on the payment.</Param>
            <Param name="reference" type="string">Your own order or invoice id, for reconciliation.</Param>
            <Param name="metadata" type="object">Up to 20 string key/value pairs, echoed back on the payment.</Param>
          </div>
          <Code>{`curl https://tollbooth.axxes.club/api/v1/checkout-sessions \\
  -H "Authorization: Bearer $TOLLBOOTH_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order_1234" \\
  -d '{"amount": 2500, "currency": "usd", "description": "VIP ticket",
       "reference": "order_1234",
       "success_url": "https://your.app/thanks", "cancel_url": "https://your.app/cart"}'`}</Code>
          <Code>{`201 Created
{
  "object": "payment",
  "id": "9b2c…",
  "status": "pending",
  "amount": 2500,
  "currency": "usd",
  "amount_refunded": 0,
  "application_fee": 25,
  "description": "VIP ticket",
  "customer_email": null,
  "reference": "order_1234",
  "metadata": {},
  "checkout_url": "https://checkout.stripe.com/c/pay/…",
  "created": 1790000000
}`}</Code>
        </section>

        <section id="payments" className="scroll-mt-24">
          <h2 className="text-2xl font-semibold tracking-tight">Payments</h2>
          <p className="mt-3 text-muted">
            <code className="font-mono text-text">GET /payments/:id</code> returns one payment. <code className="font-mono text-text">GET /payments</code> lists
            them newest first; page with <code className="font-mono text-text">limit</code> (1–100) and{" "}
            <code className="font-mono text-text">starting_after</code> (a payment id).
          </p>
          <Code>{`{ "object": "list", "data": [ { "object": "payment", … } ], "has_more": false }`}</Code>
        </section>

        <section id="refunds" className="scroll-mt-24">
          <h2 className="text-2xl font-semibold tracking-tight">Refunds</h2>
          <p className="mt-3 text-muted">
            <code className="font-mono text-text">POST /refunds</code> with <code className="font-mono text-text">payment_id</code> refunds the rest of a payment,
            or pass <code className="font-mono text-text">amount</code> for a partial refund. Tollbooth&apos;s fee on the refunded amount is returned too.
          </p>
          <Code>{`curl https://tollbooth.axxes.club/api/v1/refunds \\
  -H "Authorization: Bearer $TOLLBOOTH_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"payment_id": "9b2c…", "amount": 1000}'`}</Code>
        </section>

        <section id="statuses" className="scroll-mt-24">
          <h2 className="text-2xl font-semibold tracking-tight">Payment statuses</h2>
          <div className="mt-4">
            <Param name="pending" type="">Checkout created; the customer hasn&apos;t paid yet.</Param>
            <Param name="succeeded" type="">Paid. Money is on its way to your payout account.</Param>
            <Param name="partially_refunded" type="">Some of the amount was refunded.</Param>
            <Param name="refunded" type="">Fully refunded.</Param>
            <Param name="expired" type="">The checkout page expired unpaid (after 24 hours).</Param>
            <Param name="failed" type="">The payment couldn&apos;t be completed.</Param>
          </div>
        </section>

        <section id="errors" className="scroll-mt-24">
          <h2 className="text-2xl font-semibold tracking-tight">Errors</h2>
          <p className="mt-3 text-muted">Errors use standard HTTP status codes and a consistent body.</p>
          <Code>{`409 Conflict
{ "error": { "type": "account_not_ready", "message": "This workspace hasn't finished payout setup in Tollbooth yet" } }`}</Code>
          <div className="mt-4">
            <Param name="400" type="invalid_request_error">Something in the request is missing or malformed.</Param>
            <Param name="401" type="authentication_error">Missing, invalid or revoked API key.</Param>
            <Param name="404" type="resource_missing">No such payment in this workspace.</Param>
            <Param name="409" type="account_not_ready">Finish payout setup before taking payments.</Param>
            <Param name="502" type="api_error">Stripe returned an error; the message says why.</Param>
          </div>
        </section>

        <section id="idempotency" className="scroll-mt-24">
          <h2 className="text-2xl font-semibold tracking-tight">Idempotency</h2>
          <p className="mt-3 text-muted">
            Send an <code className="font-mono text-text">Idempotency-Key</code> header (your order id works well) on create and refund requests. If a
            network error makes you retry, Stripe won&apos;t create a second checkout or refund.
          </p>
        </section>
      </article>
    </main>
  )
}
