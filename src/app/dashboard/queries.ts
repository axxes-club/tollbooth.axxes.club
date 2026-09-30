import "server-only"
import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { isLiveMode } from "@/lib/stripe"
import type { TbMode } from "@/lib/db/schema/tollbooth"

export async function getAccount(tenantId: string) {
  const [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, tenantId))
  return account ?? null
}

export async function getPayments(tenantId: string, limit = 50, status?: string, mode?: TbMode) {
  const p = schema.tollboothPayments
  return db
    .select()
    .from(p)
    .where(and(eq(p.tenantId, tenantId), status ? eq(p.status, status) : undefined, mode ? eq(p.mode, mode) : undefined))
    .orderBy(desc(p.createdAt))
    .limit(limit)
}

export type Volume = {
  currency: string
  gross: number
  refunded: number
  fees: number
  succeeded: number
  total: number
  expired: number
}

/**
 * Totals over a window, split by currency and mode.
 *
 * `gross` counts the full value of every payment that was ever paid, even if most
 * of it has since been refunded — that's what a merchant reconciles against their
 * bank statement. `net` is what's actually theirs after refunds and Tollbooth's fee.
 */
export async function getVolume(tenantId: string, days = 30, mode?: TbMode): Promise<Volume[]> {
  const p = schema.tollboothPayments
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const paid = sql`${p.status} in ('succeeded','partially_refunded','refunded')`
  const conditions: (SQL | undefined)[] = [eq(p.tenantId, tenantId), gte(p.createdAt, since)]
  if (mode) conditions.push(eq(p.mode, mode))

  return db
    .select({
      currency: p.currency,
      gross: sql<number>`coalesce(sum(${p.amount}) filter (where ${paid}), 0)`.mapWith(Number),
      refunded: sql<number>`coalesce(sum(${p.amountRefunded}), 0)`.mapWith(Number),
      fees: sql<number>`coalesce(sum(${p.netFee}) filter (where ${paid}), 0)`.mapWith(Number),
      succeeded: sql<number>`count(*) filter (where ${paid})`.mapWith(Number),
      total: sql<number>`count(*)`.mapWith(Number),
      expired: sql<number>`count(*) filter (where ${p.status} in ('expired','failed'))`.mapWith(Number),
    })
    .from(p)
    .where(and(...conditions))
    .groupBy(p.currency)
}

