/**
 * Stripe → Tollbooth.
 *
 * This is the path that turns a checkout into a paid record, so two things matter: a
 * forged or malformed request changes nothing, and a genuine event moves the payment
 * to the right terminal state exactly once.
 */
import { test, describe, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { POST } from "@/app/api/webhooks/stripe/route"
import { createCheckout } from "@/lib/payments"
import { resetTestData, seedReadyAccount, sql, suiteFor } from "./helpers/db"
import { __stripe } from "./fakes/stripe"

const SUITE = suiteFor("stripehook")
const TENANT = SUITE.tenant
/** A second workspace, for events that come from someone else's Stripe account. */
const OTHER = suiteFor("stripehook-other")
const SECRET = "whsec_stripe_inbound"
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL not set"

let eventSeq = 0
/** Stripe's event ids are unique per event, and so must these be. */
const nextId = (name: string) => `${SUITE.eventPrefix}${name}_${++eventSeq}`

describe("stripe webhook", { skip }, () => {
  let account: string

  beforeEach(async () => {
    await resetTestData(SUITE)
    await resetTestData(OTHER)
    __stripe.reset()
    process.env.STRIPE_WEBHOOK_SECRET = SECRET
    account = await seedReadyAccount(TENANT)
    __stripe.account(account)
  })
  after(async () => {
    await resetTestData(SUITE)
    await resetTestData(OTHER)
  })

  const send = (event: Record<string, unknown>, { secret = SECRET } = {}) => {
    const body = JSON.stringify(event)
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`
    return new Request("https://tollbooth.test/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      body,
    })
  }

  type Paid = { id: string; checkoutSessionId: string | null }
  const completed = (payment: Paid, id = nextId("completed"), extra: Record<string, unknown> = {}, from: string | null = account) => ({
    id,
    type: "checkout.session.completed",
    livemode: false,
    ...(from ? { account: from } : {}),
    data: {
      object: {
        id: payment.checkoutSessionId,
        payment_status: "paid",
        payment_intent: "pi_test_1",
        client_reference_id: payment.id,
        metadata: { tollbooth_payment_id: payment.id, tenant_id: TENANT },
        customer_details: { email: "buyer@test.com" },
        ...extra,
      },
    },
  })

  async function pendingPayment() {
    return createCheckout({
      tenantId: TENANT, mode: "test", amount: 2500, currency: "usd", description: "T",
      successUrl: "https://a.test/t", cancelUrl: "https://a.test/c",
    })
  }

  test("a forged or wrongly-signed request changes nothing", async () => {
    const payment = await pendingPayment()

    const unsigned = new Request("https://tollbooth.test/api/webhooks/stripe", { method: "POST", body: "{}" })
    assert.equal((await POST(unsigned)).status, 400)

    assert.equal((await POST(send(completed(payment), { secret: "whsec_wrong" }))).status, 400)

    const [after] = await sql().query(`select status from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "pending", "a payment must not be marked paid by a bad request")
  })

  test("a completed checkout marks the payment paid and records the buyer", async () => {
    const payment = await pendingPayment()
    const res = await POST(send(completed(payment)))
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { received: true, duplicate: false })

    const [after] = await sql().query(
      `select status, payment_intent_id, customer_email from tollbooth_payments where id = $1`, [payment.id]
    )
    assert.equal(after.status, "succeeded")
    assert.equal(after.payment_intent_id, "pi_test_1")
    assert.equal(after.customer_email, "buyer@test.com")
  })

  test("the same event delivered twice is applied once", async () => {
    const payment = await pendingPayment()
    // One id, sent twice: this is the retry Stripe performs, and the whole reason the
    // dedupe table exists.
    const event = completed(payment, nextId("retry"))

    assert.equal((await POST(send(event))).status, 200)
    const second = await POST(send(event))
    assert.equal(second.status, 200)
    assert.equal((await second.json()).duplicate, true)
  })

  test("an expired checkout is marked expired", async () => {
    const payment = await pendingPayment()
    await POST(send({
      id: nextId("expired"), type: "checkout.session.expired", livemode: false, account,
      data: { object: { id: payment.checkoutSessionId, client_reference_id: payment.id, metadata: { tollbooth_payment_id: payment.id } } },
    }))
    const [after] = await sql().query(`select status from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "expired")
  })

  test("a failed async payment is marked failed", async () => {
    const payment = await pendingPayment()
    await POST(send({
      id: nextId("failed"), type: "checkout.session.async_payment_failed", livemode: false, account,
      data: { object: { id: payment.checkoutSessionId, client_reference_id: payment.id, metadata: { tollbooth_payment_id: payment.id } } },
    }))
    const [after] = await sql().query(`select status from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "failed")
  })

  test("a payment still awaiting an async method is left pending", async () => {
    // `completed` can arrive before an async method settles; the async event decides.
    const payment = await pendingPayment()
    await POST(send(completed(payment, nextId("unpaid"), { payment_status: "unpaid" })))
    const [after] = await sql().query(`select status from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "pending")
  })

  test("a refund issued in Stripe's dashboard is reflected", async () => {
    const payment = await pendingPayment()
    await POST(send(completed(payment)))

    await POST(send({
      id: nextId("refunded"), type: "charge.refunded", livemode: false, account,
      data: { object: { id: "ch_1", payment_intent: "pi_test_1", amount_refunded: 1000, refunded: false, currency: "usd", amount: 2500 } },
    }))

    const [after] = await sql().query(`select status, amount_refunded, net_fee from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "partially_refunded")
    assert.equal(after.amount_refunded, 1000)
    assert.equal(after.net_fee, 15, "the fee is reduced in proportion to what was returned")
  })

  test("a dispute flags the payment so it can be acted on", async () => {
    const payment = await pendingPayment()
    await POST(send(completed(payment)))
    // A dispute references a charge, so the charge id has to be known first.
    await sql().query(`update tollbooth_payments set charge_id = 'ch_test_1' where id = $1`, [payment.id])

    await POST(send({
      id: nextId("dispute"), type: "charge.dispute.created", livemode: false, account,
      data: { object: { id: "dp_1", charge: "ch_test_1", amount: 2500, currency: "usd", reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1 } } },
    }))

    const [after] = await sql().query(`select status, last_error from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "disputed")
    assert.match(after.last_error, /fraudulent/)
  })

  test("account.updated syncs the workspace's readiness", async () => {
    await POST(send({
      id: nextId("account"), type: "account.updated", livemode: false, account,
      data: { object: { id: account, charges_enabled: false, payouts_enabled: false, details_submitted: true, country: "GB", default_currency: "gbp", requirements: { currently_due: ["company.tax_id"] } } },
    }))

    const [after] = await sql().query(
      `select charges_enabled, payouts_enabled, default_currency, requirements_due from tollbooth_accounts where tenant_id = $1`, [TENANT]
    )
    assert.equal(after.charges_enabled, 0, "Stripe is the authority on whether charges work")
    assert.equal(after.default_currency, "gbp")
    assert.deepEqual(after.requirements_due, ["company.tax_id"], "what Stripe still needs is surfaced")
  })

  test("only the workspace's own Stripe account can settle its payment", async () => {
    const payment = await pendingPayment()
    const other = await seedReadyAccount(OTHER.tenant)

    // Another workspace's account, an event naming no account, and a session
    // Tollbooth didn't open all carry this payment's id in metadata. None of them
    // is proof that this workspace was paid.
    assert.equal((await POST(send(completed(payment, nextId("other"), {}, other)))).status, 200)
    assert.equal((await POST(send(completed(payment, nextId("noacct"), {}, null)))).status, 200)
    assert.equal((await POST(send(completed({ ...payment, checkoutSessionId: "cs_forged" }, nextId("forged"))))).status, 200)

    const [after] = await sql().query(`select status from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "pending")
  })

  test("a refund on another account doesn't touch this workspace's payment", async () => {
    const payment = await pendingPayment()
    await POST(send(completed(payment)))
    const other = await seedReadyAccount(OTHER.tenant)

    await POST(send({
      id: nextId("otherrefund"), type: "charge.refunded", livemode: false, account: other,
      data: { object: { id: "ch_1", payment_intent: "pi_test_1", amount_refunded: 2500, refunded: true, currency: "usd", amount: 2500 } },
    }))
    const [after] = await sql().query(`select status, amount_refunded from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "succeeded")
    assert.equal(after.amount_refunded, 0)
  })

  test("an event for a payment we do not have is harmless", async () => {
    const res = await POST(send(completed({ id: "11111111-1111-4111-8111-111111111111", checkoutSessionId: "cs_unknown" })))
    assert.equal(res.status, 200)
  })

  test("an event we do not act on is still recorded", async () => {
    const id = nextId("unknown")
    assert.equal((await POST(send({ id, type: "customer.created", livemode: false, data: { object: {} } }))).status, 200)
    const rows = await sql().query(`select type from tollbooth_events where id = $1`, [id])
    assert.equal(rows[0].type, "customer.created")
  })
})
