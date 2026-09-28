"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { requireContext } from "@/lib/context"
import { stripe } from "@/lib/stripe"
import { generateApiKey } from "@/lib/api-keys"

const MANAGER_ROLES = new Set(["owner", "admin"])

async function requireManager() {
  const ctx = await requireContext()
  if (!MANAGER_ROLES.has(ctx.role)) throw new Error("Only workspace owners and admins can manage payments settings")
  return ctx
}

async function origin() {
  const h = await headers()
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`
}

async function syncAccount(tenantId: string, stripeAccountId: string) {
  const account = await stripe().accounts.retrieve(stripeAccountId)
  await db
    .update(schema.tollboothAccounts)
    .set({
      chargesEnabled: account.charges_enabled ? 1 : 0,
      payoutsEnabled: account.payouts_enabled ? 1 : 0,
      detailsSubmitted: account.details_submitted ? 1 : 0,
      country: account.country ?? null,
      defaultCurrency: account.default_currency ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.tollboothAccounts.tenantId, tenantId))
}

// Creates the workspace's Stripe Express account on first use, then sends the owner through Stripe's onboarding
export async function startOnboarding() {
  const ctx = await requireManager()
  let [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, ctx.tenant.id))

  if (!account) {
    const created = await stripe().accounts.create({
      type: "express",
      email: ctx.user.email,
      business_profile: { name: ctx.tenant.name },
      metadata: { tenant_id: ctx.tenant.id, source: "tollbooth" },
    })
    ;[account] = await db
      .insert(schema.tollboothAccounts)
      .values({ tenantId: ctx.tenant.id, stripeAccountId: created.id })
      .returning()
  }

  const base = await origin()
  const link = await stripe().accountLinks.create({
    account: account.stripeAccountId,
    type: "account_onboarding",
    refresh_url: `${base}/dashboard/settings?onboarding=retry`,
    return_url: `${base}/dashboard/settings?onboarding=done`,
  })
  redirect(link.url)
}

export async function refreshAccount() {
  const ctx = await requireContext()
  const [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, ctx.tenant.id))
  if (account) await syncAccount(ctx.tenant.id, account.stripeAccountId)
  revalidatePath("/dashboard", "layout")
}

export async function openStripeDashboard() {
  const ctx = await requireManager()
  const [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, ctx.tenant.id))
  if (!account?.detailsSubmitted) throw new Error("Finish payout setup first")
  const link = await stripe().accounts.createLoginLink(account.stripeAccountId)
  redirect(link.url)
}

export async function createApiKey(name: string): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  const ctx = await requireManager()
  const label = name.trim().slice(0, 80)
  if (!label) return { ok: false, error: "Give the key a name" }
  const { secret, prefix, keyHash } = generateApiKey()
  await db.insert(schema.tollboothApiKeys).values({ tenantId: ctx.tenant.id, name: label, prefix, keyHash, createdById: ctx.userId })
  revalidatePath("/dashboard/developers")
  return { ok: true, secret }
}

export async function revokeApiKey(id: string) {
  const ctx = await requireManager()
  await db
    .update(schema.tollboothApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.tollboothApiKeys.id, id), eq(schema.tollboothApiKeys.tenantId, ctx.tenant.id), isNull(schema.tollboothApiKeys.revokedAt)))
  revalidatePath("/dashboard/developers")
}
