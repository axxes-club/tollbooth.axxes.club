import { requireContext } from "@/lib/context"
import { PageHeader, Empty, Notice, Stat } from "@/components/ui"
import { LinkForm, LinkRow } from "./link-forms"
import { formatMoney } from "@/lib/fees"
import { getLinks, getProducts, getAccount } from "../queries"

const siteUrl = process.env.TOLLBOOTH_SITE_URL ?? "https://tollbooth.axxes.club"

/**
 * Payment links: the no-code path.
 *
 * A link is a page that sells a price. Share it and money arrives — no integration,
 * no deploy, no developer. This is how most people should start, and it's a real
 * first-class checkout in the API afterwards, not a lesser one.
 */
export default async function LinksPage() {
  const ctx = await requireContext()
  const canManage = ["owner", "admin"].includes(ctx.role)
  const [links, products, account] = await Promise.all([getLinks(ctx.tenant.id), getProducts(ctx.tenant.id), getAccount(ctx.tenant.id)])
  const prices = products.flatMap((p) => p.prices.map((price) => ({ ...price, label: p.name })))
  const activePrices = prices.filter((p) => !!p.active)

  const totalViews = links.reduce((sum, l) => sum + l.viewCount, 0)
  const totalSales = links.reduce((sum, l) => sum + l.paymentCount, 0)
  const conversion = totalViews > 0 ? ((totalSales / totalViews) * 100).toFixed(1) : null

  return (
    <>
      <PageHeader
        title="Payment links"
        description="Share a link, get paid. No code, no integration, no Stripe account to set up."
      />

      {!account?.chargesEnabled && (
        <div className="mb-6">
          <Notice
            tone="warn"
            title="Payouts aren't set up yet"
            action={
              <a href="/dashboard/settings" className="btn-primary">
                Set up payouts
              </a>
            }
          >
            You can create links now, but buyers can't pay until the workspace can receive money.
          </Notice>
        </div>
      )}

      {links.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Links" value={links.length} hint={`${links.filter((l) => l.active).length} active`} />
          <Stat label="Page views" value={totalViews.toLocaleString()} hint={conversion ? `${conversion}% went on to pay` : "Across all links"} />
          <Stat label="Sales" value={totalSales.toLocaleString()} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {links.length === 0 ? (
            <Empty
              title="No payment links yet"
              body="Create a link for a price and you have a working checkout page you can email, post or put in a bio."
              action={
                activePrices.length === 0 ? (
                  <a href="/dashboard/products" className="btn-ghost">
                    Add a price first
                  </a>
                ) : undefined
              }
            />
          ) : (
            links.map((link) => <LinkRow key={link.id} link={link} baseUrl={siteUrl} canManage={canManage} />)
          )}
        </div>

        <div className="space-y-4">
          {canManage &&
            (activePrices.length > 0 ? (
              <LinkForm prices={activePrices.map((p) => ({ id: p.id, label: `${p.label} — ${formatMoney(p.amount, p.currency)}` }))} baseUrl={siteUrl} />
            ) : (
              <div className="card p-5">
                <p className="font-medium">Add a price first</p>
                <p className="mt-1 text-sm text-muted">A payment link sells a specific price, so it needs one to exist.</p>
                <a href="/dashboard/products" className="btn-ghost mt-4 w-full">Go to products</a>
              </div>
            ))}
        </div>
      </div>
    </>
  )
}
