import { requireContext } from "@/lib/context"
import { PageHeader, Empty, StatusBadge } from "@/components/ui"
import { ProductForm, PriceForm, PriceRow, ProductToggle } from "./catalog-forms"
import { formatMoney, CURRENCIES } from "@/lib/fees"
import { getProducts } from "../queries"

/**
 * Products and prices.
 *
 * Prices are append-only on purpose: changing an amount would silently rewrite what
 * past receipts say they were. To change a price, archive it and add another.
 */
export default async function ProductsPage() {
  const ctx = await requireContext()
  const canManage = ["owner", "admin"].includes(ctx.role)
  const products = await getProducts(ctx.tenant.id)
  const loosePrices = products.flatMap((p) => p.prices.filter((price) => !price.productId))

  return (
    <>
      <PageHeader
        title="Products & prices"
        description="What you sell and what it costs. A price can be sold through the API or a payment link."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {products.length === 0 && loosePrices.length === 0 ? (
            <Empty
              title="Nothing on sale yet"
              body="Add a product and give it a price. You can then sell it from your app with one API call, or turn it into a payment link."
            />
          ) : (
            products.map((product) => (
              <section key={product.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-medium">{product.name}</h2>
                    {product.description && <p className="mt-1 text-sm text-muted">{product.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={product.active ? "active" : "archived"} />
                    {canManage && <ProductToggle id={product.id} active={!!product.active} />}
                  </div>
                </div>

                {product.prices.length > 0 ? (
                  <ul className="mt-4 divide-y divide-line/60 border-t border-line/60">
                    {product.prices.map((price) => (
                      <PriceRow key={price.id} price={price} canManage={canManage} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 border-t border-line/60 pt-4 text-sm text-muted">No prices yet.</p>
                )}
              </section>
            ))
          )}

          {loosePrices.length > 0 && (
            <section className="card p-5">
              <h2 className="font-medium">Standalone prices</h2>
              <p className="mt-1 text-sm text-muted">Amounts that aren't tied to a product.</p>
              <ul className="mt-4 divide-y divide-line/60 border-t border-line/60">
                {loosePrices.map((price) => (
                  <PriceRow key={price.id} price={price} canManage={canManage} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {canManage && (
            <>
              <ProductForm />
              <PriceForm products={products.map((p) => ({ id: p.id, name: p.name }))} currencies={[...CURRENCIES]} />
            </>
          )}
          {!canManage && <p className="card p-5 text-sm text-muted">Only workspace owners and admins can change the catalog.</p>}
        </div>
      </div>
    </>
  )
}
