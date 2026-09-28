import { desc, eq } from "drizzle-orm"
import { requireContext } from "@/lib/context"
import { db, schema } from "@/lib/db"
import { PageHeader } from "@/components/ui"
import { ApiKeys } from "./api-keys"

export default async function DevelopersPage() {
  const ctx = await requireContext()
  const keys = await db
    .select()
    .from(schema.tollboothApiKeys)
    .where(eq(schema.tollboothApiKeys.tenantId, ctx.tenant.id))
    .orderBy(desc(schema.tollboothApiKeys.createdAt))

  return (
    <>
      <PageHeader title="Developers" description="API keys let your apps start payments for this workspace." />
      <ApiKeys
        canManage={["owner", "admin"].includes(ctx.role)}
        keys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revoked: !!k.revokedAt,
        }))}
      />

      <h2 className="mb-3 mt-10 text-sm font-medium text-muted">Quickstart</h2>
      <div className="card overflow-x-auto p-5">
        <pre className="font-mono text-[13px] leading-relaxed text-muted">{`curl https://tollbooth.axxes.club/api/v1/checkout-sessions \\
  -H "Authorization: Bearer $TOLLBOOTH_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 2500,
    "currency": "usd",
    "description": "VIP ticket",
    "reference": "order_1234",
    "success_url": "https://your.app/thanks",
    "cancel_url": "https://your.app/cart"
  }'`}</pre>
        <p className="mt-4 text-sm text-muted">
          Send the customer to <code className="font-mono text-text">checkout_url</code>. Full reference in the{" "}
          <a className="text-accent hover:underline" href="/docs">API docs</a>.
        </p>
      </div>
    </>
  )
}
