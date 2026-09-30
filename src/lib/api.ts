import "server-only"
import { NextResponse } from "next/server"
import { createHash, randomUUID } from "crypto"
import { and, desc, eq, getTableColumns, lt, type SQL } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import { db, schema } from "@/lib/db"
import { authenticateApiKey, scopeSatisfied, type ApiCaller, type Scope } from "@/lib/api-keys"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { describeStripeError } from "@/lib/stripe"
import { withIdempotency, type IdempotencyGuard } from "@/lib/idempotency"

type Row<Table extends keyof typeof schema> = typeof schema[Table] extends { $inferSelect: infer R } ? R : never
type PaymentRow = Row<"tollboothPayments">
type RefundRow = Row<"tollboothRefunds">
type CustomerRow = Row<"tollboothCustomers">
type ProductRow = Row<"tollboothProducts">
type PriceRow = Row<"tollboothPrices">
type LinkRow = Row<"tollboothLinks">
type EndpointRow = Row<"tollboothWebhookEndpoints">
type DeliveryRow = Row<"tollboothWebhookDeliveries">
type TbPayment = Row<"tollboothPayments">
type TbRefund = Row<"tollboothRefunds">
type TbCustomer = Row<"tollboothCustomers">
type TbProduct = Row<"tollboothProducts">
type TbPrice = Row<"tollboothPrices">
type TbLink = Row<"tollboothLinks">

type PaginatedTable = "payments" | "refunds" | "customers" | "products" | "prices" | "links"
type PageOptions = { limit?: number; startingAfter?: string | null }
type Page<T> = { data: T[]; hasMore: boolean; nextCursor: string | null }

const paginatedTables = {
  payments: schema.tollboothPayments,
  refunds: schema.tollboothRefunds,
  customers: schema.tollboothCustomers,
  products: schema.tollboothProducts,
  prices: schema.tollboothPrices,
  links: schema.tollboothLinks,
} as const satisfies Record<PaginatedTable, PgTable>

/** Thrown by handlers; the wrapper turns it into a body with the right status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string,
    readonly headers?: Record<string, string>
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const fail = (status: number, type: string, message: string, headers?: Record<string, string>) =>
  new ApiError(status, type, message, headers)

export type ApiCtx<P> = {
  req: Request
  url: URL
  params: P
  requestId: string
  caller: ApiCaller
  /** Parsed JSON body, or `undefined` when the body was empty. */
  json: <T = Record<string, unknown>>() => Promise<T>
  /** Present on mutating requests; replays the stored response for a reused key. */
  idempotency: IdempotencyGuard | null
}

type Options = { scope?: Scope; auth?: false; limit?: keyof typeof RATE_LIMITS }

const jsonHeaders = (requestId: string, extra?: Record<string, string>) => ({
  "content-type": "application/json",
  "x-request-id": requestId,
  "cache-control": "no-store",
  ...extra,
})

/**
 * Wraps a v1 handler with the things every endpoint needs: a request id on every
 * response, bearer auth, a scope check, a rate limit, and idempotency replay for
 * writes. Handlers throw `ApiError` (or `fail(...)`) and return a Response.
 */
export function withApi<P = Record<string, never>>(
  fn: (ctx: ApiCtx<P>) => Promise<Response>,
  options: Options = {}
) {
  return async (req: Request, route?: { params: Promise<P> }) => {
    const requestId = req.headers.get("x-request-id") ?? `req_${randomUUID().replaceAll("-", "").slice(0, 24)}`
    const url = new URL(req.url)
    const idemKey = req.headers.get("idempotency-key")

    try {
      if (options.auth === false) {
        const params = ((await route?.params) ?? ({} as P)) as P
        return await fn({ req, url, params, requestId, caller: null as unknown as ApiCaller, json: jsonReader(req), idempotency: null })
      }

      const caller = await authenticateApiKey(req)
      if (!caller) throw fail(401, "authentication_error", "Missing or invalid API key")

      if (options.scope && !scopeSatisfied(caller.scopes, options.scope)) {
        throw fail(403, "insufficient_scope", `This API key is missing the ${options.scope} scope`)
      }

      const limit = rateLimit(caller.apiKeyId, RATE_LIMITS[options.limit ?? (req.method === "GET" ? "read" : "write")])
      if (!limit.ok) {
        throw fail(429, "rate_limit_exceeded", "Too many requests. Slow down and retry shortly.", {
          "retry-after": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))),
        })
      }
      const rateHeaders = { "x-ratelimit-limit": String(limit.limit), "x-ratelimit-remaining": String(limit.remaining) }

      const params = ((await route?.params) ?? ({} as P)) as P
      const run = (idem: IdempotencyGuard | null) =>
        fn({ req, url, params, requestId, caller, json: jsonReader(req), idempotency: idem }).then((res) => {
          res.headers.set("x-request-id", requestId)
          for (const [k, v] of Object.entries(rateHeaders)) res.headers.set(k, v)
          return res
        })

      if (req.method === "GET" || !idemKey) return await run(null)

      return await withIdempotency({
        key: idemKey,
        tenantId: caller.tenantId,
        apiKeyId: caller.apiKeyId,
        method: req.method,
        path: url.pathname,
        requestHash: await requestFingerprint(req),
        requestId,
        run: async () => {
          const res = await run(null)
          return { status: res.status, body: await res.clone().json().catch(() => ({})) }
        },
      })
    } catch (err) {
      return errorResponse(err, requestId)
    }
  }
}