/** Gross volume per day, for the dashboard sparkline. */
export async function getDailyVolume(tenantId: string, days = 30, mode?: TbMode, currency?: string) {
  const p = schema.tollboothPayments
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const paid = sql`${p.status} in ('succeeded','partially_refunded','refunded')`
  const conditions: (SQL | undefined)[] = [eq(p.tenantId, tenantId), gte(p.createdAt, since)]
  if (mode) conditions.push(eq(p.mode, mode))
  if (currency) conditions.push(eq(p.currency, currency))

  return db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${p.createdAt}), 'YYYY-MM-DD')`,
      gross: sql<number>`coalesce(sum(${p.amount}) filter (where ${paid}), 0)`.mapWith(Number),
      count: sql<number>`count(*) filter (where ${paid})`.mapWith(Number),
    })
    .from(p)
    .where(and(...conditions))
    .groupBy(sql`date_trunc('day', ${p.createdAt})`)
    .orderBy(sql`date_trunc('day', ${p.createdAt})`)
}

export async function getRefundRows(tenantId: string, limit = 50) {
  return db
    .select()
    .from(schema.tollboothRefunds)
    .where(eq(schema.tollboothRefunds.tenantId, tenantId))
    .orderBy(desc(schema.tollboothRefunds.createdAt))
    .limit(limit)
}

export async function getProducts(tenantId: string) {
  const products = await db
    .select()
    .from(schema.tollboothProducts)
    .where(eq(schema.tollboothProducts.tenantId, tenantId))
    .orderBy(desc(schema.tollboothProducts.createdAt))

  const prices = await db
    .select()
    .from(schema.tollboothPrices)
    .where(eq(schema.tollboothPrices.tenantId, tenantId))
    .orderBy(desc(schema.tollboothPrices.createdAt))

  return products.map((product) => ({ ...product, prices: prices.filter((p) => p.productId === product.id) }))
}

export async function getLinks(tenantId: string) {
  const links = await db
    .select()
    .from(schema.tollboothLinks)
    .where(eq(schema.tollboothLinks.tenantId, tenantId))
    .orderBy(desc(schema.tollboothLinks.createdAt))

  const prices = await db.select().from(schema.tollboothPrices).where(eq(schema.tollboothPrices.tenantId, tenantId))
  return links.map((link) => ({ ...link, price: prices.find((p) => p.id === link.priceId) ?? null }))
}

export async function getCustomers(tenantId: string) {
  return db
    .select()
    .from(schema.tollboothCustomers)
    .where(eq(schema.tollboothCustomers.tenantId, tenantId))
    .orderBy(desc(schema.tollboothCustomers.createdAt))
    .limit(200)
}

export async function getEndpoints(tenantId: string) {
  const endpoints = await db
    .select()
    .from(schema.tollboothWebhookEndpoints)
    .where(eq(schema.tollboothWebhookEndpoints.tenantId, tenantId))
    .orderBy(desc(schema.tollboothWebhookEndpoints.createdAt))

  if (!endpoints.length) return []
  const deliveries = await db
    .select()
    .from(schema.tollboothWebhookDeliveries)
    .where(
      and(
        eq(schema.tollboothWebhookDeliveries.tenantId, tenantId),
        // `inArray` parameterises the list. Interpolating a JS array into a raw
        // `sql` fragment produces literal brackets and a syntax error.
        inArray(
          schema.tollboothWebhookDeliveries.endpointId,
          endpoints.map((endpoint) => endpoint.id)
        )
      )
    )
    .orderBy(desc(schema.tollboothWebhookDeliveries.createdAt))
    .limit(100)

  return endpoints.map(({ secret: _secret, ...endpoint }) => ({ ...endpoint, deliveries: deliveries.filter((d) => d.endpointId === endpoint.id).slice(0, 8) }))
}

export async function getApiKeys(tenantId: string) {
  return db
    .select()
    .from(schema.tollboothApiKeys)
    .where(eq(schema.tollboothApiKeys.tenantId, tenantId))
    .orderBy(desc(schema.tollboothApiKeys.createdAt))
}

export async function getPayment(tenantId: string, id: string) {
  const [payment] = await db
    .select()
    .from(schema.tollboothPayments)
    .where(and(eq(schema.tollboothPayments.id, id), eq(schema.tollboothPayments.tenantId, tenantId)))
  if (!payment) return null
  const refunds = await db
    .select()
    .from(schema.tollboothRefunds)
    .where(and(eq(schema.tollboothRefunds.paymentId, id), eq(schema.tollboothRefunds.tenantId, tenantId)))
    .orderBy(desc(schema.tollboothRefunds.createdAt))
  return { ...payment, refunds }
}

/**
 * The setup checklist that drives onboarding.
 *
 * Each step is a real, checkable fact about the workspace rather than a UI flag, so
 * the progress shown is always true.
 */
export async function getOnboarding(tenantId: string) {
  const [account, keyCount, productCount, linkCount, endpointCount, paidCount] = await Promise.all([
    getAccount(tenantId),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.tollboothApiKeys).where(and(eq(schema.tollboothApiKeys.tenantId, tenantId), sql`${schema.tollboothApiKeys.revokedAt} is null`)),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.tollboothPrices).where(and(eq(schema.tollboothPrices.tenantId, tenantId), eq(schema.tollboothPrices.active, 1))),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.tollboothLinks).where(eq(schema.tollboothLinks.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.tollboothWebhookEndpoints).where(eq(schema.tollboothWebhookEndpoints.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.tollboothPayments).where(and(eq(schema.tollboothPayments.tenantId, tenantId), eq(schema.tollboothPayments.mode, "test"), sql`${schema.tollboothPayments.status} = 'succeeded'`)),
  ])

  const steps = [
    { id: "payouts", label: "Connect a payout account", done: !!account?.chargesEnabled, href: "/dashboard/settings", detail: "Tells us where to send your money. Takes a few minutes." },
    { id: "catalog", label: "Add a price or payment link", done: productCount[0]!.n > 0 || linkCount[0]!.n > 0, href: "/dashboard/products", detail: "Set a price, then share a payment link. No code needed." },
    { id: "key", label: "Create an API key", done: keyCount[0]!.n > 0, href: "/dashboard/developers", detail: "Only needed if you charge from your own app." },
    { id: "webhook", label: "Point a webhook at your app", done: endpointCount[0]!.n > 0, href: "/dashboard/webhooks", detail: "How your app finds out a payment succeeded." },
    { id: "test", label: "Take a test payment", done: paidCount[0]!.n > 0, href: "/dashboard/developers", detail: "Uses fake money. Nothing is charged." },
  ]

  const required = steps.slice(0, 2)
  return { steps: required, optionalSteps: steps.slice(2), done: required.filter((s) => s.done).length, total: required.length, account }
}

export { isLiveMode }
