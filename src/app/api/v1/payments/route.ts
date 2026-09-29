import { and, eq, gte, lte, type SQL } from "drizzle-orm"
import { schema } from "@/lib/db"
import { fail, jsonResponse, listBody, paginate, serializePayment, withApi } from "@/lib/api"

const STATUSES = new Set(["pending", "succeeded", "failed", "expired", "refunded", "partially_refunded"])

/**
 * GET /api/v1/payments
 *
 * Newest first. Filter by `status`, `customer`, `reference`, `mode` and a
 * `created[gte|lte]` window (unix seconds or ISO date). Page with `limit` and
 * `starting_after`, which takes the id of the last payment you saw.
 */
export const GET = withApi(async ({ url, caller }) => {
  const params = url.searchParams
  const filters: (SQL | undefined)[] = []

  const status = params.get("status")
  if (status) {
    const wanted = status.split(",").filter((s) => STATUSES.has(s))
    if (wanted.length !== status.split(",").length)
      throw fail(400, "invalid_request_error", `Unknown status. Valid: ${[...STATUSES].join(", ")}`)
    if (wanted.length) filters.push(eq(schema.tollboothPayments.status, wanted[0]!))
  }

  const customer = params.get("customer")
  if (customer) filters.push(eq(schema.tollboothPayments.customerId, customer))
  const reference = params.get("reference")
  if (reference) filters.push(eq(schema.tollboothPayments.reference, reference))

  const mode = params.get("mode")
  if (mode) {
    if (mode !== "live" && mode !== "test") throw fail(400, "invalid_request_error", 'mode must be "live" or "test"')
    filters.push(eq(schema.tollboothPayments.mode, mode))
  }

  const gte_ = params.get("created[gte]")
  const lte_ = params.get("created[lte]")
  if (gte_) filters.push(gte(schema.tollboothPayments.createdAt, toDate(gte_, "created[gte]")))
  if (lte_) filters.push(lte(schema.tollboothPayments.createdAt, toDate(lte_, "created[lte]")))

  const { data, hasMore } = await paginate("payments", caller.tenantId, {
    limit: Number(params.get("limit")) || 20,
    startingAfter: params.get("starting_after"),
  }, filters)

  return jsonResponse(listBody(data.map(serializePayment), hasMore))
}, { scope: "payments:read" })

function toDate(value: string, field: string) {
  const asNumber = Number(value)
  const date = Number.isFinite(asNumber) && value !== "" ? new Date(asNumber * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) throw fail(400, "invalid_request_error", `${field} must be a unix timestamp or ISO date`)
  return date
}
