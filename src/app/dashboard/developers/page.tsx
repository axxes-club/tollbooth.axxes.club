import Link from "next/link"
import { requireContext } from "@/lib/context"
import { PageHeader, Notice, Code, Stat } from "@/components/ui"
import { getApiKeys } from "../queries"
import { ApiKeys } from "./api-keys"

const siteUrl = process.env.TOLLBOOTH_SITE_URL ?? "https://tollbooth.axxes.club"

const CURL = `curl ${siteUrl}/api/v1/checkout-sessions \\
  -H "Authorization: Bearer $TOLLBOOTH_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order_1234" \\
  -d '{
    "price": "vip_ticket",
    "customer_email": "buyer@example.com",
    "reference": "order_1234",
    "success_url": "https://yoursite.com/thanks"
  }'`

const NODE = `import { Tollbooth } from "@tollbooth/sdk"

const tollbooth = new Tollbooth({ apiKey: process.env.TOLLBOOTH_KEY! })

const payment = await tollbooth.checkout.create({
  price: "vip_ticket",
  customer_email: "buyer@example.com",
  reference: "order_1234",
  success_url: "https://yoursite.com/thanks",
})

// Send the buyer here. They pay on a hosted page.
return Response.redirect(payment.checkout_url!, 303)`

/** The whole integration, start to finish: one request in, one webhook out. */
export default async function DevelopersPage() {
  const ctx = await requireContext()
  const canManage = ["owner", "admin"].includes(ctx.role)
  const keys = await getApiKeys(ctx.tenant.id)
  const active = keys.filter((k) => !k.revokedAt)

  return (
    <>
      <PageHeader
        title="Developers"
        description="API keys and a working integration you can paste in as-is."
        action={
          <Link href="/docs" className="btn-ghost">
            Full API reference
          </Link>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Active keys" value={active.length} hint={`${active.filter((k) => k.mode === "test").length} test, ${active.filter((k) => k.mode === "live").length} live`} />
        <Stat label="Webhook endpoints" value="—" hint={<Link href="/dashboard/webhooks" className="text-accent hover:underline">Configure →</Link>} />
        <Stat label="API version" value="v1" hint="Stable" />
      </div>

      <div className="mb-8">
        <Notice tone="info" title="Start in test mode">
          Create a <span className="font-medium">test</span> key first. It behaves exactly like a live key but can only move money inside
          our test environment, so you can build the whole flow without touching real money. Swap in a live key when you&apos;re ready.
        </Notice>
      </div>

      <ApiKeys
        canManage={canManage}
        keys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          mode: k.mode,
          scopes: k.scopes,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revoked: !!k.revokedAt,
        }))}
      />

      <h2 className="mb-3 mt-10 text-sm font-medium text-muted">Make your first charge</h2>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm text-muted">
            One request creates the payment and returns a hosted checkout URL. Send the buyer there and you&apos;re done — the page
            handles cards, wallets and receipts.
          </p>
          <Code copyable>{CURL}</Code>
        </div>

        <div>
          <p className="mb-2 text-sm text-muted">Or with the SDK, which handles retries and idempotency for you:</p>
          <Code copyable>{NODE}</Code>
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-medium text-muted">Then get told when it works</h2>
      <p className="mb-3 text-sm text-muted">
        Don&apos;t poll for success. Point a webhook at your server and we&apos;ll tell you —{" "}
        <Link href="/dashboard/webhooks" className="text-accent hover:underline">
          set one up here
        </Link>
        .
      </p>
      <Code copyable>{`{
  "id": "evt_a1b2c3",
  "type": "payment.succeeded",
  "created": 1735689600,
  "mode": "live",
  "data": {
    "object": {
      "id": "9b2c1d4e-...",
      "status": "succeeded",
      "amount": 2500,
      "currency": "usd",
      "reference": "order_1234",
      "metadata": { "order_id": "1234" }
    }
  }
}`}</Code>
    </>
  )
}
