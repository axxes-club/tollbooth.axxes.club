import { eq, sql } from "drizzle-orm"
import { schema } from "@/lib/db"
import { fail, jsonResponse, listBody, paginate, serializeRefund, withApi } from "@/lib/api"
import { createRefund, RefundError } from "@/lib/refunds"

const REASONS = new Set(["duplicate", "fraudulent", "requested_by_customer", "expired_uncaptured_charge"])

/**
 * POST /api/v1/refunds
 *
 * Refunds `payment_id`, in full by default or `amount` for a partial one. The
 * slice of Tollbooth's fee that covered the refunded money is returned to you
 * automatically, so a refund never costs you the fee on top.
 */
export const POST = withApi(async ({ req, caller, json, idempotency }) => {
  const body = await json<{ payment_id?: string; amount?: number; reason?: string; note?: string }>()
  if (!body.payment_id) throw fail(400, "invalid_request_error", "payment_id is required")
  if (body.reason && !REASONS.has(body.reason))
    throw fail(400, "invalid_request_error", `reason must be one of: ${[...REASONS].join(", ")}`)

  try {
    const refund = await createRefund({
      tenantId: caller.tenantId,
      mode:caller.mode,
      apiKeyId: caller.apiKeyId,
      paymentId: body.payment_id,
      operation:idempotency,
      amount: body.amount,
      reason: body.reason ?? null,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
      createdByKind: "api",
      idempotencyKey: req.headers.get("idempotency-key"),
    })
    return jsonResponse(serializeRefund(refund), 201)
  } catch (err) {
    if (err instanceof RefundError) throw fail(err.status, err.type, err.message)
    throw err
  }
}, { scope: "refunds:write" })

/** GET /api/v1/refunds — every refund, newest first. Filter with `payment_id`. */
export const GET = withApi(async ({ url, caller }) => {
  const paymentId = url.searchParams.get("payment_id")
  const { data, hasMore } = await paginate("refunds", caller.tenantId, {
    limit: Number(url.searchParams.get("limit")) || 20,
    startingAfter: url.searchParams.get("starting_after"),
  }, [sql`exists(select 1 from ${schema.tollboothPayments} where ${schema.tollboothPayments.id}=${schema.tollboothRefunds.paymentId} and ${schema.tollboothPayments.tenantId}=${caller.tenantId} and ${schema.tollboothPayments.mode}=${caller.mode})`,...(paymentId?[eq(schema.tollboothRefunds.paymentId,paymentId)]:[])])

  return jsonResponse(listBody(data.map(serializeRefund), hasMore))
}, { scope: "payments:read" })
