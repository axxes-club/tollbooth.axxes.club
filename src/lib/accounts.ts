import "server-only"
import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { stripe, stripeMode } from "@/lib/stripe"
import type { TbMode } from "@/lib/db/schema/tollbooth"

/**
 * Syncs the workspace's Stripe account state, balance and next payout.
 *
 * Reads happen on demand rather than being trusted from a cached web event, so the
 * number on the dashboard is the number Stripe would tell you right now.
 */
export async function syncAccount(tenantId: string, mode: TbMode = stripeMode()) {
  const [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, tenantId))
  if (!account) return null

  const client = stripe(mode)
  const [remote, balance, payouts] = await Promise.all([
    client.accounts.retrieve(account.stripeAccountId),
    client.balance.retrieve({}, { stripeAccount: account.stripeAccountId }),
    client.payouts.list({ limit: 1 }, { stripeAccount: account.stripeAccountId }),
  ])

  const next = payouts.data[0]
  const [updated] = await db
    .update(schema.tollboothAccounts)
    .set({
      chargesEnabled: remote.charges_enabled ? 1 : 0,
      payoutsEnabled: remote.payouts_enabled ? 1 : 0,
      detailsSubmitted: remote.details_submitted ? 1 : 0,
      country: remote.country ?? null,
      defaultCurrency: remote.default_currency ?? null,
      chargesDisabledReason: remote.requirements?.disabled_reason ?? null,
      requirementsDue: (remote.requirements?.currently_due ?? []) as string[],
      balanceAvailable: balance.available[0]?.amount ?? 0,
      balancePending: balance.pending[0]?.amount ?? 0,
      nextPayoutAt: next?.arrival_date ? new Date(next.arrival_date * 1000) : null,
      payoutSchedule: remote.settings?.payouts?.schedule?.interval ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.tollboothAccounts.tenantId, tenantId))
    .returning()

  return updated
}

