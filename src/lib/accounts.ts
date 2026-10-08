import "server-only"
import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { stripe, stripeMode } from "@/lib/stripe"
import type Stripe from "stripe"
import type { TbMode } from "@/lib/db/schema/tollbooth"

/**
 * How every workspace's payout account is configured.
 *
 * The merchant never sees Stripe: no Stripe dashboard (`none`), so Tollbooth is the
 * whole interface. Stripe still carries the risk: it bills its processing fee to the
 * merchant's account (`fees.payer`), covers negative balances and chargebacks
 * (`losses`), and decides what identity and bank details the law requires
 * (`requirement_collection`). Tollbooth's fee is an application fee on top.
 */
export const PAYOUT_ACCOUNT_CONTROLLER = {
  stripe_dashboard: { type: "none" },
  fees: { payer: "account" },
  losses: { payments: "stripe" },
  requirement_collection: "stripe",
} as const satisfies Stripe.AccountCreateParams.Controller

/** True when an account was created with the controller above; it can't be changed afterwards. */
export function hasPayoutController(remote: Pick<Stripe.Account, "controller">) {
  const c = remote.controller
  return (
    c?.stripe_dashboard?.type === "none" &&
    c?.fees?.payer === "account" &&
    c?.losses?.payments === "stripe" &&
    c?.requirement_collection === "stripe"
  )
}

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

