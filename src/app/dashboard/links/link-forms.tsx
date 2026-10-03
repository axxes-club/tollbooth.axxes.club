"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CopyButton } from "@/components/ui"
import { formatMoney } from "@/lib/fees"
import { createLink, toggleLink } from "../actions"

type Price = { id: string; label: string }

export function LinkForm({ prices, baseUrl }: { prices: Price[]; baseUrl: string }) {
  const router = useRouter()
  const [created, setCreated] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        setError(null)
        start(async () => {
          const result = await createLink(data)
          if (result.ok && result.data) {
            setCreated(result.data.url)
            router.refresh()
          } else setError(result.ok ? "Could not create the link" : result.error)
        })
      }}
    >
      <h2 className="font-medium">New payment link</h2>

      {created ? (
        <div className="space-y-3">
          <p className="text-sm text-emerald-300">Link is live. Copy it anywhere.</p>
          <div className="flex gap-2">
            <code className="input flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{created}</code>
            <CopyButton value={created} label="Copy" />
          </div>
          <button type="button" className="btn-ghost w-full" onClick={() => setCreated(null)}>
            Create another
          </button>
        </div>
      ) : (
        <>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Sell</span>
            <select className="input" name="price_id" required>
              {prices.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Name</span>
            <input className="input" name="name" placeholder="Saturday tickets" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Custom slug</span>
            <div className="flex items-center gap-1">
              <span className="shrink-0 font-mono text-xs text-muted">{baseUrl.replace(/^https?:\/\//, "")}/pay/</span>
              <input className="input font-mono text-xs" name="slug" placeholder="auto" pattern="[a-zA-Z0-9-]*" />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">After payment</span>
            <input className="input" name="success_url" type="url" placeholder="https://yoursite.com/thanks" />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="allow_quantity" className="size-4 accent-[var(--accent)]" />
            <span className="text-sm">Let buyers choose a quantity</span>
          </label>

          {error && <p className="text-sm text-danger" role="alert">{error}</p>}

          <button className="btn-primary w-full" disabled={pending}>
            {pending ? "Creating…" : "Create link"}
          </button>
        </>
      )}
    </form>
  )
}

export function LinkRow({
  link,
  baseUrl,
  canManage,
}: {
  link: {
    id: string
    slug: string
    name: string
    active: number
    viewCount: number
    paymentCount: number
    successUrl: string | null
    price: { amount: number; currency: string } | null
  }
  baseUrl: string
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const url = `${baseUrl}/pay/${link.slug}`

  return (
    <div className={`card p-5 ${link.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{link.name}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {link.price ? formatMoney(link.price.amount, link.price.currency) : "No price"}{" "}
            · {link.viewCount} views · {link.paymentCount} paid
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs ${link.active ? "text-emerald-300" : "text-muted"}`}>
            <span className={`size-1.5 rounded-full ${link.active ? "bg-emerald-400" : "bg-line"}`} />
            {link.active ? "Live" : "Off"}
          </span>
          {canManage && (
            <button
              className="btn-ghost px-2 py-1 text-xs"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await toggleLink(link.id, !link.active)
                  router.refresh()
                })
              }
            >
              {link.active ? "Turn off" : "Turn on"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <code className="input flex-1 overflow-x-auto whitespace-nowrap py-1.5 font-mono text-xs">{url}</code>
        <CopyButton value={url} label="Copy" />
      </div>
    </div>
  )
}
