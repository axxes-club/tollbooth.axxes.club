import "server-only"
import Stripe from "stripe"
import type { TbMode } from "@/lib/db/schema/tollbooth"

// Tollbooth's own Stripe account ("tollbooth by AXXES") is the Connect platform.
// A separate key per mode keeps test-mode money strictly inside Stripe's test mode.
const clients: Partial<Record<TbMode, Stripe>> = {}

function keyFor(mode: TbMode) {
  const key = mode === "test" ? process.env.STRIPE_SECRET_KEY_TEST : process.env.STRIPE_SECRET_KEY
  if (!key) {
    const which = mode === "test" ? "STRIPE_SECRET_KEY_TEST" : "STRIPE_SECRET_KEY"
    throw new StripeNotConfigured(which)
  }
  // Guard against a live key being used where a test key belongs.
  if (mode === "test" && key.startsWith("sk_live_")) throw new StripeNotConfigured("STRIPE_SECRET_KEY_TEST", "it holds a live key (sk_live_)")

  return key
}

export class StripeNotConfigured extends Error {
  constructor(
    public variable: string,
    detail?: string
  ) {
    super(`${variable} is not configured${detail ? ` — ${detail}` : ""}`)
    this.name = "StripeNotConfigured"
  }
}

export function stripe(mode: TbMode = "live"): Stripe {
  if (!clients[mode]) clients[mode] = new Stripe(keyFor(mode), { maxNetworkRetries: 2, timeout: 20_000 })
  return clients[mode]!
}

/** True when the platform is running against real money. */
export function isLiveMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_")
}

export function stripeMode(): TbMode {
  return isLiveMode() ? "live" : "test"
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY_TEST)
}

/**
 * Reads a Stripe error into the two things a caller needs: a safe message to show
 * the merchant, and the code to branch on.
 */
export function describeStripeError(err: unknown): { code: string; message: string; status: number } {
  if (err instanceof StripeNotConfigured) {
    return { code: "platform_misconfigured", message: err.message, status: 500 }
  }
  if (err instanceof Stripe.errors.StripeError) {
    const code = err.code ?? err.type ?? "stripe_error"
    // `message` is written for developers and is safe; `raw` can contain request internals.
    return { code, message: err.message || "The payment provider rejected this request", status: 502 }
  }
  return { code: "api_error", message: "The payment provider could not be reached", status: 502 }
}
