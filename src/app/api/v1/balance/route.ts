import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, withApi } from "@/lib/api"
import { feeDescription, netPayout } from "@/lib/fees"
import { fetchBalance } from "@/lib/payments"

/**
 * GET /api/v1/balance
 *
 * The workspace's real balance at Stripe: what's available to pay out, what's still
 * pending, and when the next payout lands. Read live from Stripe, never estimated.
 */
export const GET = withApi(async ({ caller }) => {
  const [account] = await db
    .select()
    .from(schema.tollboothAccounts)
    .where(eq(schema.tollboothAccounts.tenantId, caller.tenantId))
  if (!account) throw fail(409, "account_not_ready", "This workspace hasn't set up payouts yet")

  const balance = await fetchBalance(account.stripeAccountId, caller.mode)

  return jsonResponse({
    object: "balance",
    mode: caller.mode,
    available: balance.available,
    pending: balance.pending,
    currency: balance.currency,
    payouts_enabled: balance.payoutsEnabled,
    next_payout_at: balance.nextPayoutAt ? Math.floor(balance.nextPayoutAt.getTime() / 1000) : null,
    // What a charge of this size would leave you after Tollbooth's cut.
    fee: feeDescription(),
    net_after_fee_on_100: netPayout(10_000),
  })
}, { scope: "payments:read" })
