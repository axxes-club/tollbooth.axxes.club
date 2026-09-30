/**
 * Outbound webhook delivery, against a real local HTTP server.
 *
 * Three things have to be right: a genuine event is delivered with a signature the
 * receiver can verify, a broken receiver is retried rather than silently dropped,
 * and a permanently dead endpoint is switched off instead of being retried forever.
 */
import { test, describe, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { emit, deliver, deliverPending, replayDelivery, verifySignature, MAX_ATTEMPTS } from "@/lib/webhooks"
import { resetTestData, sql, suiteFor } from "./helpers/db"

const SUITE = suiteFor("delivery")
const TENANT = SUITE.tenant
const SECRET = "whsec_delivery_test"
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL not set"

let server: Server
let received: { body: string; headers: Record<string, unknown> }[] = []
let respondWith: () => number = () => 200

describe("webhook delivery", { skip }, () => {
  beforeEach(async () => {
    await resetTestData(SUITE)
    received = []
    respondWith = () => 200
    if (!server) {
      server = createServer((req, res) => {
        let body = ""
        req.on("data", (chunk) => (body += chunk))
        req.on("end", () => {
          received.push({ body, headers: req.headers as Record<string, unknown> })
          res.writeHead(respondWith()).end("ok")
        })
      })
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    }
  })

  after(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await resetTestData(SUITE)
  })

  const url = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`

  async function makeEndpoint(events: string[] = ["*"], enabled = true, mode = "test") {
    const rows = await sql().query(
      `insert into tollbooth_webhook_endpoints (tenant_id, url, description, secret, events, mode, enabled, created_by_id)
       values ($1, $2, 'test', $3, $4, $5, $6, 'test') returning id`,
      [TENANT, url(), SECRET, JSON.stringify(events), mode, enabled ? 1 : 0]
    )
    return rows[0].id as string
  }

  test("an event is delivered to a subscribed endpoint", async () => {
    await makeEndpoint(["payment.succeeded"])
    await emit("payment.succeeded", TENANT, "test", { id: "pay_1", status: "succeeded" })
    const results = await deliverPending()

    assert.equal(results.filter((r) => r?.ok).length, 1)
    assert.equal(received.length, 1)
    const event = JSON.parse(received[0].body)
    assert.equal(event.type, "payment.succeeded")
    assert.equal(event.data.object.id, "pay_1")
    assert.equal(event.mode, "test")
  })

  test("the delivery carries a signature the receiver can verify", async () => {
    await makeEndpoint(["payment.succeeded"])
    await emit("payment.succeeded", TENANT, "test", { id: "pay_1" })
    await deliverPending()

    const header = received[0].headers["tollbooth-signature"] as string
    assert.ok(header, "a signature header is required")
    assert.equal(verifySignature(SECRET, header, received[0].body).ok, true, "the receiver can verify it")
    assert.equal(verifySignature("whsec_wrong", header, received[0].body).ok, false)
  })

  test("the standard headers are present", async () => {
    await makeEndpoint()
    await emit("payment.succeeded", TENANT, "test", { id: "pay_1" })
    await deliverPending()

    const h = received[0].headers
    assert.equal(h["tollbooth-event-type"], "payment.succeeded")
    assert.match(String(h["tollbooth-event-id"]), /^evt_/)
    assert.ok(h["tollbooth-delivery-id"])
    assert.equal(h["tollbooth-attempt"], "1")
    assert.match(String(h["content-type"]), /application\/json/)
  })

  test("an endpoint subscribed to other events is left alone", async () => {
    await makeEndpoint(["refund.created"])
    await emit("payment.succeeded", TENANT, "test", { id: "pay_1" })
    await deliverPending()
    assert.equal(received.length, 0, "no delivery for an unsubscribed event")
  })

  test("a wildcard endpoint receives everything", async () => {
    await makeEndpoint(["*"])
    await emit("payment.succeeded", TENANT, "test", {})
    await emit("refund.created", TENANT, "test", {})
    await deliverPending()
    assert.equal(received.length, 2)
  })

  test("a disabled endpoint receives nothing", async () => {
    await makeEndpoint(["*"], false)
    await emit("payment.succeeded", TENANT, "test", {})
    await deliverPending()
    assert.equal(received.length, 0)
  })

  test("an event is not delivered across modes", async () => {
    await makeEndpoint(["*"], true, "live")
    await emit("payment.succeeded", TENANT, "test", {})
    await deliverPending()
    assert.equal(received.length, 0, "a test event must not reach a live endpoint")
  })

  test("a failing endpoint is retried rather than dropped", async () => {
    await makeEndpoint()
    respondWith = () => 500
    await emit("payment.succeeded", TENANT, "test", {})
    await deliverPending()

    const [row] = await sql().query(
      `select status, attempts, error, next_attempt_at from tollbooth_webhook_deliveries where tenant_id = $1`, [TENANT]
    )
    assert.equal(row.status, "pending", "still queued for another attempt")
    assert.equal(row.attempts, 1)
    assert.match(row.error, /500/)
    assert.ok(row.next_attempt_at, "a retry is scheduled")
  })

  test("retries stop after the last attempt and the endpoint is switched off", async () => {
    const endpointId = await makeEndpoint()
    respondWith = () => 503
    await emit("payment.succeeded", TENANT, "test", {})

    const [delivery] = await sql().query(`select id from tollbooth_webhook_deliveries where tenant_id = $1`, [TENANT])
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Force the retry to be due rather than waiting out the backoff.
      await sql().query(`update tollbooth_webhook_deliveries set next_attempt_at = now() where id = $1`, [delivery.id])
      await deliver(delivery.id)
    }

    const [row] = await sql().query(`select status, attempts from tollbooth_webhook_deliveries where id = $1`, [delivery.id])
    assert.equal(row.status, "failed")
    assert.equal(row.attempts, MAX_ATTEMPTS)

    const [endpoint] = await sql().query(`select enabled, last_delivery_status from tollbooth_webhook_endpoints where id = $1`, [endpointId])
    assert.equal(endpoint.enabled, 0, "a dead URL must stop costing requests")
    assert.equal(endpoint.last_delivery_status, "failed")
  })

  test("a success clears the endpoint's failure count", async () => {
    const endpointId = await makeEndpoint()
    await sql().query(`update tollbooth_webhook_endpoints set failure_count = 3 where id = $1`, [endpointId])

    await emit("payment.succeeded", TENANT, "test", {})
    await deliverPending()

    const [endpoint] = await sql().query(`select failure_count, last_delivery_status from tollbooth_webhook_endpoints where id = $1`, [endpointId])
    assert.equal(endpoint.failure_count, 0)
    assert.equal(endpoint.last_delivery_status, "delivered")
  })

  test("a delivery can be replayed by hand", async () => {
    await makeEndpoint()
    respondWith = () => 500
    await emit("payment.succeeded", TENANT, "test", { id: "pay_1" })
    await deliverPending()

    respondWith = () => 200
    const [delivery] = await sql().query(`select id from tollbooth_webhook_deliveries where tenant_id = $1`, [TENANT])
    const result = await replayDelivery(delivery.id, TENANT)

    assert.equal(result?.ok, true)
    assert.equal(received.length, 2, "the event is sent again")
    const [row] = await sql().query(`select status from tollbooth_webhook_deliveries where id = $1`, [delivery.id])
    assert.equal(row.status, "delivered")
  })

  test("another workspace cannot replay a delivery", async () => {
    await makeEndpoint()
    await emit("payment.succeeded", TENANT, "test", {})
    await deliverPending()
    const [delivery] = await sql().query(`select id from tollbooth_webhook_deliveries where tenant_id = $1`, [TENANT])
    assert.equal(await replayDelivery(delivery.id, "11111111-1111-4111-8111-111111111111"), null)
  })

  test("a delivery is sent once, even if the queue is drained twice", async () => {
    await makeEndpoint()
    await emit("payment.succeeded", TENANT, "test", {})
    await deliverPending()
    await deliverPending()
    assert.equal(received.length, 1, "a delivered event is not re-sent on the next drain")
  })

  test("an unreachable endpoint fails without throwing", async () => {
    // Port 1 is reserved; nothing will be listening.
    await sql().query(
      `insert into tollbooth_webhook_endpoints (tenant_id, url, description, secret, events, mode, enabled, created_by_id)
       values ($1, 'http://127.0.0.1:1/hook', 'test', $2, '["*"]', 'test', 1, 'test')`,
      [TENANT, SECRET]
    )
    await emit("payment.succeeded", TENANT, "test", {})
    const results = await deliverPending()

    assert.equal(results.length, 1)
    assert.equal(results[0]?.ok, false)
    assert.match(String(results[0]?.error), /reach/i)
  })
})
