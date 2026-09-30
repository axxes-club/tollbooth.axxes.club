import { test, describe } from "node:test"
import assert from "node:assert/strict"
import * as fees from "@/lib/fees"
import { applicationFee, netPayout, feeForRefundedAmount, refundFeeDelta, isUuid, currencyExponent, formatMoney, minimumCharge } from "@/lib/fees"

describe("fees", () => {
  test("major-unit input preserves currency precision without rounding", () => {
    const parse = (fees as unknown as { parseMoney: (input: string, currency: string) => number | null }).parseMoney
    assert.equal(parse("10.25", "usd"), 1025)
    assert.equal(parse("1000", "jpy"), 1000)
    assert.equal(parse(" 0.50 ", "USD"), 50)
    assert.equal(parse("0", "usd"), 0)
    for (const input of ["", "-1", "NaN", "Infinity", "1e3", "0.001", "9007199254740992", "1,000", "+1"]) {
      assert.equal(parse(input, "usd"), null, input)
    }
    assert.equal(parse("100.1", "jpy"), null)
  })
  test("charges a percentage of the payment", () => {
    assert.equal(applicationFee(2500), 25) // 1% of $25.00
    assert.equal(applicationFee(10_000), 100)
    assert.equal(applicationFee(50), 1) // never zero on a real charge
  })

  test("never takes the whole payment or goes negative", () => {
    for (const amount of [1, 2, 49, 50, 99, 2500]) {
      const fee = applicationFee(amount)
      assert.ok(fee >= 0, `negative fee at ${amount}`)
      assert.ok(fee < amount, `fee ${fee} swallowed amount ${amount}`)
    }
    assert.equal(applicationFee(0), 0)
    assert.equal(applicationFee(-100), 0)
  })

  test("netPayout is the amount after our cut", () => {
    assert.equal(netPayout(2500), 2475)
    assert.equal(netPayout(50), 49)
  })

  test("a full refund returns the whole fee", () => {
    assert.equal(feeForRefundedAmount(25, 2500, 2500), 25)
    assert.equal(feeForRefundedAmount(1, 50, 50), 1)
  })

  test("a partial refund returns a proportional share", () => {
    assert.equal(feeForRefundedAmount(100, 5000, 10_000), 50)
    assert.equal(feeForRefundedAmount(100, 2500, 10_000), 25)
  })

  test("never returns more than was charged, however the payment is split", () => {
    for (const amount of [50, 99, 2500, 10_000]) {
      const fee = applicationFee(amount)
      for (const parts of [2, 3, 7, 13]) {
        const slice = Math.floor(amount / parts)
        let refunded = 0
        let netFee = fee
        let returned = 0
        for (let i = 0; i < parts; i++) {
          const thisSlice = i === parts - 1 ? amount - slice * (parts - 1) : slice
          const alreadyReturned = fee - netFee
          const delta = refundFeeDelta(fee, alreadyReturned, thisSlice, amount, refunded + thisSlice)
          returned += delta
          refunded += thisSlice
          netFee = Math.max(0, netFee - delta)
        }
        assert.equal(refunded, amount)
        assert.ok(returned <= fee, `${amount} split ${parts} ways returned ${returned} of a ${fee} fee`)
        assert.equal(netFee, 0, "a fully refunded payment keeps nothing")
      }
    }
  })

  test("re-refunding the same amount returns nothing more", () => {
    assert.equal(refundFeeDelta(25, 25, 1250, 2500, 2500), 0)
    assert.equal(refundFeeDelta(25, 0, 2500, 2500, 2500), 25)
  })

  test("isUuid only accepts real uuids", () => {
    assert.equal(isUuid("9b2c1d4e-1f2a-4c3d-8e9f-0a1b2c3d4e5f"), true)
    assert.equal(isUuid("vip_ticket"), false)
    assert.equal(isUuid(""), false)
    assert.equal(isUuid(undefined), false)
    assert.equal(isUuid(123), false)
  })

  test("zero-decimal currencies are handled", () => {
    assert.equal(currencyExponent("usd"), 2)
    assert.equal(currencyExponent("jpy"), 0)
    assert.equal(formatMoney(1000, "jpy"), "¥1,000")
    assert.equal(formatMoney(2500, "usd"), "$25.00")
  })

  test("test-mode money is labelled so it is never mistaken for real", () => {
    assert.equal(formatMoney(2500, "usd", "test"), "$25.00 (test)")
    assert.equal(formatMoney(2500, "usd", "live"), "$25.00")
  })

  test("minimum charge is enforced", () => {
    assert.equal(minimumCharge("usd"), 50)
  })
})
