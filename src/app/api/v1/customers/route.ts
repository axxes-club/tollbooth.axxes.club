import { and, eq, like, or, type SQL } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { fail, jsonResponse, listBody, paginate, serializeCustomer, withApi } from "@/lib/api"
import { emit } from "@/lib/webhooks"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** GET /api/v1/customers — newest first. Search with `?email=` or `?q=`. */
export const GET = withApi(async ({ url, caller }) => {
  const params = url.searchParams
  const filters: (SQL | undefined)[] = []
  const email = params.get("email")
  const q = params.get("q")
  if (email) filters.push(eq(schema.tollboothCustomers.email, email))
  if (q) {
    const pattern = `%${q}%`
    filters.push(or(like(schema.tollboothCustomers.name, pattern), like(schema.tollboothCustomers.email, pattern)))
  }

  const { data, hasMore } = await paginate("customers", caller.tenantId, {
    limit: Number(params.get("limit")) || 20,
    startingAfter: params.get("starting_after"),
  }, filters)
  return jsonResponse(listBody(data.map(serializeCustomer), hasMore))
}, { scope: "payments:read" })

/** POST /api/v1/customers — save a buyer so later checkouts can reuse their details. */
export const POST = withApi(async ({ caller, json }) => {
  const body = await json<{ email?: string; name?: string; phone?: string; metadata?: Record<string, string> }>()
  const email = String(body.email ?? "").trim().toLowerCase()
  if (!EMAIL.test(email)) throw fail(400, "invalid_request_error", "A valid email is required")

  const [customer] = await db
    .insert(schema.tollboothCustomers)
    .values({
      tenantId: caller.tenantId,
      email,
      name: body.name?.trim().slice(0, 200) ?? null,
      phone: body.phone?.trim().slice(0, 40) ?? null,
      metadata: body.metadata ?? {},
    })
    .returning()

  await emit("customer.created", caller.tenantId, caller.mode, serializeCustomer(customer!)).catch((e) =>
    console.error("[tollbooth] customer.created emit failed", e)
  )
  return jsonResponse(serializeCustomer(customer!), 201)
}, { scope: "payments:write" })
