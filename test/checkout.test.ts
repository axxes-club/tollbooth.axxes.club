/**
 * Creating a checkout, and the lifecycle of the payment it produces.
 */
import { test, describe, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import { createCheckout, markSucceeded, markTerminal, NotReadyError, requireReadyAccount, CHECKOUT_TTL_SECONDS, safeUrl } from "@/lib/payments"
import { resetTestData, seedReadyAccount, sql, suiteFor } from "./helpers/db"
import { __stripe } from "./fakes/stripe"

const SUITE = suiteFor("checkout")
const TENANT = SUITE.tenant
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL not set"

describe("checkout", { skip }, () => {
  let account: string

  beforeEach(async () => {
    await resetTestData(SUITE)
    __stripe.reset()
    account = await seedReadyAccount(TENANT)
    __stripe.account(account)
  })
  after(() => resetTestData(SUITE))

  const ready = () =>
    createCheckout({
      tenantId: TENANT,
      mode: "test",
      amount: 2500,
      currency: "usd",
      description: "VIP ticket",
      successUrl: "https://yoursite.test/thanks",
      cancelUrl: "https://yoursite.test/cart",
    })

  test("blank return URLs use the hosted outcome pages", async () => {
    const payment = await createCheckout({ tenantId: TENANT, mode: "test", amount: 1000, currency: "usd", description: "Ticket", successUrl: "", cancelUrl: "" })
    const params = __stripe.calls("checkout.sessions.create")[0].args[0] as any
    assert.equal(new URL(params.success_url).pathname, `/pay/complete/${payment.id}`)
    assert.equal(new URL(params.cancel_url).pathname, `/pay/cancelled/${payment.id}`)
  })

  test("whitespace return URLs also use hosted outcomes", async () => {
    const payment = await createCheckout({ tenantId: TENANT, mode: "test", amount: 1000, currency: "usd", description: "Ticket", successUrl: "  ", cancelUrl: "  " })
    const params = __stripe.calls("checkout.sessions.create")[0].args[0] as any
    assert.equal(new URL(params.success_url).pathname, `/pay/complete/${payment.id}`)
  })

  test("a late success event cannot undo a refund or dispute", async () => {
    for (const status of ["partially_refunded", "refunded", "disputed"]) {
      const payment = await ready()
      await sql().query("update tollbooth_payments set status = $2 where id = $1", [payment.id, status])
      await markSucceeded(payment.id, {})
      const [row] = await sql().query("select status from tollbooth_payments where id = $1", [payment.id])
      assert.equal(row.status, status)
    }
  })

  test("concurrent success events roll up customer totals once", async () => {
    const [customer] = await sql().query("insert into tollbooth_customers (tenant_id, email) values ($1, 'race@example.com') returning id", [TENANT])
    const payment = await ready()
    await sql().query("update tollbooth_payments set customer_id = $2 where id = $1", [payment.id, customer.id])
    await Promise.all([markSucceeded(payment.id, {}), markSucceeded(payment.id, {}), markSucceeded(payment.id, {})])
    const [row] = await sql().query("select total_spent, payment_count from tollbooth_customers where id = $1", [customer.id])
    assert.equal(row.total_spent, 2500)
    assert.equal(row.payment_count, 1)
  })

  test("creates a payment and a Stripe checkout session", async () => {
    const payment = await ready()

    assert.equal(payment.status, "pending")
    assert.equal(payment.amount, 2500)
    assert.equal(payment.currency, "usd")
    assert.equal(payment.mode, "test")
    assert.ok(payment.checkoutUrl, "a hosted checkout URL is the whole point")
    assert.ok(payment.checkoutSessionId)

    const calls = __stripe.calls("checkout.sessions.create")
    assert.equal(calls.length, 1)
    const params = calls[0].args[0] as any
    assert.equal(params.mode, "payment")
    assert.equal(params.line_items[0].price_data.unit_amount, 2500)
    assert.equal(params.payment_intent_data.application_fee_amount, 25, "our fee is claimed at checkout")
    assert.equal(params.payment_intent_data.transfer_data, undefined, "no destination charge: Tollbooth never holds the money")
    const options = calls[0].args[1] as any
    assert.equal(options.stripeAccount, account, "the charge is created on the workspace's own Stripe account")
  })

  test("quantity multiplies the amount and the fee", async () => {
    const payment = await createCheckout({
      tenantId: TENANT, mode: "test", amount: 1000, currency: "usd",
      description: "Ticket", quantity: 3, successUrl: "https://a.test/t", cancelUrl: "https://a.test/c",
    })
    assert.equal(payment.amount, 3000, "the charge is per-unit times quantity")
    assert.equal(payment.applicationFee, 30)
  })

  test("refuses to charge a workspace that has no payout account", async () => {
    await sql().query(`delete from tollbooth_accounts where tenant_id = $1`, [TENANT])
    await assert.rejects(ready(), NotReadyError)
  })

  test("refuses a workspace Stripe says cannot take charges, and says why", async () => {
    // Readiness is our cached copy of the account state, refreshed by the sync action
    // and by `account.updated`. Stripe remains the backstop: it would reject the
    // charge, so a stale cache costs a failed request, never a wrong transfer.
    await sql().query(
      `update tollbooth_accounts set charges_enabled = 0, charges_disabled_reason = 'requirements.past_due' where tenant_id = $1`,
      [TENANT]
    )
    await assert.rejects(ready(), (err: NotReadyError) => {
      assert.match(err.message, /requirements\.past_due/, "the reason reaches the merchant")
      return true
    })
  })

  test("a Stripe failure marks the payment failed rather than leaving it hanging", async () => {
    __stripe.on("checkout.sessions.create", () => {
      throw Object.assign(new Error("Your card was declined"),{type:"StripeInvalidRequestError"})
    })
    await assert.rejects(ready(), /declined/)

    const rows = await sql().query(`select status, last_error from tollbooth_payments where tenant_id = $1`, [TENANT])
    assert.equal(rows[0].status, "failed", "a failed attempt stays visible, it isn't deleted")
    assert.match(rows[0].last_error, /declined/)
  })

  test("the checkout expiry stays inside Stripe's limit", () => {
    // Stripe rejects expires_at beyond 24 hours, which would fail the whole charge.
    assert.ok(CHECKOUT_TTL_SECONDS <= 60 * 60 * 24, "must not exceed Stripe's maximum")
    assert.ok(CHECKOUT_TTL_SECONDS > 60 * 60 * 23, "and should be close to it, or links expire early")
  })

  test("safeUrl requires https, except on loopback", () => {
    assert.equal(safeUrl("https://yoursite.test/thanks"), "https://yoursite.test/thanks")
    // The rule must not depend on NODE_ENV: a preview deploy or a misconfigured box
    // would otherwise post payment details over plaintext.
    assert.equal(safeUrl("http://yoursite.test"), null, "plain http to the internet is never allowed")
    assert.equal(safeUrl("http://localhost:3000/hook"), "http://localhost:3000/hook", "developers test locally")
    assert.equal(safeUrl("http://127.0.0.1:4321/hook"), "http://127.0.0.1:4321/hook")
    assert.equal(safeUrl("http://LOCALHOST/hook"), "http://localhost/hook", "hostname case is ignored")
  })

  test("safeUrl refuses other schemes and internal-looking hosts", () => {
    for (const value of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,<script>",
      "ftp://yoursite.test",
      "http://10.0.0.5/hook",
      "http://169.254.169.254/latest/meta-data",
    ]) {
      assert.equal(safeUrl(value), null, `accepted: ${value}`)
    }
    assert.ok(safeUrl("http://[::1]"), "IPv6 loopback is loopback")
    assert.equal(safeUrl("not a url"), null)
    assert.equal(safeUrl(undefined), null)
    assert.equal(safeUrl(42), null)
  })

  test("marking a payment paid is idempotent", async () => {
    const payment = await ready()

    const first = await markSucceeded(payment.id, { paymentIntentId: "pi_1" })
    assert.equal(first?.status, "succeeded")
    assert.equal(first?.paymentIntentId, "pi_1")

    const second = await markSucceeded(payment.id, { paymentIntentId: "pi_2" })
    assert.equal(second?.status, "succeeded")
    // A duplicate webhook must not overwrite what the first one recorded.
    assert.equal(second?.paymentIntentId, "pi_1")
  })

  test("a successful payment rolls up onto its customer exactly once", async () => {
    const [customer] = await sql().query(
      `insert into tollbooth_customers (tenant_id, email) values ($1, 'buyer@test') returning id`, [TENANT]
    )
    const payment = await createCheckout({
      tenantId: TENANT, mode: "test", amount: 2500, currency: "usd", description: "T",
      customerId: customer.id, successUrl: "https://a.test/t", cancelUrl: "https://a.test/c",
    })

    await markSucceeded(payment.id, {})
    await markSucceeded(payment.id, {}) // a retried webhook
    await markSucceeded(payment.id, {})

    const [after] = await sql().query(`select total_spent, payment_count from tollbooth_customers where id = $1`, [customer.id])
    assert.equal(after.total_spent, 2500, "the same payment must not be counted twice")
    assert.equal(after.payment_count, 1)
  })

  test("a paid payment is not walked back by a late failure event", async () => {
    const payment = await ready()
    await markSucceeded(payment.id, {})

    assert.equal(await markTerminal(payment.id, "failed", "late event"), null, "only a pending payment can fail")
    const [after] = await sql().query(`select status from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "succeeded")
  })

  test("markTerminal moves a pending payment, and only once", async () => {
    const payment = await ready()
    const expired = await markTerminal(payment.id, "expired", "expired unpaid")
    assert.equal(expired?.status, "expired")
    assert.equal(await markTerminal(payment.id, "failed"), null, "already terminal")
  })

  test("requireReadyAccount reports the unready workspace", async () => {
    await assert.rejects(requireReadyAccount("11111111-1111-4111-8111-111111111111"), NotReadyError)
  })
})
