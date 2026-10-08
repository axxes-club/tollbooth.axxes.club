import "server-only"
import { and, eq, isNotNull } from "drizzle-orm"
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

type Owner = { tenantId: string; name: string; email: string }

/**
 * The workspace's payout account on this platform, created on first use.
 *
 * A stored account that this platform can't see (it belonged to a previous Stripe
 * platform), or that was configured another way and never took a payment, is
 * replaced: the controller can only be set when an account is created.
 */
export async function ensurePayoutAccount(owner: Owner, mode: TbMode) {
  const [existing] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, owner.tenantId))
  if (existing) {
    const remote = await stripe(mode)
      .accounts.retrieve(existing.stripeAccountId)
      .catch((err: { code?: string }) => {
        if (err?.code === "resource_missing") return null
        throw err
      })
    if (remote && (hasPayoutController(remote) || existing.chargesEnabled)) return existing
    // Refunds for past payments are issued on the account that took them.
    const [charged] = await db
      .select({ id: schema.tollboothPayments.id })
      .from(schema.tollboothPayments)
      .where(and(eq(schema.tollboothPayments.tenantId, owner.tenantId), isNotNull(schema.tollboothPayments.paymentIntentId)))
      .limit(1)
    if (remote && charged) return existing
  }

  const created = await stripe(mode).accounts.create({
    controller: PAYOUT_ACCOUNT_CONTROLLER,
    email: owner.email,
    business_profile: { name: owner.name },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { tenant_id: owner.tenantId, source: "tollbooth" },
  })
  const fresh = {
    stripeAccountId: created.id,
    chargesEnabled: 0,
    payoutsEnabled: 0,
    detailsSubmitted: 0,
    chargesDisabledReason: null,
    requirementsDue: [],
    updatedAt: new Date(),
  }
  const [account] = await db
    .insert(schema.tollboothAccounts)
    .values({ tenantId: owner.tenantId, ...fresh })
    .onConflictDoUpdate({ target: schema.tollboothAccounts.tenantId, set: fresh })
    .returning()
  return account!
}

const settingsUrls = (base: string, mode: TbMode) => ({
  refresh_url: `${base}/dashboard/settings?onboarding=retry&mode=${mode}`,
  return_url: `${base}/dashboard/settings?onboarding=done&mode=${mode}`,
})

/** Stripe's verification form for the workspace's payout account, creating the account if needed. */
export async function onboardingLink(owner: Owner, mode: TbMode, base: string): Promise<string> {
  const account = await ensurePayoutAccount(owner, mode)
  const link = await stripe(mode).accountLinks.create({
    account: account.stripeAccountId,
    type: "account_onboarding",
    ...settingsUrls(base, mode),
  })
  return link.url
}

/**
 * Where the owner changes bank or business details. Payout accounts have no Stripe
 * dashboard, and Stripe only issues `account_onboarding` links for them; on a
 * finished account that link opens the same form with the saved details to edit.
 */
export async function payoutDetailsLink(tenantId: string, mode: TbMode, base: string): Promise<string> {
  const [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, tenantId))
  if (!account?.detailsSubmitted) throw new Error("Finish payout setup first")
  const link = await stripe(mode).accountLinks.create({
    account: account.stripeAccountId,
    type: "account_onboarding",
    collection_options: { fields: "eventually_due" },
    ...settingsUrls(base, mode),
  })
  return link.url
}
