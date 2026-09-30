"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { refundPayment } from "../../actions"
import { formatMoney, parseMoney, moneyInputValue, currencyExponent } from "@/lib/fees"

const REASONS = [
  { value: "", label: "No reason" },
  { value: "requested_by_customer", label: "Customer asked for it" },
  { value: "duplicate", label: "Duplicate charge" },
  { value: "fraudulent", label: "Fraudulent" },
]

/**
 * Full or partial refund. The amount is entered in major units ("25.00") because
 * that's how a person thinks about money; it goes to Stripe in minor units.
 */
export function RefundForm({ paymentId, currency, remaining }: { paymentId: string; currency: string; remaining: number }) {
  const router = useRouter()
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  const parsed = amount.trim() === "" ? remaining : parseMoney(amount, currency)
  const invalid = parsed === null || parsed < 1 || parsed > remaining

  async function submit() {
    setError(null)
    start(async () => {
      const form = new FormData()
      form.set("payment_id", paymentId)
      if (amount.trim()) form.set("amount", amount)
      if (reason) form.set("reason", reason)
      const result = await refundPayment(form)
      if (result.ok) {
        setDone(true)
        setConfirming(false)
        router.refresh()
      } else setError(result.error)
    })
  }

  if (done) {
    return <p className="mt-4 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">Refund sent.</p>
  }

  return (
    <div className="mt-4 space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">
          Amount ({currency.toUpperCase()}) — blank refunds the full {formatMoney(remaining, currency)}
        </span>
        <input
          className="input"
          inputMode={currencyExponent(currency) === 0 ? "numeric" : "decimal"}
          placeholder={moneyInputValue(remaining, currency)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Reason</span>
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {confirming && !invalid && parsed !== null ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="text-sm">
            Refund <strong className="tabular-nums">{formatMoney(parsed, currency)}</strong> to {paymentId.slice(0, 8)}? This can't be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={submit} disabled={pending}>
              {pending ? "Refunding…" : "Confirm refund"}
            </button>
            <button className="btn-ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-danger w-full" onClick={() => setConfirming(true)} disabled={pending || invalid}>
          Refund
        </button>
      )}
      {invalid && amount.trim() !== "" && <p className="text-xs text-danger" role="alert">Enter an amount from {formatMoney(1, currency)} to {formatMoney(remaining, currency)} with valid currency precision.</p>}
    </div>
  )
}
