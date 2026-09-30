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

/** Converts human-entered major units without floating-point rounding. */
export function parseMoney(input: string, currency: string): number | null {
  const value = input.trim()
  if (!/^\d+(?:\.\d+)?$/.test(value) || value.length > 32) return null
  const exponent = currencyExponent(currency)
  const [whole, fraction = ""] = value.split(".")
  if (fraction.length > exponent) return null
  const minor = BigInt(whole) * BigInt(10 ** exponent) + BigInt(fraction.padEnd(exponent, "0") || "0")
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null
}

export const moneyInputValue = (amount: number, currency: string) =>
  (amount / 10 ** currencyExponent(currency)).toFixed(currencyExponent(currency))

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
 * How much of `chargedFee` should be returned once `refundedAmount` of the original
 * has been given back.
 *
 * This is a total, not a per-refund delta, and it floors. Both matter: computing each
 * refund's share independently and rounding would let a payment split into halves
 * return more fee than was ever charged — a $25 ticket with a 25¢ fee would hand back
 * 26¢. Flooring keeps the value monotonic in `refundedAmount`, so the sum of the
 * deltas taken across successive refunds can never exceed `chargedFee`.
 */
export function feeForRefundedAmount(chargedFee: number, refundedAmount: number, originalAmount: number): number {
  if (originalAmount <= 0 || refundedAmount <= 0) return 0
  return Math.max(0, Math.min(chargedFee, Math.floor((chargedFee * refundedAmount) / originalAmount)))
}

/**
 * The fee to hand back for a single refund, given what has already been returned.
 *
 * `alreadyReturned` is what earlier refunds on this payment gave back, so the caller
 * never returns more than the fee it originally charged.
 */
export function refundFeeDelta(
  chargedFee: number,
  alreadyReturned: number,
  amount: number,
  originalAmount: number,
  refundedTotal: number
): number {
  const outstanding = Math.max(0, chargedFee - alreadyReturned)
  if (outstanding === 0) return 0
  const target = feeForRefundedAmount(chargedFee, refundedTotal, originalAmount)
  return Math.max(0, Math.min(target - alreadyReturned, outstanding))
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

/**
 * True when a value can be a UUID.
 *
 * Price and product lookups accept either a real id or a `lookup_key` like
 * `vip_ticket`. Comparing a non-UUID against a `uuid` column is a Postgres *type
 * error*, not an empty result, so id lookups have to be guarded.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value)
