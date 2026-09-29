"use client"

import { useState } from "react"
import { formatMoney } from "@/lib/fees"

/**
 * Collects an email, then asks the server to open a checkout session. The redirect
 * happens server-side, so a buyer's card never touches this page or this app.
 */
export function PayButton({
  slug,
  defaultEmail,
  allowQuantity,
  unitAmount,
  currency,
}: {
  slug: string
  defaultEmail: string
  allowQuantity: boolean
  unitAmount: number
  currency: string
}) {
  const [email, setEmail] = useState(defaultEmail)
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, quantity: allowQuantity ? quantity : undefined }),
      })
      const body = await res.json()
      if (!res.ok || !body.checkout_url) {
        setError(body?.error?.message ?? "We couldn't start the checkout. Please try again.")
        setPending(false)
        return
      }
      window.location.href = body.checkout_url
    } catch {
      setError("Network error. Please try again.")
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Email for your receipt</span>
        <input
          className="input"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      {allowQuantity && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Quantity</span>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-ghost size-10" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
              −
            </button>
            <span className="w-10 text-center text-lg tabular-nums" data-quantity>{quantity}</span>
            <button type="button" className="btn-ghost size-10" onClick={() => setQuantity((q) => Math.min(99, q + 1))} aria-label="Increase quantity">
              +
            </button>
            <span className="ml-auto text-sm text-muted tabular-nums">{formatMoney(unitAmount * quantity, currency)}</span>
          </div>
        </label>
      )}

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <button className="btn-primary w-full py-3 text-base" disabled={pending}>
        {pending ? "Opening checkout…" : `Pay ${formatMoney(unitAmount * quantity, currency)}`}
      </button>
    </form>
  )
}
