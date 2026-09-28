import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { authenticateApiKey } from "@/lib/api-keys"
import { apiError, serializePayment } from "@/lib/api"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateApiKey(req)
  if (!caller) return apiError(401, "authentication_error", "Missing or invalid API key")

  const { id } = await params
  const [payment] = await db.select().from(schema.tollboothPayments)
    .where(and(eq(schema.tollboothPayments.id, id), eq(schema.tollboothPayments.tenantId, caller.tenantId))).catch(() => [])
  if (!payment) return apiError(404, "resource_missing", "No such payment")
  return NextResponse.json(serializePayment(payment))
}
