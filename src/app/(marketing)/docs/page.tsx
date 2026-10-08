import Link from "next/link"
import { Code } from "@/components/ui"

export const metadata = {
  title: "API reference",
  description: "Tollbooth REST API: checkout sessions, payments, refunds, customers, prices, payment links, webhooks and balances.",
}

const SECTIONS = [
  { id: "quickstart", label: "Quickstart" },
  { id: "authentication", label: "Authentication" },
  { id: "sdk", label: "SDK" },
  { id: "checkout", label: "Create a checkout" },
  { id: "prices", label: "Products & prices" },
  { id: "payments", label: "Payments" },
  { id: "refunds", label: "Refunds" },
  { id: "customers", label: "Customers" },
  { id: "links", label: "Payment links" },
  { id: "webhooks", label: "Webhooks" },
  { id: "errors", label: "Errors" },
  { id: "idempotency", label: "Idempotency & retries" },
  { id: "pagination", label: "Pagination" },
  { id: "limits", label: "Rate limits" },
]

const BASE = "https://tollbooth.axxes.club/api/v1"

function Param({ name, type, required, children }: { name: string; type: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line/60 py-3 sm:grid-cols-[240px_1fr]">
      <p className="font-mono text-[13px]">
        {name} <span className="text-xs text-muted">{type}</span>
        {required && <span className="ml-2 font-sans text-[10px] uppercase tracking-wider text-accent">required</span>}
      </p>
      <p className="text-sm text-muted">{children}</p>
    </div>
  )
}

