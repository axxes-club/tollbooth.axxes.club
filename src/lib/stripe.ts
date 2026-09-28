import "server-only"
import Stripe from "stripe"

let client: Stripe | null = null

// Same Stripe account as afters.am; Tollbooth is the Connect platform
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured")
    client = new Stripe(key)
  }
  return client
}

export const stripeMode = () => (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test")
