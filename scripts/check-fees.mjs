/**
 * Property tests for the fee maths.
 *
 * These are the rules the platform's own revenue depends on, and the failure mode is
 * silent: a rounding slip returns more fee than was charged and nobody notices until
 * the books don't balance. Splitting one payment into several partial refunds is the
 * case that actually broke, so it is tested directly.
 *
 *   node scripts/check-fees.mjs
 */
import assert from "node:assert/strict"

const BPS = Number(process.env.TOLLBOOTH_FEE_BPS ?? 100)
const FIXED = Number(process.env.TOLLBOOTH_FEE_FIXED ?? 0)

const applicationFee = (amount) =>
  amount <= 0 ? 0 : Math.min(amount - 1, Math.round((amount * BPS) / 10_000) + FIXED)

const feeForRefundedAmount = (chargedFee, refundedAmount, originalAmount) => {
  if (originalAmount <= 0 || refundedAmount <= 0) return 0
  return Math.max(0, Math.min(chargedFee, Math.floor((chargedFee * refundedAmount) / originalAmount)))
}

const refundFeeDelta = (chargedFee, alreadyReturned, amount, originalAmount, refundedTotal) => {
  const outstanding = Math.max(0, chargedFee - alreadyReturned)
  if (outstanding === 0) return 0
  const target = feeForRefundedAmount(chargedFee, refundedTotal, originalAmount)
  return Math.max(0, Math.min(target - alreadyReturned, outstanding))
}

const AMOUNTS = [50, 51, 99, 100, 999, 2500, 3333, 10_000, 99_999, 999_999]
let checks = 0
const check = (name, fn) => {
  fn()
  checks++
}

// The fee must always leave the merchant something, and never be negative.
check("fee is within the charge", () => {
  for (const amount of AMOUNTS) {
    const fee = applicationFee(amount)
    assert.ok(fee >= 0, `negative fee at ${amount}`)
    assert.ok(fee < amount, `fee ${fee} is not less than amount ${amount}`)
  }
})

// A full refund hands back exactly the fee that was taken.
check("full refund returns the whole fee", () => {
  for (const amount of AMOUNTS) {
    assert.equal(feeForRefundedAmount(applicationFee(amount), amount, amount), applicationFee(amount))
  }
})

// The regression: any split of a payment must return at most the fee charged.
check("split refunds never return more than the fee", () => {
  for (const amount of AMOUNTS) {
    for (const parts of [1, 2, 3, 4, 7, 13, 97]) {
      const fee = applicationFee(amount)
      const slice = Math.floor(amount / parts)
      const refunds = Array(parts - 1).fill(slice)
      refunds.push(amount - slice * (parts - 1))

      let amountRefunded = 0
      let netFee = fee
      let returned = 0
      for (const refund of refunds) {
        const alreadyReturned = fee - netFee
        const total = amountRefunded + refund
        const delta = refundFeeDelta(fee, alreadyReturned, refund, amount, total)
        returned += delta
        amountRefunded = total
        netFee = Math.max(0, netFee - delta)
      }

      assert.equal(amountRefunded, amount, `slices should sum to the original (${amount}/${parts})`)
      assert.ok(returned <= fee, `returned ${returned} > charged ${fee} for ${amount} in ${parts} parts`)
      assert.ok(netFee >= 0, `netFee went negative for ${amount} in ${parts} parts`)
      // A fully-refunded payment keeps no fee.
      if (parts > 1) assert.equal(netFee, 0, `fully-refunded ${amount}/${parts} should keep nothing`)
    }
  }
})

// Repeated calls must be stable: refunding the same total twice never returns twice.
check("a duplicate refund returns nothing further", () => {
  for (const amount of AMOUNTS) {
    const fee = applicationFee(amount)
    const first = refundFeeDelta(fee, 0, amount, amount, amount)
    const second = refundFeeDelta(fee, first, amount, amount, amount)
    assert.equal(first, fee)
    assert.equal(second, 0, `a repeated full refund returned ${second} more`)
  }
})

// The value must be monotonic: returning more money never returns less fee.
check("fee returned is monotonic in the refunded amount", () => {
  for (const amount of AMOUNTS) {
    const fee = applicationFee(amount)
    let previous = 0
    for (let r = 1; r <= amount; r += Math.max(1, Math.floor(amount / 50))) {
      const value = feeForRefundedAmount(fee, r, amount)
      assert.ok(value >= previous, `not monotonic at ${amount}/${r}: ${value} < ${previous}`)
      previous = value
    }
  }
})

console.log(`Fee maths OK (${checks} property checks, ${AMOUNTS.length} amounts, ${BPS} bps).`)
