// Tollbooth's platform fee, taken from each payment before it reaches the workspace's Stripe account.
// Basis points + fixed minor units, e.g. 100 bps + 0 = 1%.
import type { TbMode } from "@/lib/db/schema/tollbooth"

const FEE_BPS = Number(process.env.TOLLBOOTH_FEE_BPS ?? 100)
const FEE_FIXED = Number(process.env.TOLLBOOTH_FEE_FIXED ?? 0)

/** Currencies Stripe can settle, and the ones Tollbooth exposes at checkout. */
export const CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "nzd", "sgd", "mxn", "brl", "jpy"] as const
export type Currency = (typeof CURRENCIES)[number]

/** Zero-decimal currencies: 1000 is ¥1000, not ¥10. */
const ZERO_DECIMAL = new Set(["jpy"])

export const currencyExponent = (currency: string) => (ZERO_DECIMAL.has(currency.toLowerCase()) ? 0 : 2)
export const minimumCharge = (currency: string) => (currencyExponent(currency) === 0 ? 50 : 50)

export const feeDescription = () =>
  `${(FEE_BPS / 100).toFixed(FEE_BPS % 100 ? 2 : 0)}%${FEE_FIXED ? ` + ${FEE_FIXED}¢` : ""}`

/** Net the workspace keeps once Tollbooth's fee is taken. */
export function netPayout(amount: number): number {
  return Math.max(0, amount - applicationFee(amount))
}

export function applicationFee(amount: number): number {
  if (amount <= 0) return 0
  return Math.min(amount - 1, Math.round((amount * FEE_BPS) / 10_000) + FEE_FIXED)
}

/**
 * The slice of a previously-charged fee that a refund of `amount` hands back.
 * Refunds are proportional, so this is the fee actually returned, not a fresh charge.
 */
export function refundedFee(chargedFee: number, amount: number, originalAmount: number): number {
  if (originalAmount <= 0) return 0
  return Math.max(0, Math.min(chargedFee, Math.round((chargedFee * amount) / originalAmount)))
}

export function formatMoney(amount: number, currency: string, mode?: TbMode) {
  const code = (currency || "usd").toUpperCase()
  const value = amount / 10 ** currencyExponent(code)
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: currencyExponent(code),
    maximumFractionDigits: currencyExponent(code),
  }).format(value)
  // Test money is not real money; make that obvious wherever an amount is shown.
  return mode === "test" ? `${formatted} (test)` : formatted
}
