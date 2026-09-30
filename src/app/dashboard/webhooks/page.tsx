import { requireContext } from "@/lib/context"
import { PageHeader, Empty, Notice, StatusBadge, Code } from "@/components/ui"
import { EndpointForm, EndpointRow } from "./endpoint-forms"
import { WEBHOOK_EVENTS } from "@/lib/webhooks"
import { getEndpoints } from "../queries"

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

/**
 * Webhooks: how the merchant's app finds out what happened.
 *
 * Every delivery is signed with the endpoint's secret, retried with backoff, and
 * logged here with its response code — so "it didn't arrive" is always answerable.
 */
export default async function WebhooksPage() {
  const ctx = await requireContext()
  const canManage = ["owner", "admin"].includes(ctx.role)
  const endpoints = await getEndpoints(ctx.tenant.id)

  const sample = `import { verifySignature } from "@tollbooth/sdk"

const payload = await request.text()
const verified = await verifySignature({
  payload,
  header: request.headers.get("tollbooth-signature") ?? "",
  secret: process.env.TOLLBOOTH_WEBHOOK_SECRET ?? "",
})
if (!verified) return new Response("Invalid signature", { status: 401 })

const event = JSON.parse(payload)
if (!event.test && event.mode === "live" && event.type === "payment.succeeded") {
  // Your fulfillment function must persist event.id to ignore repeat deliveries.
  await fulfillOrder(event.data.object.reference, event.id)
}
return new Response(null, { status: 204 })`

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Tollbooth posts an event to your server whenever a payment changes. Signed, retried, and logged."
      />

      <div className="mb-6">
        <Notice tone="info" title="Verify the signature, every time">
          Each request carries a <code className="font-mono text-xs">Tollbooth-Signature</code> header. Check it before trusting the
          body — it&apos;s an HMAC over the raw payload plus a timestamp, which is what stops someone replaying a captured payment event
          to you later. The secret is shown once, when you create or rotate the endpoint.
        </Notice>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {endpoints.length === 0 ? (
            <Empty
              title="No endpoints yet"
              body="Add the URL that should receive events. Until you do this, your app has to poll the API to learn about payments."
            />
          ) : (
            endpoints.map((endpoint) => <EndpointRow key={endpoint.id} endpoint={endpoint} canManage={canManage} />)
          )}

          <section className="card p-5">
            <h2 className="font-medium">Handling an event</h2>
            <p className="mt-1 text-sm text-muted">
              Return <code className="font-mono text-xs">2xx</code> as soon as you&apos;ve stored the event. Anything else is treated as
              a failure and retried.
            </p>
            <div className="mt-3">
              <Code copyable>{sample}</Code>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-medium">Events you can subscribe to</h2>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((event) => (
                <li key={event} className="flex items-center gap-2 font-mono text-xs text-muted">
                  <span className="size-1 rounded-full bg-accent" />
                  {event}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Leave the selection empty on an endpoint to receive all of them. Subscribing to fewer is still better than polling.
            </p>
          </section>
        </div>

        {canManage && (
          <div className="space-y-4">
            <EndpointForm events={[...WEBHOOK_EVENTS]} />
          </div>
        )}
      </div>
    </>
  )
}
