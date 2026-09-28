// Tollbooth's platform fee, taken from each payment before it reaches the workspace's Stripe account.
// Basis points + fixed minor units, e.g. 100 bps + 0 = 1%.
const FEE_BPS = Number(process.env.TOLLBOOTH_FEE_BPS ?? 100)
const FEE_FIXED = Number(process.env.TOLLBOOTH_FEE_FIXED ?? 0)

export const feeDescription = () =>
  `${(FEE_BPS / 100).toFixed(FEE_BPS % 100 ? 2 : 0)}%${FEE_FIXED ? ` + ${FEE_FIXED}¢` : ""}`

export function applicationFee(amount: number): number {
  if (amount <= 0) return 0
  return Math.min(amount - 1, Math.round((amount * FEE_BPS) / 10_000) + FEE_FIXED)
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100)
}
