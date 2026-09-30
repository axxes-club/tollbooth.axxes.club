"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { requireContext } from "@/lib/context"
import { stripe } from "@/lib/stripe"
import { generateApiKey, generateWebhookSecret, scopesForWrite, type Scope } from "@/lib/api-keys"
import { createRefund, RefundError } from "@/lib/refunds"
import { uniqueLinkSlug } from "@/lib/slugs"
import { deliverPending } from "@/lib/webhooks"
import { CURRENCIES } from "@/lib/fees"
import type { TbMode } from "@/lib/db/schema/tollbooth"

const MANAGER_ROLES = new Set(["owner", "admin"])

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

async function requireManager() {
  const ctx = await requireContext()
  if (!MANAGER_ROLES.has(ctx.role)) throw new Error("Only workspace owners and admins can change billing settings")
  return ctx
}

async function origin() {
  const h = await headers()
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`
}

const bad = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong")

// ------------------------------------------------------------------- payouts

/**
 * Syncs the workspace's Stripe account state, balance and next payout.
 *
 * Reads happen on demand rather than being trusted from a cached web event, so the
 * number on the dashboard is the number Stripe would tell you right now.
 */
export async function syncAccount(tenantId: string, mode: TbMode = "live") {
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
      chargesDisabledReason: (remote as { charges_disabled_reason?: string | null }).charges_disabled_reason ?? null,
      requirementsDue: (remote.requirements?.currently_due ?? []) as string[],
      balanceAvailable: balance.available[0]?.amount ?? 0,
      balancePending: balance.pending[0]?.amount ?? 0,
      nextPayoutAt: next?.arrival_date ? new Date(next.arrival_date * 1000) : null,
      payoutSchedule: (remote.settings?.payouts?.schedule as string | undefined) ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.tollboothAccounts.tenantId, tenantId))
    .returning()

  return updated
}

export async function refreshAccount(): Promise<ActionResult> {
  const ctx = await requireContext()
  try {
    await syncAccount(ctx.tenant.id)
    revalidatePath("/dashboard", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: bad(e) }
  }
}

/** Form-action wrapper: `<form action={…}>` needs a void return. */
export async function refreshAccountAction() {
  await refreshAccount()
}

/** Creates the Express account on first use, then sends the owner through Stripe. */
export async function startOnboarding(formData?: FormData) {
  const ctx = await requireManager()
  const mode = (formData?.get("mode") as TbMode) ?? "live"
  let [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, ctx.tenant.id))

  if (!account) {
    const created = await stripe(mode).accounts.create({
      type: "express",
      email: ctx.user.email,
      business_profile: { name: ctx.tenant.name },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { tenant_id: ctx.tenant.id, source: "tollbooth" },
    })
    ;[account] = await db
      .insert(schema.tollboothAccounts)
      .values({ tenantId: ctx.tenant.id, stripeAccountId: created.id })
      .returning()
  }

  const base = await origin()
  const link = await stripe(mode).accountLinks.create({
    account: account!.stripeAccountId,
    type: "account_onboarding",
    refresh_url: `${base}/dashboard/settings?onboarding=retry&mode=${mode}`,
    return_url: `${base}/dashboard/settings?onboarding=done&mode=${mode}`,
  })
  redirect(link.url)
}

export async function openStripeDashboard() {
  const ctx = await requireManager()
  const [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, ctx.tenant.id))
  if (!account?.detailsSubmitted) throw new Error("Finish payout setup first")
  const link = await stripe().accounts.createLoginLink(account.stripeAccountId)
  redirect(link.url)
}

// ----------------------------------------------------------------- API keys

export async function createApiKey(name: string, mode: TbMode = "live", scopes?: Scope[]): Promise<ActionResult<{ secret: string; mode: TbMode }>> {
  const ctx = await requireManager()
  const label = name.trim().slice(0, 80)
  if (!label) return { ok: false, error: "Give the key a name so you can recognise it later" }

  const key = generateApiKey(mode)
  await db.insert(schema.tollboothApiKeys).values({
    tenantId: ctx.tenant.id,
    name: label,
    prefix: key.prefix,
    keyHash: key.keyHash,
    mode: key.mode,
    scopes: scopes?.length ? scopes : scopesForWrite(),
    createdById: ctx.userId,
  })
  revalidatePath("/dashboard/developers")
  return { ok: true, data: { secret: key.secret, mode: key.mode } }
}

export async function revokeApiKey(id: string): Promise<ActionResult> {
  const ctx = await requireManager()
  await db
    .update(schema.tollboothApiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.tollboothApiKeys.id, id),
        eq(schema.tollboothApiKeys.tenantId, ctx.tenant.id),
        isNull(schema.tollboothApiKeys.revokedAt)
      )
    )
  revalidatePath("/dashboard/developers")
  return { ok: true }
}

// ----------------------------------------------------------------- catalog

export async function createProduct(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireManager()
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, error: "Name is required" }

  const [product] = await db
    .insert(schema.tollboothProducts)
    .values({
      tenantId: ctx.tenant.id,
      name: name.slice(0, 200),
      description: String(formData.get("description") ?? "").trim().slice(0, 500) || null,
      imageUrl: String(formData.get("image_url") ?? "").trim().slice(0, 500) || null,
    })
    .returning()

  revalidatePath("/dashboard/products")
  return { ok: true, data: { id: product!.id } }
}

export async function updateProduct(id: string, patch: { name?: string; description?: string; active?: boolean }): Promise<ActionResult> {
  const ctx = await requireManager()
  await db
    .update(schema.tollboothProducts)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.slice(0, 200) } : {}),
      ...(patch.description !== undefined ? { description: patch.description || null } : {}),
      ...(patch.active !== undefined ? { active: patch.active ? 1 : 0 } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.tollboothProducts.id, id), eq(schema.tollboothProducts.tenantId, ctx.tenant.id)))
  revalidatePath("/dashboard/products")
  return { ok: true }
}

export async function createPrice(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager()
  const amount = Math.round(Number(formData.get("amount")) * 100)
  if (!Number.isInteger(amount) || amount < 50) return { ok: false, error: "Enter an amount of at least 0.50" }

  const currency = String(formData.get("currency") ?? "usd").toLowerCase()
  if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number])) return { ok: false, error: `Unsupported currency "${currency}"` }

  const productId = String(formData.get("product_id") ?? "") || null
  if (productId) {
    const [product] = await db
      .select()
      .from(schema.tollboothProducts)
      .where(and(eq(schema.tollboothProducts.id, productId), eq(schema.tollboothProducts.tenantId, ctx.tenant.id)))
    if (!product) return { ok: false, error: "That product wasn't found in this workspace" }
  }

  const lookupKey = String(formData.get("lookup_key") ?? "").trim() || null
  if (lookupKey) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(lookupKey)) return { ok: false, error: "Lookup key: letters, numbers, - and _ only" }
    const [clash] = await db
      .select()
      .from(schema.tollboothPrices)
      .where(and(eq(schema.tollboothPrices.tenantId, ctx.tenant.id), eq(schema.tollboothPrices.lookupKey, lookupKey)))
    if (clash) return { ok: false, error: `Lookup key "${lookupKey}" is already in use` }
  }

  await db.insert(schema.tollboothPrices).values({
    tenantId: ctx.tenant.id,
    productId,
    nickname: String(formData.get("nickname") ?? "").trim().slice(0, 200) || null,
    amount,
    currency,
    lookupKey,
  })
  revalidatePath("/dashboard/products")
  return { ok: true }
}

export async function togglePrice(id: string, active: boolean): Promise<ActionResult> {
  const ctx = await requireManager()
  await db
    .update(schema.tollboothPrices)
    .set({ active: active ? 1 : 0, updatedAt: new Date() })
    .where(and(eq(schema.tollboothPrices.id, id), eq(schema.tollboothPrices.tenantId, ctx.tenant.id)))
  revalidatePath("/dashboard/products")
  return { ok: true }
}

export async function createLink(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const ctx = await requireManager()
  const priceId = String(formData.get("price_id") ?? "")
  const [price] = await db
    .select()
    .from(schema.tollboothPrices)
    .where(and(eq(schema.tollboothPrices.id, priceId), eq(schema.tollboothPrices.tenantId, ctx.tenant.id)))
  if (!price) return { ok: false, error: "Pick a price for this link" }
  if (!price.active) return { ok: false, error: "That price is archived. Reactivate it or pick another." }

  const slug = await uniqueLinkSlug(String(formData.get("slug") ?? "") || undefined)
  const site = new URL(process.env.TOLLBOOTH_SITE_URL ?? (await origin()))

  await db.insert(schema.tollboothLinks).values({
    tenantId: ctx.tenant.id,
    priceId: price.id,
    slug,
    name: String(formData.get("name") ?? "").trim().slice(0, 200) || price.nickname || "Payment",
    successUrl: safeHttp(String(formData.get("success_url") ?? "")),
    cancelUrl: safeHttp(String(formData.get("cancel_url") ?? "")),
    allowQuantity: formData.get("allow_quantity") ? 1 : 0,
  })

  revalidatePath("/dashboard/links")
  return { ok: true, data: { url: new URL(`/pay/${slug}`, site).toString() } }
}

function safeHttp(value: string) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export async function toggleLink(id: string, active: boolean): Promise<ActionResult> {
  const ctx = await requireManager()
  await db
    .update(schema.tollboothLinks)
    .set({ active: active ? 1 : 0, updatedAt: new Date() })
    .where(and(eq(schema.tollboothLinks.id, id), eq(schema.tollboothLinks.tenantId, ctx.tenant.id)))
  revalidatePath("/dashboard/links")
  return { ok: true }
}

// ---------------------------------------------------------------- refunds

export async function refundPayment(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager()
  const paymentId = String(formData.get("payment_id") ?? "")
  const raw = String(formData.get("amount") ?? "").trim()
  const amount = raw ? Math.round(Number(raw) * 100) : undefined

  try {
    await createRefund({
      tenantId: ctx.tenant.id,
      paymentId,
      amount,
      reason: String(formData.get("reason") ?? "") || null,
      note: String(formData.get("note") ?? "").trim().slice(0, 500) || null,
      createdByKind: "dashboard",
    })
  } catch (e) {
    if (e instanceof RefundError) return { ok: false, error: e.message }
    return { ok: false, error: bad(e) }
  }

  revalidatePath("/dashboard/payments")
  revalidatePath("/dashboard")
  return { ok: true }
}

// --------------------------------------------------------------- webhooks

export async function createEndpoint(formData: FormData): Promise<ActionResult<{ secret: string }>> {
  const ctx = await requireManager()
  const url = String(formData.get("url") ?? "").trim()
  if (!/^https:\/\//.test(url)) return { ok: false, error: "The URL must start with https://" }

  const events = formData.getAll("events").map(String)
  const [endpoint] = await db
    .insert(schema.tollboothWebhookEndpoints)
    .values({
      tenantId: ctx.tenant.id,
      url,
      description: String(formData.get("description") ?? "").trim().slice(0, 200) || null,
      secret: generateWebhookSecret(),
      events: events.length ? events : ["*"],
      mode: "live",
      createdById: ctx.userId,
    })
    .returning()

  revalidatePath("/dashboard/webhooks")
  return { ok: true, data: { secret: endpoint!.secret } }
}

export async function toggleEndpoint(id: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await requireManager()
  await db
    .update(schema.tollboothWebhookEndpoints)
    .set({ enabled: enabled ? 1 : 0, ...(enabled ? { failureCount: 0 } : {}), updatedAt: new Date() })
    .where(and(eq(schema.tollboothWebhookEndpoints.id, id), eq(schema.tollboothWebhookEndpoints.tenantId, ctx.tenant.id)))
  revalidatePath("/dashboard/webhooks")
  return { ok: true }
}

export async function deleteEndpoint(id: string): Promise<ActionResult> {
  const ctx = await requireManager()
  const deleted = await db
    .delete(schema.tollboothWebhookEndpoints)
    .where(and(eq(schema.tollboothWebhookEndpoints.id, id), eq(schema.tollboothWebhookEndpoints.tenantId, ctx.tenant.id)))
    .returning({ id: schema.tollboothWebhookEndpoints.id })
  if (!deleted.length) return { ok: false, error: "That endpoint is already gone" }
  revalidatePath("/dashboard/webhooks")
  return { ok: true }
}

export async function rotateEndpointSecret(id: string): Promise<ActionResult<{ secret: string }>> {
  const ctx = await requireManager()
  const secret = generateWebhookSecret()
  const [endpoint] = await db
    .update(schema.tollboothWebhookEndpoints)
    .set({ secret, updatedAt: new Date() })
    .where(and(eq(schema.tollboothWebhookEndpoints.id, id), eq(schema.tollboothWebhookEndpoints.tenantId, ctx.tenant.id)))
    .returning()
  if (!endpoint) return { ok: false, error: "No such endpoint" }
  revalidatePath("/dashboard/webhooks")
  return { ok: true, data: { secret } }
}

export async function replayEvent(id: string): Promise<ActionResult> {
  const ctx = await requireManager()
  await db
    .update(schema.tollboothWebhookDeliveries)
    .set({ status: "pending", attempts: 0, error: null, nextAttemptAt: new Date() })
    .where(and(eq(schema.tollboothWebhookDeliveries.id, id), eq(schema.tollboothWebhookDeliveries.tenantId, ctx.tenant.id)))
  await deliverPending(5)
  revalidatePath("/dashboard/webhooks")
  return { ok: true }
}

export async function sendTestEvent(id: string): Promise<ActionResult> {
  const ctx = await requireManager()
  const [endpoint] = await db
    .select()
    .from(schema.tollboothWebhookEndpoints)
    .where(and(eq(schema.tollboothWebhookEndpoints.id, id), eq(schema.tollboothWebhookEndpoints.tenantId, ctx.tenant.id)))
  if (!endpoint) return { ok: false, error: "No such endpoint" }

  const [{ emit }] = await Promise.all([import("@/lib/webhooks")])
  await emit("payment.succeeded", ctx.tenant.id, endpoint.mode as TbMode, {
    object: "payment",
    id: "test_payment_id",
    status: "succeeded",
    amount: 2500,
    currency: "usd",
    description: "Tollbooth test event",
    test: true,
  })
  await deliverPending(5)
  revalidatePath("/dashboard/webhooks")
  return { ok: true }
}
