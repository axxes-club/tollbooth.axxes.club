import { withApi, jsonResponse } from "@/lib/api"
import { stripeConfigured } from "@/lib/stripe"

/**
 * GET /api/v1/health
 *
 * Unauthenticated liveness probe. Reports configuration, not secrets, so it's safe
 * to expose to a load balancer or uptime monitor.
 */
export const GET = withApi(
  async () =>
    jsonResponse({
      object: "health",
      status: stripeConfigured() ? "ok" : "degraded",
      mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
      stripe_configured: stripeConfigured(),
      time: Math.floor(Date.now() / 1000),
    }),
  { auth: false }
)
