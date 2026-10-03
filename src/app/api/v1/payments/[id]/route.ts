import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, serializePayment, withApi } from "@/lib/api"

/** GET /api/v1/payments/:id — one payment, scoped to the key's workspace. */
export const GET = withApi<{ id: string }>(async ({ params, caller }) => {
  const [payment] = await db
    .select()
    .from(schema.tollboothPayments)
    .where(and(eq(schema.tollboothPayments.id, params.id), eq(schema.tollboothPayments.tenantId, caller.tenantId),eq(schema.tollboothPayments.mode,caller.mode)))
  if (!payment) throw fail(404, "resource_missing", "No such payment")
  return jsonResponse(serializePayment(payment))
}, { scope: "payments:read" })
