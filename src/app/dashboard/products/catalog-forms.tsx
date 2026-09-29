"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createPrice, createProduct, togglePrice, updateProduct } from "../actions"

export function ProductForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <button className="btn-primary w-full py-3" onClick={() => setOpen(true)}>
        Add a product
      </button>
    )
  }

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        start(async () => {
          const result = await createProduct(new FormData(e.currentTarget))
          if (result.ok) {
            ;(e.currentTarget as HTMLFormElement).reset()
            setOpen(false)
            router.refresh()
          } else setError(result.error)
        })
      }}
    >
      <h2 className="font-medium">New product</h2>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Name</span>
        <input className="input" name="name" required placeholder="General admission" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Description</span>
        <textarea className="input min-h-20" name="description" placeholder="Shown on the checkout page" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Image URL</span>
        <input className="input" name="image_url" type="url" placeholder="https://…" />
      </label>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={pending}>{pending ? "Saving…" : "Create product"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

export function PriceForm({ products, currencies }: { products: { id: string; name: string }[]; currencies: readonly string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <button className="btn-ghost w-full py-3" onClick={() => setOpen(true)}>
        Add a price
      </button>
    )
  }

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        start(async () => {
          const result = await createPrice(new FormData(e.currentTarget))
          if (result.ok) {
            ;(e.currentTarget as HTMLFormElement).reset()
            setOpen(false)
            router.refresh()
          } else setError(result.error)
        })
      }}
    >
      <h2 className="font-medium">New price</h2>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Product</span>
        <select className="input" name="product_id">
          <option value="">No product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Amount</span>
          <input className="input" name="amount" type="number" step="0.01" min="0.5" required placeholder="25.00" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Currency</span>
          <select className="input" name="currency" defaultValue="usd">
            {currencies.map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Lookup key</span>
        <input className="input font-mono text-xs" name="lookup_key" placeholder="vip_ticket" />
        <span className="mt-1 block text-xs text-muted">Optional. Lets your app charge this price by name instead of by id.</span>
      </label>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={pending}>{pending ? "Saving…" : "Create price"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

export function PriceRow({
  price,
  canManage,
}: {
  price: { id: string; amount: number; currency: string; lookupKey: string | null; nickname: string | null; active: number }
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium tabular-nums">
          {(price.amount / 100).toFixed(2)} <span className="text-xs uppercase text-muted">{price.currency}</span>
          {price.nickname && <span className="ml-2 text-sm font-normal text-muted">{price.nickname}</span>}
        </p>
        {price.lookupKey && <p className="font-mono text-[11px] text-muted">{price.lookupKey}</p>}
      </div>
      <div className="flex items-center gap-2">
        <StatusDot active={!!price.active} />
        {canManage && (
          <button
            className="btn-ghost px-2 py-1 text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await togglePrice(price.id, !price.active)
                router.refresh()
              })
            }
          >
            {price.active ? "Archive" : "Reactivate"}
          </button>
        )}
      </div>
    </li>
  )
}

export function ProductToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      className="btn-ghost px-2 py-1 text-xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await updateProduct(id, { active: !active })
          router.refresh()
        })
      }
    >
      {active ? "Archive" : "Restore"}
    </button>
  )
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${active ? "text-emerald-300" : "text-muted"}`}>
      <span className={`size-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-line"}`} />
      {active ? "Active" : "Archived"}
    </span>
  )
}