function errorResponse(err: unknown, requestId: string) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { type: err.type, message: err.message, request_id: requestId } }, {
      status: err.status,
      headers: jsonHeaders(requestId, err.headers),
    })
  }
  const stripe = describeStripeError(err)
  if (stripe.code !== "api_error") {
    return NextResponse.json({ error: { type: stripe.code, message: stripe.message, request_id: requestId } }, {
      status: stripe.status,
      headers: jsonHeaders(requestId),
    })
  }
  console.error(`[tollbooth] ${requestId}`, err)
  return NextResponse.json(
    { error: { type: "api_error", message: "Something went wrong on our side. Quote this request id if you contact support.", request_id: requestId } },
    { status: 500, headers: jsonHeaders(requestId) }
  )
}

/** Parses a JSON body, or `{}` when the body is empty. Non-JSON is a 400. */
function jsonReader(req: Request) {
  return async <T = Record<string, unknown>>(): Promise<T> => {
    const text = await req.text()
    if (!text) return {} as T
    try {
      const parsed = JSON.parse(text)
      if (parsed === null || typeof parsed !== "object") throw new Error("not an object")
      return parsed as T
    } catch {
      throw fail(400, "invalid_request_error", "Request body must be a JSON object")
    }
  }
}

/** Stable fingerprint of the body, so a reused key with a changed payload is caught. */
async function requestFingerprint(req: Request) {
  const raw = await req.clone().text()
  return createHash("sha256").update(`${req.method}\n${new URL(req.url).pathname}\n${raw}`).digest("hex")
}


// ---------------------------------------------------------------- serializers
// Every object Tollbooth returns has an `object` type, the way integrators expect
// from a JSON API. Money is always integer minor units plus a currency.

const unix = (date: Date) => Math.floor(date.getTime() / 1000)

export function serializePayment(p: PaymentRow) {
  return {
    object: "payment",
    id: p.id,
    mode: p.mode,
    status: p.status,
    amount: p.amount,
    amount_refunded: p.amountRefunded,
    currency: p.currency,
    application_fee: p.applicationFee,
    net_fee: p.netFee,
    description: p.description,
    customer: p.customerId,
    customer_email: p.customerEmail,
    reference: p.reference,
    metadata: p.metadata ?? {},
    source: p.source,
    /** Only a pending payment can still be paid, so only then is the URL useful. */
    checkout_url: p.status === "pending" ? p.checkoutUrl : null,
    success_url: p.successUrl,
    created: unix(p.createdAt),
    expires_at: p.expiresAt ? unix(p.expiresAt) : null,
    updated: unix(p.updatedAt),
  }
}

export function serializeRefund(r: RefundRow) {
  return {
    object: "refund",
    id: r.id,
    payment: r.paymentId,
    amount: r.amount,
    currency: r.currency,
    fee_returned: r.feeReturned,
    reason: r.reason,
    note: r.note,
    status: r.status,
    created: unix(r.createdAt),
  }
}

export function serializeCustomer(c: CustomerRow) {
  return {
    object: "customer",
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    metadata: c.metadata ?? {},
    total_spent: c.totalSpent,
    payment_count: c.paymentCount,
    first_paid_at: c.firstPaidAt ? unix(c.firstPaidAt) : null,
    last_paid_at: c.lastPaidAt ? unix(c.lastPaidAt) : null,
    created: unix(c.createdAt),
  }
}

export function serializeProduct(p: ProductRow) {
  return {
    object: "product",
    id: p.id,
    name: p.name,
    description: p.description,
    image_url: p.imageUrl,
    active: !!p.active,
    metadata: p.metadata ?? {},
    created: unix(p.createdAt),
  }
}

export function serializePrice(p: PriceRow, productName?: string | null) {
  return {
    object: "price",
    id: p.id,
    product: p.productId,
    product_name: productName ?? null,
    nickname: p.nickname,
    amount: p.amount,
    currency: p.currency,
    lookup_key: p.lookupKey,
    active: !!p.active,
    created: unix(p.createdAt),
  }
}

