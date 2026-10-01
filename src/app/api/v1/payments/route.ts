import { and, eq, gte, inArray, lte, type SQL } from "drizzle-orm"
import { schema } from "@/lib/db"
import { fail, jsonResponse, listBody, paginate, serializePayment, withApi } from "@/lib/api"

// Every status a payment can be in. Must stay in step with the `status` column's
// comment in the schema and with the webhook handler that writes them — `disputed`
// in particular is written by the dispute handler, so leaving it out here made the
// dashboard's "Disputed" filter impossible to express over the API.
const STATUSES = new Set([
  "pending",
  "succeeded",
  "failed",
  "expired",
  "refunded",
  "partially_refunded",
  "disputed",
])

/**
 * GET /api/v1/payments
 *
 * Newest first. Filter by `status`, `customer`, `reference`, `mode` and a
 * `created[gte|lte]` window (unix seconds or ISO date). Page with `limit` and
 * `starting_after`, which takes the id of the last payment you saw.
 */
export const GET = withApi(async ({ url, caller }) => {
  const params = url.searchParams
  const filters: (SQL | undefined)[] = [eq(schema.tollboothPayments.mode,caller.mode)]

  const status = params.get("status")
  if (status) {
    const wanted = status.split(",").filter(Boolean)
    if (wanted.some((s) => !STATUSES.has(s)))
      throw fail(400, "invalid_request_error", `Unknown status. Valid: ${[...STATUSES].join(", ")}`)
    // Several statuses can be asked for at once, so match any of them. Filtering on
    // just the first would silently ignore the rest of the request.
    if (wanted.length === 1) filters.push(eq(schema.tollboothPayments.status, wanted[0]!))
    else if (wanted.length > 1) filters.push(inArray(schema.tollboothPayments.status, wanted))
  }

  const customer = params.get("customer")
  if (customer) filters.push(eq(schema.tollboothPayments.customerId, customer))
  const reference = params.get("reference")
  if (reference) filters.push(eq(schema.tollboothPayments.reference, reference))

  const mode = params.get("mode")
  if (mode) {
    if(mode!==caller.mode)throw fail(400,"invalid_request_error","mode must match the API key");
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
