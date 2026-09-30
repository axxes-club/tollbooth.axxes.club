/**
 * Refunds: the fee arithmetic, the reservation that prevents an over-refund, and
 * the failure path that has to hand the reservation back.
 */
import { test, describe, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import { createRefund, RefundError } from "@/lib/refunds"
import { createCheckout, markSucceeded } from "@/lib/payments"
import { resetTestData, seedReadyAccount, sql, suiteFor } from "./helpers/db"
import { __stripe } from "./fakes/stripe"

const SUITE = suiteFor("refunds")
const TENANT = SUITE.tenant
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL not set"

describe("refunds", { skip }, () => {
  beforeEach(async () => {
    await resetTestData(SUITE)
    __stripe.reset()
    __stripe.account(await seedReadyAccount(TENANT))
  })
  after(() => resetTestData(SUITE))

  async function paidPayment(amount = 2500) {
    const payment = await createCheckout({
      tenantId: TENANT, mode: "test", amount, currency: "usd", description: "Ticket",
      successUrl: "https://a.test/t", cancelUrl: "https://a.test/c",
    })
    return (await markSucceeded(payment.id, { paymentIntentId: `pi_${payment.id.slice(0, 8)}` }))!
  }

  test("refuses a payment that does not exist in this workspace", async () => {
    await assert.rejects(
      createRefund({ tenantId: TENANT, paymentId: "11111111-1111-4111-8111-111111111111", createdByKind: "api" }),
      RefundError
    )
  })

  test("refuses a payment that was never paid", async () => {
    const payment = await createCheckout({
      tenantId: TENANT, mode: "test", amount: 2500, currency: "usd", description: "T",
      successUrl: "https://a.test/t", cancelUrl: "https://a.test/c",
    })
    await assert.rejects(createRefund({ tenantId: TENANT, paymentId: payment.id, createdByKind: "api" }), (e: RefundError) => {
      assert.equal(e.type, "payment_not_refundable")
      return true
    })
  })

  test("a full refund returns the whole amount and the whole fee", async () => {
    const payment = await paidPayment(2500)
    const refund = await createRefund({ tenantId: TENANT, paymentId: payment.id, createdByKind: "api" })

    assert.equal(refund.amount, 2500)
    assert.equal(refund.feeReturned, 25, "the merchant gets their fee back")
    assert.equal(refund.status, "succeeded")

    const [after] = await sql().query(`select status, amount_refunded, net_fee from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "refunded")
    assert.equal(after.amount_refunded, 2500)
    assert.equal(after.net_fee, 0, "nothing is kept on a fully refunded payment")
  })

  test("asks Stripe to reverse the transfer and return the application fee", async () => {
    const payment = await paidPayment()
    await createRefund({ tenantId: TENANT, paymentId: payment.id, createdByKind: "api" })

    const params = __stripe.calls("refunds.create")[0].args[0] as any
    assert.equal(params.reverse_transfer, true, "money must go back to the merchant, not to us")
    assert.equal(params.refund_application_fee, true, "our fee must come back too")
    assert.equal(params.payment_intent, payment.paymentIntentId)
  })

  test("a partial refund leaves the payment partially refunded", async () => {
    const payment = await paidPayment(2500)
    await createRefund({ tenantId: TENANT, paymentId: payment.id, amount: 1000, createdByKind: "api" })

    const [after] = await sql().query(`select status, amount_refunded, net_fee from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.status, "partially_refunded")
    assert.equal(after.amount_refunded, 1000)
    assert.equal(after.net_fee, 15, "25 charged, 10 returned")
  })

  test("splitting a payment never returns more fee than was charged", async () => {
    const payment = await paidPayment(2500)
    for (const slice of [1250, 1250]) {
      await createRefund({ tenantId: TENANT, paymentId: payment.id, amount: slice, createdByKind: "api" })
    }
    const [after] = await sql().query(`select amount_refunded, application_fee, net_fee from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.amount_refunded, 2500)
    assert.equal(after.net_fee, 0, "25 charged, 25 returned, nothing kept")
  })

  test("refunds more than the payment holds are refused", async () => {
    const payment = await paidPayment(2500)
    await assert.rejects(createRefund({ tenantId: TENANT, paymentId: payment.id, amount: 3000, createdByKind: "api" }), (e: RefundError) => {
      assert.equal(e.status, 400)
      assert.match(e.message, /2500 of this payment is left/)
      return true
    })
  })

  test("the same money cannot be refunded twice", async () => {
    const payment = await paidPayment(2500)
    await createRefund({ tenantId: TENANT, paymentId: payment.id, amount: 2500, createdByKind: "api" })
    await assert.rejects(createRefund({ tenantId: TENANT, paymentId: payment.id, amount: 1, createdByKind: "api" }), RefundError)
  })

  test("a Stripe failure releases the reservation instead of stranding it", async () => {
    const payment = await paidPayment(2500)
    __stripe.on("refunds.create", () => {
      throw new Error("insufficient_funds")
    })
    await assert.rejects(createRefund({ tenantId: TENANT, paymentId: payment.id, amount: 1000, createdByKind: "api" }), /insufficient_funds/)

    const [after] = await sql().query(`select status, amount_refunded, net_fee from tollbooth_payments where id = $1`, [payment.id])
    assert.equal(after.amount_refunded, 0, "the reservation is handed back")
    assert.equal(after.status, "succeeded", "so the payment is refundable again")
    assert.equal(after.net_fee, 25)
  })

  test("two refunds that would exceed the payment cannot both go through", async () => {
    const payment = await paidPayment(2500)
    // 1500 + 1500 exceeds 2500, so the pair genuinely conflicts. Two refunds of 1250
    // would be a legitimate full refund in two parts, which is allowed.
    const results = await Promise.allSettled([
      createRefund({ tenantId: TENANT, paymentId: payment.id, amount: 1500, createdByKind: "api" }),
      createRefund({ tenantId: TENANT, paymentId: payment.id, amount: 1500, createdByKind: "api" }),
    ])

    const fulfilled = results.filter((r) => r.status === "fulfilled").length
    assert.equal(fulfilled, 1, "only one of two conflicting refunds may proceed")

    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult
    assert.ok(rejected, "the loser must be told, not silently dropped")

    // Which of the two rejections fires depends on the timing: if the loser reads the
    // payment after the winner committed it fails the "only X left" check, otherwise it
    // loses the optimistic guard. Both are safe, so the guarantee is asserted instead.
    const reason = rejected.reason as RefundError
    assert.ok(["refund_conflict", "invalid_request_error"].includes(reason.type), `unexpected rejection: ${reason.type}`)
    assert.ok(reason.status >= 400 && reason.status < 500, `expected a 4xx, got ${reason.status}`)

    const [after] = await sql().query(`select amount_refunded from tollbooth_payments where id = $1`, [payment.id])
    assert.ok(after.amount_refunded <= 2500, "never more than the payment is worth")
    assert.equal(after.amount_refunded, 1500)
  })

  test("each refund is recorded with its reason and who issued it", async () => {
    const payment = await paidPayment()
    const refund = await createRefund({
      tenantId: TENANT, paymentId: payment.id, amount: 500,
      reason: "requested_by_customer", note: "changed their mind", createdByKind: "dashboard",
    })
    assert.equal(refund.reason, "requested_by_customer")
    assert.equal(refund.note, "changed their mind")
    assert.equal(refund.createdByKind, "dashboard")
    assert.equal(refund.currency, "usd")
  })
})
