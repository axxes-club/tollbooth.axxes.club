import {reconcileProviderRefund} from "@/lib/refunds"
import {stripe} from "@/lib/stripe"
import { and, eq,sql } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, serializeRefund, withApi } from "@/lib/api"

/** GET /api/v1/refunds/:id */
export const GET = withApi<{ id: string }>(async ({ params, caller }) => {
  const [refund] = await db
    .select()
    .from(schema.tollboothRefunds)
    .where(and(eq(schema.tollboothRefunds.id, params.id), eq(schema.tollboothRefunds.tenantId, caller.tenantId),sql`exists(select 1 from ${schema.tollboothPayments} where ${schema.tollboothPayments.id}=${schema.tollboothRefunds.paymentId} and ${schema.tollboothPayments.mode}=${caller.mode})`))
  if (!refund) throw fail(404, "resource_missing", "No such refund")
  const current=refund.status==="pending"&&refund.stripeRefundId?(await reconcileProviderRefund(await stripe(caller.mode).refunds.retrieve(refund.stripeRefundId)))??refund:refund;
  return jsonResponse(serializeRefund(current))
}, { scope: "payments:read" })
