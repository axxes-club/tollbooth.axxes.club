import { NextResponse } from "next/server"
import { and, desc, eq, lt } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { authenticateApiKey } from "@/lib/api-keys"
import { apiError, serializePayment } from "@/lib/api"

// GET /api/v1/payments?limit=20&starting_after=<payment id>
export async function GET(req: Request) {
  const caller = await authenticateApiKey(req)
  if (!caller) return apiError(401, "authentication_error", "Missing or invalid API key")

  const params = new URL(req.url).searchParams
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 20))
  const conditions = [eq(schema.tollboothPayments.tenantId, caller.tenantId)]

  const after = params.get("starting_after")
  if (after) {
    const [cursor] = await db.select({ createdAt: schema.tollboothPayments.createdAt }).from(schema.tollboothPayments)
      .where(and(eq(schema.tollboothPayments.id, after), eq(schema.tollboothPayments.tenantId, caller.tenantId))).catch(() => [])
    if (!cursor) return apiError(400, "invalid_request_error", "Unknown starting_after")
    conditions.push(lt(schema.tollboothPayments.createdAt, cursor.createdAt))
  }

  const rows = await db.select().from(schema.tollboothPayments).where(and(...conditions))
    .orderBy(desc(schema.tollboothPayments.createdAt)).limit(limit + 1)
  return NextResponse.json({ object: "list", data: rows.slice(0, limit).map(serializePayment), has_more: rows.length > limit })
}
