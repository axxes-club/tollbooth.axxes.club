/**
 * The v1 API surface, exercised by calling the real route handlers.
 *
 * These cover the wrappers every endpoint inherits — auth, scopes, rate limits,
 * idempotency, request ids — plus the validation each one is responsible for.
 */
import { test, describe, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import { POST as checkout } from "@/app/api/v1/checkout-sessions/route"
import { GET as listPayments } from "@/app/api/v1/payments/route"
import { GET as getPayment } from "@/app/api/v1/payments/[id]/route"
import { POST as createCustomer } from "@/app/api/v1/customers/route"
import { POST as createRefund } from "@/app/api/v1/refunds/route"
import { POST as createProduct } from "@/app/api/v1/products/route"
import { POST as createPrice } from "@/app/api/v1/prices/route"
import { GET as listPrices } from "@/app/api/v1/prices/route"
import { POST as createEndpoint } from "@/app/api/v1/webhook-endpoints/route"
import { GET as listEndpoints } from "@/app/api/v1/webhook-endpoints/route"
import { GET as getHealth } from "@/app/api/v1/health/route"
import { GET as getBalance } from "@/app/api/v1/balance/route"
import { resetTestData, seedReadyAccount, sql, suiteFor } from "./helpers/db"
import { call, mintApiKey } from "./helpers/api"
import { __stripe } from "./fakes/stripe"

const SUITE = suiteFor("api")
const TENANT = SUITE.tenant
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL not set"

describe("api", { skip }, () => {
  let key: string

  beforeEach(async () => {
    await resetTestData(SUITE)
    __stripe.reset()
    __stripe.account(await seedReadyAccount(TENANT))
    key = await mintApiKey(TENANT)
  })
  after(() => resetTestData(SUITE))

  describe("authentication", () => {
    test("a missing key is a 401 with a machine-readable type", async () => {
      const res = await call(listPayments)
      assert.equal(res.status, 401)
      assert.equal(res.body.error.type, "authentication_error")
      assert.ok(res.body.error.request_id, "every error carries a request id")
    })

    test("an unknown key is rejected", async () => {
      assert.equal((await call(listPayments, { key: "tb_live_" + "x".repeat(32) })).status, 401)
    })

    test("another vendor's key is not accepted", async () => {
      assert.equal((await call(listPayments, { key: "sk_live_" + "x".repeat(32) })).status, 401)
    })

    test("a test key cannot authenticate as live, even with a valid hash", async () => {
      // The mode is in the key prefix, so a live-labelled request carrying a test key
      // must fail closed rather than fall through to the test-mode row.
      const res = await call(listPayments, { key: "tb_live_" + key.split("tb_test_")[1] })
      assert.equal(res.status, 401)
    })

    test("a revoked key stops working", async () => {
      await sql().query(`update tollbooth_api_keys set revoked_at = now() where tenant_id = $1`, [TENANT])
      assert.equal((await call(listPayments, { key })).status, 401)
    })

    test("the scheme is matched case-insensitively", async () => {
      const res = await call(listPayments, { headers: { authorization: `bearer ${key}` } })
      assert.equal(res.status, 200)
    })
  })

  describe("scopes", () => {
    test("a key without the scope gets a 403, naming the scope", async () => {
      const readOnly = await mintApiKey(TENANT, "test", ["payments:read"])
      const res = await call(createRefund, { method: "POST", key: readOnly, body: { payment_id: "x" } })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.type, "insufficient_scope")
      assert.match(res.body.error.message, /refunds:write/)
    })

    test("a read-only key cannot create a product", async () => {
      const readOnly = await mintApiKey(TENANT, "test", ["payments:read"])
      assert.equal((await call(createProduct, { method: "POST", key: readOnly, body: { name: "Nope" } })).status, 403)
    })

    test("a write key can also read", async () => {
      assert.equal((await call(listPayments, { key })).status, 200)
    })
  })

  describe("request metadata", () => {
    test("responses carry a request id and are never cached", async () => {
      const res = await call(listPayments, { key })
      assert.ok(res.header("x-request-id")?.startsWith("req_"))
      assert.equal(res.header("cache-control"), "no-store")
    })

    test("a client-supplied request id is echoed back", async () => {
      const res = await call(listPayments, { key, headers: { "x-request-id": "req_mine" } })
      assert.equal(res.header("x-request-id"), "req_mine")
    })

    test("rate-limit state is reported", async () => {
      const res = await call(listPayments, { key })
      assert.equal(res.header("x-ratelimit-limit"), "300")
      assert.ok(Number(res.header("x-ratelimit-remaining")) >= 0)
    })

    test("errors carry the rate-limit headers too", async () => {
      const res = await call(getPayment, { key, path: "/api/v1/payments/nope", params: { id: "nope" } })
      assert.equal(res.status, 404)
      assert.ok(res.header("x-ratelimit-limit"), "so a client can back off from a failure too")
    })
  })

  describe("validation", () => {
    test("a non-uuid id is a 404, not a database error", async () => {
      const res = await call(getPayment, { key, path: "/api/v1/payments/not-a-uuid", params: { id: "not-a-uuid" } })
      assert.equal(res.status, 404)
      assert.equal(res.body.error.type, "resource_missing")
    })

    test("a malformed body is a 400 naming the problem", async () => {
      const res = await call(createCustomer, { method: "POST", key, body: "{not json" })
      assert.equal(res.status, 400)
      assert.match(res.body.error.message, /JSON object/)
    })

    test("an invalid email is refused", async () => {
      assert.equal((await call(createCustomer, { method: "POST", key, body: { email: "not-an-email" } })).status, 400)
    })

    test("an email is normalised, so the same person is not duplicated", async () => {
      await call(createCustomer, { method: "POST", key, body: { email: "Buyer@Example.COM" } })
      const res = await call(createCustomer, { method: "POST", key, body: { email: "buyer@example.com" } })
      assert.equal(res.body.email, "buyer@example.com")
    })

    test("an amount below the minimum is refused", async () => {
      const res = await call(createPrice, { method: "POST", key, body: { amount: 10 } })
      assert.equal(res.status, 400)
      assert.match(res.body.error.message, /at least 50/)
    })

    test("an unsupported currency is refused, and says what is supported", async () => {
      for (const handler of [createPrice, checkout]) {
        const body = handler === checkout ? { amount: 1000, description: "T", currency: "xyz" } : { amount: 1000, currency: "xyz" }
        const res = await call(handler, { method: "POST", key, body })
        assert.equal(res.status, 400, "both endpoints should reject it")
        assert.match(res.body.error.message, /usd/, "and both should list what is allowed")
      }
    })

    test("an unknown status filter is rejected with the valid set", async () => {
      const res = await call(listPayments, { key, path: "/api/v1/payments?status=exploded" })
      assert.equal(res.status, 400)
      assert.match(res.body.error.message, /succeeded/)
    })

    test("a bad starting_after is a 400 rather than a crash", async () => {
      assert.equal((await call(listPayments, { key, path: "/api/v1/payments?starting_after=oops" })).status, 400)
    })

    test("a duplicate lookup_key is a 409", async () => {
      await call(createPrice, { method: "POST", key, body: { amount: 1000, lookup_key: "vip" } })
      const res = await call(createPrice, { method: "POST", key, body: { amount: 2000, lookup_key: "vip" } })
      assert.equal(res.status, 409)
      assert.equal(res.body.error.type, "lookup_key_taken")
    })

    test("a product needs a name", async () => {
      assert.equal((await call(createProduct, { method: "POST", key, body: {} })).status, 400)
    })
  })

  describe("checkout", () => {
    test("a workspace without payouts is told to finish onboarding", async () => {
      await sql().query(`delete from tollbooth_accounts where tenant_id = $1`, [TENANT])
      const res = await call(checkout, { method: "POST", key, body: { amount: 2500, description: "T" } })
      assert.equal(res.status, 409)
      assert.equal(res.body.error.type, "account_not_ready")
    })

    test("a description is required when no price is given", async () => {
      const res = await call(checkout, { method: "POST", key, body: { amount: 2500 } })
      assert.equal(res.status, 400)
      assert.match(res.body.error.message, /description/)
    })

    test("creating a checkout returns a hosted URL and records the fee", async () => {
      const res = await call(checkout, {
        method: "POST", key,
        body: { amount: 2500, description: "VIP ticket", customer_email: "b@example.com", reference: "order_1" },
      })
      assert.equal(res.status, 201)
      assert.equal(res.body.object, "payment")
      assert.equal(res.body.status, "pending")
      assert.equal(res.body.amount, 2500)
      assert.equal(res.body.application_fee, 25)
      assert.ok(res.body.checkout_url)
      assert.equal(res.body.reference, "order_1")
      assert.equal(res.body.mode, "test", "the key's mode is carried onto the payment")
    })

    test("a price reference takes the amount from the server, not the client", async () => {
      const price = await call(createPrice, { method: "POST", key, body: { amount: 4200, lookup_key: "early" } })
      assert.equal(price.status, 201)

      const res = await call(checkout, { method: "POST", key, body: { price: "early", amount: 1 } })
      assert.equal(res.status, 201)
      assert.equal(res.body.amount, 4200, "the client's amount is ignored when a price is named")
    })

    test("a price that does not exist is a 404", async () => {
      assert.equal((await call(checkout, { method: "POST", key, body: { price: "nope" } })).status, 404)
    })

    test("quantity multiplies the charge", async () => {
      const res = await call(checkout, { method: "POST", key, body: { amount: 1000, description: "T", quantity: 3 } })
      assert.equal(res.body.amount, 3000)
      assert.equal(res.body.application_fee, 30)
    })

    test("an out-of-range quantity is refused", async () => {
      assert.equal((await call(checkout, { method: "POST", key, body: { amount: 1000, description: "T", quantity: 0 } })).status, 400)
      assert.equal((await call(checkout, { method: "POST", key, body: { amount: 1000, description: "T", quantity: 100 } })).status, 400)
    })
  })

  describe("idempotency", () => {
    test("a replayed key returns the first response rather than creating a second", async () => {
      const body = { amount: 2500, description: "T" }
      const first = await call(checkout, { method: "POST", key, body, headers: { "idempotency-key": "order_9" } })
      const second = await call(checkout, { method: "POST", key, body, headers: { "idempotency-key": "order_9" } })

      assert.equal(first.status, 201)
      assert.equal(second.body.id, first.body.id, "the same payment is returned")
      assert.equal(second.header("idempotent-replay"), "true")
      assert.equal(first.header("idempotent-replay"), "false")

      const rows = await sql().query(`select count(*)::int as n from tollbooth_payments where tenant_id = $1`, [TENANT])
      assert.equal(rows[0].n, 1, "only one payment exists")
    })

    test("a replay keeps the rate-limit headers", async () => {
      const body = { amount: 2500, description: "T" }
      await call(checkout, { method: "POST", key, body, headers: { "idempotency-key": "hdrs" } })
      const replay = await call(checkout, { method: "POST", key, body, headers: { "idempotency-key": "hdrs" } })
      assert.ok(replay.header("x-ratelimit-limit"), "headers must not vanish on a replay")
    })

    test("the same key with a different body is refused", async () => {
      await call(checkout, { method: "POST", key, body: { amount: 2500, description: "A" }, headers: { "idempotency-key": "reused" } })
      const res = await call(checkout, { method: "POST", key, body: { amount: 9999, description: "B" }, headers: { "idempotency-key": "reused" } })
      assert.equal(res.status, 400)
      assert.match(res.body.error.message, /different request body/)
    })

    test("a failed request does not burn the key", async () => {
      const bad = await call(checkout, { method: "POST", key, body: { amount: 2500 }, headers: { "idempotency-key": "retry-me" } })
      assert.equal(bad.status, 400)
      const good = await call(checkout, { method: "POST", key, body: { amount: 2500, description: "T" }, headers: { "idempotency-key": "retry-me" } })
      assert.equal(good.status, 201)
    })

    test("an over-long key is refused", async () => {
      const res = await call(createCustomer, { method: "POST", key, body: { email: "a@b.test" }, headers: { "idempotency-key": "x".repeat(300) } })
      assert.equal(res.status, 400)
    })
  })

  describe("listing and pagination", () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await call(checkout, { method: "POST", key, body: { amount: 1000 + i, description: `P${i}` } })
      }
    })

    test("payments come back newest first", async () => {
      const res = await call(listPayments, { key })
      assert.equal(res.body.object, "list")
      assert.equal(res.body.data.length, 5)
      assert.equal(res.body.data[0].amount, 1004, "the most recent first")
    })

    test("the limit is honoured and has_more reflects the rest", async () => {
      const res = await call(listPayments, { key, path: "/api/v1/payments?limit=2" })
      assert.equal(res.body.data.length, 2)
      assert.equal(res.body.has_more, true)
    })

    test("paging by cursor visits every payment exactly once", async () => {
      const seen: string[] = []
      let cursor: string | null = null
      for (let page = 0; page < 10; page++) {
        const path = `/api/v1/payments?limit=2${cursor ? `&starting_after=${cursor}` : ""}`
        const res = await call(listPayments, { key, path })
        seen.push(...res.body.data.map((p: any) => p.id))
        if (!res.body.has_more) break
        cursor = res.body.data.at(-1).id
      }
      assert.equal(seen.length, 5)
      assert.equal(new Set(seen).size, 5, "no duplicates across pages")
    })

    test("status filters work, including several at once", async () => {
      await sql().query(`update tollbooth_payments set status = 'succeeded' where tenant_id = $1`, [TENANT])
      await sql().query(`update tollbooth_payments set status = 'failed' where description = 'P0'`)

      assert.equal((await call(listPayments, { key, path: "/api/v1/payments?status=succeeded" })).body.data.length, 4)
      const many = await call(listPayments, { key, path: "/api/v1/payments?status=succeeded,failed" })
      assert.equal(many.body.data.length, 5, "both statuses are matched, not just the first")
    })

    test("a payment is only visible to its own workspace", async () => {
      const other = "11111111-1111-4111-8111-111111111111"
      await sql().query(`update tollbooth_payments set tenant_id = $2 where tenant_id = $1`, [TENANT, other])
      assert.equal((await call(listPayments, { key })).body.data.length, 0)
      await sql().query(`update tollbooth_payments set tenant_id = $1 where tenant_id = $2`, [TENANT, other])
    })
  })

  describe("webhook endpoints", () => {
    test("creating one returns a secret exactly once", async () => {
      const res = await call(createEndpoint, { method: "POST", key, body: { url: "https://yoursite.test/hook" } })
      assert.equal(res.status, 201)
      assert.ok(res.body.secret?.startsWith("whsec_"))

      const stored = await sql().query(`select secret from tollbooth_webhook_endpoints where tenant_id = $1`, [TENANT])
      assert.equal(stored[0].secret, res.body.secret)
      assert.equal((await call(listEndpoints, { key })).body.data[0].secret, undefined, "listing must not leak it")
    })

    test("plain http to the internet is refused", async () => {
      assert.equal((await call(createEndpoint, { method: "POST", key, body: { url: "http://yoursite.test/hook" } })).status, 400)
    })

    test("a non-web URL is refused", async () => {
      assert.equal((await call(createEndpoint, { method: "POST", key, body: { url: "file:///etc/passwd" } })).status, 400)
    })

    test("an unknown event name is refused, listing the valid ones", async () => {
      const res = await call(createEndpoint, { method: "POST", key, body: { url: "https://a.test/h", events: ["payment.exploded"] } })
      assert.equal(res.status, 400)
      assert.match(res.body.error.message, /payment\.succeeded/)
    })
  })

  describe("balance", () => {
    test("reports the workspace's real balance and next payout", async () => {
      const res = await call(getBalance, { key })
      assert.equal(res.status, 200)
      assert.equal(res.body.object, "balance")
      assert.equal(typeof res.body.available, "number")
      assert.equal(res.body.payouts_enabled, true)
      assert.ok(res.body.fee, "the fee is shown so the net figure is meaningful")
    })

    test("is a 409 when payouts are not set up", async () => {
      await sql().query(`delete from tollbooth_accounts where tenant_id = $1`, [TENANT])
      const res = await call(getBalance, { key })
      assert.equal(res.status, 409)
      assert.equal(res.body.error.type, "account_not_ready")
    })
  })

  describe("health", () => {
    test("needs no key and reports configuration without secrets", async () => {
      const res = await call(getHealth)
      assert.equal(res.status, 200)
      assert.equal(res.body.object, "health")
      assert.equal(typeof res.body.stripe_configured, "boolean")
      assert.equal(res.text.includes("sk_"), false, "no key material may appear in a public response")
    })
  })
})
