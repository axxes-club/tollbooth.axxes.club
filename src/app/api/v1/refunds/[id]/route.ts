import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, serializeRefund, withApi } from "@/lib/api"

/** GET /api/v1/refunds/:id */
export const GET = withApi<{ id: string }>(async ({ params, caller }) => {
  const [refund] = await db
    .select()
    .from(schema.tollboothRefunds)
    .where(and(eq(schema.tollboothRefunds.id, params.id), eq(schema.tollboothRefunds.tenantId, caller.tenantId)))
  if (!refund) throw fail(404, "resource_missing", "No such refund")
  return jsonResponse(serializeRefund(refund))
}, { scope: "payments:read" })
