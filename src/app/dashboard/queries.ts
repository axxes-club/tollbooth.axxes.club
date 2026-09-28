import "server-only"
import { and, desc, eq, gte, sql } from "drizzle-orm"
import { db, schema } from "@/lib/db"

export async function getAccount(tenantId: string) {
  const [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, tenantId))
  return account ?? null
}

export async function getPayments(tenantId: string, limit = 50, status?: string) {
  const p = schema.tollboothPayments
  return db
    .select()
    .from(p)
    .where(status ? and(eq(p.tenantId, tenantId), eq(p.status, status)) : eq(p.tenantId, tenantId))
    .orderBy(desc(p.createdAt))
    .limit(limit)
}

// Last 30 days, grouped by currency
export async function getVolume(tenantId: string) {
  const p = schema.tollboothPayments
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return db
    .select({
      currency: p.currency,
      gross: sql<number>`coalesce(sum(${p.amount}) filter (where ${p.status} in ('succeeded','partially_refunded','refunded')), 0)`.mapWith(Number),
      refunded: sql<number>`coalesce(sum(${p.amountRefunded}), 0)`.mapWith(Number),
      fees: sql<number>`coalesce(sum(${p.applicationFee}) filter (where ${p.status} in ('succeeded','partially_refunded','refunded')), 0)`.mapWith(Number),
      succeeded: sql<number>`count(*) filter (where ${p.status} in ('succeeded','partially_refunded','refunded'))`.mapWith(Number),
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(p)
    .where(and(eq(p.tenantId, tenantId), gte(p.createdAt, since)))
    .groupBy(p.currency)
}