function Endpoint({ method, path, children }: { method: string; path: string; children?: React.ReactNode }) {
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ${
            method === "GET" ? "bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/25" : "bg-accent/10 text-accent ring-1 ring-accent/25"
          }`}
        >
          {method}
        </span>
        <code className="font-mono text-[13px]">{path}</code>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

const QUICKSTART = `// 1. Create a checkout
const payment = await fetch("${BASE}/checkout-sessions", {
  method: "POST",
  headers: {
    authorization: \`Bearer \${process.env.TOLLBOOTH_KEY}\`,
    "content-type": "application/json",
    "idempotency-key": order.id,   // your order id; a retry can't double-charge
  },
  body: JSON.stringify({
    price: "vip_ticket",
    customer_email: "buyer@example.com",
    reference: order.id,
    success_url: "https://yoursite.com/thanks",
  }),
}).then((r) => r.json())

// 2. Send the buyer to the hosted page
return Response.redirect(payment.checkout_url, 303)

// 3. In your webhook handler, when payment.succeeded arrives:
//    mark order.id as paid, then return 200`

const SIGNATURE_CHECK = `import { verifySignature } from "@tollbooth/sdk"

export async function POST(request) {
  // Verify against the RAW body, before any JSON parsing.
  const payload = await request.text()
  const signature = request.headers.get("tollbooth-signature")

  const valid = await verifySignature({
    payload,
    header: signature,
    secret: process.env.TOLLBOOTH_WEBHOOK_SECRET,
  })
  if (!valid) return new Response("invalid signature", { status: 400 })

  const event = JSON.parse(payload)
  if (event.type === "payment.succeeded") {
    await markPaid(event.data.object.metadata.order_id)
  }
  return new Response("ok", { status: 200 })  // 2xx = we won't retry
}`

export default function DocsPage() {
  return (
    <main className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[210px_1fr]">
      <nav className="lg:sticky lg:top-24 lg:self-start" aria-label="Sections">
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Reference</p>
        <ul className="mt-4 space-y-0.5 text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-muted transition hover:bg-panel hover:text-text">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0 max-w-3xl">
        <header className="border-b border-line pb-8">
          <h1 className="text-4xl font-semibold tracking-tight">API reference</h1>
          <p className="mt-4 text-lg text-muted">
            A small REST API over HTTPS with JSON bodies. Base URL: <code className="font-mono text-text">{BASE}</code>
          </p>
          <p className="mt-4 text-sm text-muted">
            Everything returns JSON. Money is always an integer in minor units — <code className="font-mono">2500</code> is $25.00 —
            alongside a currency code.
          </p>
        </header>

        <section id="quickstart" className="scroll-mt-24 pt-10">
          <h2 className="text-2xl font-semibold tracking-tight">Quickstart</h2>
          <p className="mt-3 text-muted">
            A complete integration: one request to start a payment, one webhook to hear it succeed. Create a test key in{" "}
            <Link href="/dashboard/developers" className="text-accent hover:underline">
              Dashboard → Developers
            </Link>{" "}
            first — it behaves exactly like a live key but can't move real money.
          </p>
          <Code copyable>{QUICKSTART}</Code>
          <p className="mt-4 text-sm text-muted">
            That is the whole thing. If you'd rather not write any of it, make a{" "}
            <Link href="/dashboard/links" className="text-accent hover:underline">
              payment link
            </Link>{" "}
            and share the URL.
          </p>
        </section>

        <section id="authentication" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Authentication</h2>
          <p className="mt-3 text-muted">
            Send your key as a bearer token, from your server only. Keys are shown once and only a hash is stored. The prefix tells you
            which mode a key belongs to, and a test key can never authenticate a live request.
          </p>
          <Code copyable>{`Authorization: Bearer tb_live_…   # real money
Authorization: Bearer tb_test_…   # test money only`}</Code>
          <p className="mt-4 text-sm text-muted">
            Keys carry scopes. <code className="font-mono">payments:read</code>,{" "}
            <code className="font-mono">payments:write</code>, <code className="font-mono">refunds:write</code>,{" "}
            <code className="font-mono">catalog:write</code> and <code className="font-mono">webhooks:write</code>. A key missing the
            required scope gets a <code className="font-mono">403 insufficient_scope</code>.
          </p>
        </section>

        <section id="sdk" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">SDK</h2>
          <p className="mt-3 text-muted">
            Optional, zero-dependency, and the only thing it adds over <code className="font-mono">fetch</code> is an idempotency key on
            every write and retries limited to what's actually safe to retry.
          </p>
          <Code copyable>{`npm install @tollbooth/sdk
# or straight from this site, always the same version the docs describe
import { Tollbooth } from "https://tollbooth.axxes.club/sdk/tollbooth.js"

const tollbooth = new Tollbooth({ apiKey: process.env.TOLLBOOTH_KEY! })

const payment = await tollbooth.checkout.create({ price: "vip_ticket" })
await tollbooth.refunds.create({ payment_id: payment.id, amount: 1000 })
const balance = await tollbooth.balance()   // { available, pending, next_payout_at }`}</Code>
        </section>

        <section id="checkout" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Create a checkout</h2>
          <p className="mt-3 text-muted">
            Creates a payment and a hosted Stripe Checkout page. Redirect your customer to{" "}
            <code className="font-mono text-text">checkout_url</code>; they return to your{" "}
            <code className="font-mono text-text">success_url</code> when they've paid. The workspace must have finished payout setup,
            or this returns <code className="font-mono">409 account_not_ready</code>.
          </p>
          <Endpoint method="POST" path="/checkout-sessions">
            <div>
              <Param name="price" type="string">
                A price <code className="font-mono">id</code> or <code className="font-mono">lookup_key</code>. Preferred — the amount
                stays on the server, so a client can't choose what it pays.
              </Param>
              <Param name="amount" type="integer" required={false}>
                Minor units, minimum 50. Required only when <code className="font-mono">price</code> is omitted.
              </Param>
              <Param name="currency" type="string">Defaults to <code className="font-mono">usd</code>.</Param>
              <Param name="description" type="string">
                What this payment is for. Required when <code className="font-mono">price</code> is omitted.
              </Param>
              <Param name="quantity" type="integer">Defaults to 1. Maximum 99.</Param>
              <Param name="customer" type="string">A customer id from this workspace.</Param>
              <Param name="customer_email" type="string">Creates the customer if it doesn't exist yet.</Param>
              <Param name="reference" type="string">Your own order or invoice id. Up to 200 characters.</Param>
              <Param name="metadata" type="object">Up to 20 keys. Strings, keys ≤ 40 chars, values ≤ 500.</Param>
              <Param name="success_url" type="string">https only. We append <code className="font-mono">tollbooth_payment_id</code>.</Param>
              <Param name="cancel_url" type="string">https only.</Param>
            </div>
          </Endpoint>
          <Code copyable>{`POST ${BASE}/checkout-sessions
{
  "price": "vip_ticket",
  "customer_email": "buyer@example.com",
  "reference": "order_1234",
  "success_url": "https://yoursite.com/thanks"
}

201 Created
{
  "object": "payment",
  "id": "9b2c1d4e-…",
  "mode": "live",
  "status": "pending",
  "amount": 2500,
  "amount_refunded": 0,
  "currency": "usd",
  "application_fee": 25,
  "net_fee": 25,
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_…",
  "expires_at": 1735776000
}`}</Code>
        </section>

        <section id="prices" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Products &amp; prices</h2>
          <p className="mt-3 text-muted">
            A product is what you sell; a price is how much for it. Amounts on a price are <strong>immutable</strong> — changing one
            would silently rewrite what past receipts claim they were. To change a price, archive it and create another.
          </p>
          <Endpoint method="POST" path="/products">
            <div>
              <Param name="name" type="string" required>Shown to buyers.</Param>
              <Param name="description" type="string">Optional. Shown on the checkout page.</Param>
            </div>
          </Endpoint>
          <Endpoint method="POST" path="/prices">
            <div>
              <Param name="amount" type="integer" required>Minor units, minimum 50.</Param>
              <Param name="currency" type="string">Defaults to <code className="font-mono">usd</code>.</Param>
              <Param name="product" type="string">The product this price belongs to.</Param>
              <Param name="nickname" type="string">Short label, e.g. &ldquo;early bird&rdquo;.</Param>
              <Param name="lookup_key" type="string">
                A stable handle your app can hardcode, like <code className="font-mono">vip_ticket</code>. Must be unique in the
                workspace.
              </Param>
            </div>
          </Endpoint>
          <Code copyable>{`# Now the app doesn't hardcode an amount anywhere
await tollbooth.checkout.create({ price: "vip_ticket" })`}</Code>
        </section>

        <section id="payments" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Payments</h2>
          <Endpoint method="GET" path="/payments/:id">
            <p className="text-sm text-muted">One payment, scoped to your workspace. A payment id from another workspace is a 404, not a 403.</p>
          </Endpoint>
          <Endpoint method="GET" path="/payments">
            <div>
              <Param name="status" type="string">One status, or several comma-separated to match any of them.</Param>
              <Param name="customer" type="string">Filter by customer id.</Param>
              <Param name="reference" type="string">Filter by your own order id.</Param>
              <Param name="mode" type="string">`live` or `test`.</Param>
              <Param name="created[gte]" type="string">Unix timestamp or ISO date.</Param>
              <Param name="created[lte]" type="string">Unix timestamp or ISO date.</Param>
            </div>
          </Endpoint>
          <h3 className="mt-8 text-lg font-medium">Statuses</h3>
          <div className="mt-3">
            {[
              ["pending", "Checkout created; the customer hasn't paid yet."],
              ["succeeded", "Paid. The money is on its way to your payout account."],
              ["partially_refunded", "Some of the amount was returned."],
              ["refunded", "Returned in full."],
              ["expired", "The checkout page expired unpaid, after 24 hours."],
              ["failed", "The payment couldn't be completed."],
              ["disputed", "The cardholder disputed it. Respond before Stripe's deadline."],
            ].map(([status, meaning]) => (
              <Param key={status} name={status!} type="">{meaning}</Param>
            ))}
          </div>
        </section>

        <section id="refunds" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Refunds</h2>
          <p className="mt-3 text-muted">
            Refunds a payment in full by default, or <code className="font-mono text-text">amount</code> for a partial one. The share of
            Tollbooth's fee that covered the refunded money is returned to you automatically. Stripe keeps its own processing fee
            on a refunded payment, as it does on any Stripe account.
          </p>
          <Endpoint method="POST" path="/refunds">
            <div>
              <Param name="payment_id" type="string" required>The payment to refund.</Param>
              <Param name="amount" type="integer">Minor units. Omit to refund the remainder.</Param>
              <Param name="reason" type="string">`duplicate`, `fraudulent` or `requested_by_customer`. Recorded on the refund.</Param>
              <Param name="note" type="string">Up to 500 characters, for your own records.</Param>
            </div>
          </Endpoint>
          <Endpoint method="GET" path="/refunds">
            <p className="text-sm text-muted">Every refund in the workspace, newest first. Filter with <code className="font-mono">payment_id</code>.</p>
          </Endpoint>
          <Code copyable>{`curl ${BASE}/refunds \\
  -H "Authorization: Bearer $TOLLBOOTH_KEY" \\
  -H "Idempotency-Key: refund_order_1234" \\
  -d '{"payment_id": "9b2c…", "amount": 1000, "reason": "requested_by_customer"}'

{
  "object": "refund",
  "id": "f1a2…",
  "payment": "9b2c…",
  "amount": 1000,
  "currency": "usd",
  "fee_returned": 10,
  "status": "succeeded"
}`}</Code>
        </section>

        <section id="customers" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Customers</h2>
          <p className="mt-3 text-muted">
            A customer is created automatically the first time an email is seen, so you rarely need to call this. It exists so you can
            see who has paid before and charge them again without re-typing their details.
          </p>
          <Endpoint method="POST" path="/customers">
            <div>
              <Param name="email" type="string" required>The buyer's email. Used for the receipt.</Param>
              <Param name="name" type="string">Optional display name.</Param>
              <Param name="phone" type="string">Optional phone number.</Param>
            </div>
          </Endpoint>
          <Endpoint method="GET" path="/customers">
            <p className="text-sm text-muted">Search with <code className="font-mono">?q=</code> or <code className="font-mono">?email=</code>.</p>
          </Endpoint>
        </section>

        <section id="links" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Payment links</h2>
          <p className="mt-3 text-muted">
            A link is a hosted page that sells a price, at <code className="font-mono text-text">/pay/&lt;slug&gt;</code>. Send it to
            anyone — no code, no integration, no deploy. Payments made through it are ordinary payments: they appear in the API, fire your
            webhooks and show up in your dashboard. This is the right path for anyone who isn't writing software.
          </p>
          <Endpoint method="POST" path="/links">
            <div>
              <Param name="price" type="string" required>A price id or lookup key.</Param>
              <Param name="name" type="string">Defaults to the product name.</Param>
              <Param name="slug" type="string">Custom URL segment. Generated if omitted.</Param>
              <Param name="success_url" type="string">https only. Where the buyer lands after paying.</Param>
              <Param name="allow_quantity" type="boolean">
                Show a quantity stepper on the page.
              </Param>
            </div>
          </Endpoint>
          <Code copyable>{`const link = await tollbooth.links.create({ price: "vip_ticket", slug: "friday" })
// → "https://tollbooth.axxes.club/pay/friday"`}</Code>
        </section>

        <section id="webhooks" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Webhooks</h2>
          <p className="mt-3 text-muted">
            Every state change is POSTed to your endpoint, signed. Ten event types, no more:{" "}
            {[
              "payment.created", "payment.succeeded", "payment.failed", "payment.expired", "payment.refunded",
              "payment.disputed", "refund.created", "customer.created", "payout.paid", "payout.failed",
            ].map((e) => (
              <code key={e} className="mr-1.5 inline-block font-mono text-xs text-accent">{e}</code>
            ))}
          </p>

          <h3 className="mt-8 text-lg font-medium">Verifying the signature</h3>
          <p className="mt-2 text-sm text-muted">
            The <code className="font-mono">Tollbooth-Signature</code> header is <code className="font-mono">t=&lt;unix&gt;,v1=&lt;hex&gt;</code>,
            where the HMAC covers the timestamp <em>and</em> the raw body. Binding the timestamp in is what stops a captured delivery being
            replayed later. Verify before you parse.
          </p>
          <Code copyable>{SIGNATURE_CHECK}</Code>

          <h3 className="mt-8 text-lg font-medium">Delivery behaviour</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {[
              "Return any 2xx to acknowledge. Anything else is a failure.",
              "Failures retry with backoff over roughly 24 hours, up to 6 attempts.",
              "An endpoint that exhausts its retries is disabled rather than left hammering a dead URL.",
              "Every attempt is logged with its response code, and can be replayed by hand from the dashboard.",
            ].map((item) => (
              <li key={item} className="flex gap-3"><span className="text-accent">✓</span>{item}</li>
            ))}
          </ul>

          <h3 className="mt-8 text-lg font-medium">Managing endpoints</h3>
          <Endpoint method="POST" path="/webhook-endpoints">
            <div>
              <Param name="url" type="string" required>https only.</Param>
              <Param name="events" type="array">Event names, or <code className="font-mono">["*"]</code> for all.</Param>
            </div>
            <p className="mt-3 text-sm text-muted">
              The response includes <code className="font-mono">secret</code>, shown only here. Store it — without it you can't tell a
              real event from a forged one. <code className="font-mono">POST /webhook-endpoints/:id</code> rotates it.
            </p>
          </Endpoint>
          <Endpoint method="GET" path="/webhook-endpoints/:id/deliveries">
            <p className="text-sm text-muted">The delivery log: status, attempt count, response code and error text.</p>
          </Endpoint>
        </section>

        <section id="errors" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Errors</h2>
          <p className="mt-3 text-muted">
            Errors use standard HTTP status codes and one consistent body. The <code className="font-mono">request_id</code> is also
            returned as an <code className="font-mono">x-request-id</code> header — quote it and we can find the exact request.
          </p>
          <Code copyable>{`409 Conflict
{
  "error": {
    "type": "account_not_ready",
    "message": "This workspace hasn't finished payout setup yet",
    "request_id": "req_9f2a1c8e4b7d0356"
  }
}`}</Code>
          <div className="mt-6">
            {([
              ["400", "invalid_request_error", "Something is missing or malformed. The message names the field."],
              ["401", "authentication_error", "Missing, invalid or revoked key."],
              ["403", "insufficient_scope", "The key doesn't have the scope this endpoint needs."],
              ["404", "resource_missing", "No such object in this workspace."],
              ["409", "account_not_ready", "Finish payout setup before taking payments."],
              ["409", "lookup_key_taken", "That lookup key is already in use."],
              ["409", "idempotent_request_in_progress", "An identical request with the same key is still running. Retry shortly; the `retry-after` header says how long."],
              ["409", "refund_conflict", "The payment changed while the refund was being prepared. Fetch it again and refund what's actually left."],
              ["429", "rate_limit_exceeded", "Slow down. Includes a `retry-after` header."],
              ["502", "api_error", "Our payment provider rejected or couldn't complete the request."],
            ] as const).map(([status, type, meaning]) => (
              <Param key={status} name={`${status} ${type}`} type="">{meaning}</Param>
            ))}
          </div>
        </section>

        <section id="idempotency" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Idempotency &amp; retries</h2>
          <p className="mt-3 text-muted">
            Send an <code className="font-mono text-text">Idempotency-Key</code> on any write. Your order id is the obvious choice. If a
            network error makes you retry, the first response comes back with <code className="font-mono">idempotent-replay: true</code>
            instead of creating a second charge.
          </p>
          <p className="mt-3 text-muted">
            Reusing a key with a <em>different</em> body is rejected with a <code className="font-mono">400</code> rather than silently
            replayed — that's a confused retry loop, and you'd rather hear about it than be charged twice. Keys are held for an
            hour.
          </p>
          <p className="mt-3 text-sm text-muted">
            If two identical requests arrive at the same moment, the second waits for the first to finish and returns its response
            rather than charging again — the race is exactly what this header exists for. It only gives up with a{" "}
            <code className="font-mono text-text">409</code> if the first is still running after five seconds.
          </p>
        </section>

        <section id="pagination" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Pagination</h2>
          <p className="mt-3 text-muted">
            List endpoints return <code className="font-mono text-text">limit</code> (1–100, default 20) and accept{" "}
            <code className="font-mono text-text">starting_after</code> — the id of the last row you saw. Paging is by cursor rather
            than offset, so new payments arriving mid-scroll can't make you skip or repeat a row.
          </p>
          <Code copyable>{`{ "object": "list", "data": [ … ], "has_more": true }`}</Code>
        </section>

        <section id="limits" className="scroll-mt-24 pt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Rate limits</h2>
          <p className="mt-3 text-muted">
            300 reads and 120 writes per minute per key. Every response carries{" "}
            <code className="font-mono text-text">x-ratelimit-limit</code> and{" "}
            <code className="font-mono text-text">x-ratelimit-remaining</code>. Over the limit you get a{" "}
            <code className="font-mono text-text">429</code> with <code className="font-mono text-text">retry-after</code> in seconds.
          </p>
          <p className="mt-3 text-sm text-muted">
            Need more? That's a conversation with a human — <a href="mailto:hello@axxes.club" className="text-accent hover:underline">hello@axxes.club</a>.
          </p>
        </section>

        <footer className="mt-16 border-t border-line pt-8 text-sm text-muted">
          Need something not covered here? <a href="mailto:hello@axxes.club" className="text-accent hover:underline">Ask us</a> — the API
          is small on purpose, and it's easier to add what you need than to guess.
        </footer>
      </article>
    </main>
  )
}