export function serializeLink(l: LinkRow, price?: PriceRow | null) {
  return {
    object: "payment_link",
    id: l.id,
    name: l.name,
    slug: l.slug,
    url: `/pay/${l.slug}`,
    price: l.priceId,
    amount: price?.amount ?? null,
    currency: price?.currency ?? null,
    allow_quantity: !!l.allowQuantity,
    success_url: l.successUrl,
    cancel_url: l.cancelUrl,
    active: !!l.active,
    view_count: l.viewCount,
    payment_count: l.paymentCount,
    created: unix(l.createdAt),
  }
}

export function serializeEndpoint(e: EndpointRow) {
  return {
    object: "webhook_endpoint",
    id: e.id,
    url: e.url,
    description: e.description,
    events: e.events ?? ["*"],
    mode: e.mode,
    enabled: !!e.enabled,
    status: e.enabled ? (e.failureCount > 0 ? "failing" : "active") : "disabled",
    last_delivery_status: e.lastDeliveryStatus,
    last_delivery_at: e.lastDeliveryAt ? unix(e.lastDeliveryAt) : null,
    failure_count: e.failureCount,
    created: unix(e.createdAt),
  }
}

export function serializeDelivery(d: DeliveryRow) {
  return {
    object: "event_delivery",
    id: d.id,
    endpoint: d.endpointId,
    event_id: d.eventId,
    event_type: d.eventType,
    status: d.status,
    attempts: d.attempts,
    response_status: d.responseStatus,
    error: d.error,
    next_attempt_at: d.nextAttemptAt ? unix(d.nextAttemptAt) : null,
    delivered_at: d.deliveredAt ? unix(d.deliveredAt) : null,
    created: unix(d.createdAt),
  }
}

// ------------------------------------------------------------------- responses

export function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  })
}

/**
 * Cursor pagination over `created_at`, newest first. `starting_after` takes the id of
 * the last row you saw; that row's timestamp becomes the boundary, so paging stays
 * stable even when new payments land while you're scrolling.
 *
 * One overload per collection, so each call site gets its exact row type back.
 */
export async function paginate(
  collection: "payments",
  tenantId: string,
  opts?: PageOptions,
  extra?: (SQL | undefined)[]
): Promise<Page<TbPayment>>
export async function paginate(
  collection: "refunds",
  tenantId: string,
  opts?: PageOptions,
  extra?: (SQL | undefined)[]
): Promise<Page<TbRefund>>
export async function paginate(
  collection: "customers",
  tenantId: string,
  opts?: PageOptions,
  extra?: (SQL | undefined)[]
): Promise<Page<TbCustomer>>
export async function paginate(
  collection: "products",
  tenantId: string,
  opts?: PageOptions,
  extra?: (SQL | undefined)[]
): Promise<Page<TbProduct>>
export async function paginate(
  collection: "prices",
  tenantId: string,
  opts?: PageOptions,
  extra?: (SQL | undefined)[]
): Promise<Page<TbPrice>>
export async function paginate(
  collection: "links",
  tenantId: string,
  opts?: PageOptions,
  extra?: (SQL | undefined)[]
): Promise<Page<TbLink>>
export async function paginate(
  collection: PaginatedTable,
  tenantId: string,
  opts: PageOptions = {},
  extra: (SQL | undefined)[] = []
): Promise<Page<{ id: string }>> {
  const table = paginatedTables[collection]
  const cols = getTableColumns(table) as Record<string, AnyPgColumn>
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20))
  const conditions: (SQL | undefined)[] = [eq(cols.tenantId!, tenantId), ...extra]

  if (opts.startingAfter) {
    const [cursor] = await db
      .select({ createdAt: cols.createdAt! })
      .from(table)
      .where(and(eq(cols.id!, opts.startingAfter), eq(cols.tenantId!, tenantId)))
    if (!cursor) throw fail(400, "invalid_request_error", `Unknown starting_after: ${opts.startingAfter}`)
    conditions.push(lt(cols.createdAt!, cursor.createdAt as Date))
  }

  // Over fetch by one to learn whether another page exists, without a second count.
  const rows = (await db
    .select()
    .from(table)
    .where(and(...conditions))
    .orderBy(desc(cols.createdAt!))
    .limit(limit + 1)) as { id: string }[]

  const data = rows.slice(0, limit)
  return {
    data: data as never,
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit ? (data.at(-1)?.id ?? null) : null,
  }
}

/** Standard list envelope, so paging looks the same for every collection. */
export function listBody<T>(data: T[], hasMore: boolean) {
  return { object: "list", data, has_more: hasMore }
}
