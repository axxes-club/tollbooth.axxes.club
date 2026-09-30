/**
 * Concurrency checks against the real database.
 *
 * Two of the most expensive bugs in a payments codebase are races, and neither shows
 * up in a functional test: a duplicate charge when two identical requests arrive
 * together, and an over-refund when two refunds target the same payment. Both are
 * silent — the API returns 201/200 every time.
 *
 * These run real concurrent statements against the same guard the app uses, so the
 * atomicity is proved rather than asserted.
 *
 *   node scripts/check-concurrency.mjs
 */
import { neon } from "@neondatabase/serverless"
import assert from "node:assert/strict"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}
const sql = neon(url)
const TENANT = "00000000-0000-4000-8000-0000000000cc"

const cleanup = async () => {
  for (const table of ["tollbooth_refunds", "tollbooth_payments", "tollbooth_idempotency_keys"]) {
    await sql.query(`delete from ${table} where tenant_id = $1`, [TENANT])
  }
}

// ─── A payment can never be refunded for more than it was charged ────────────────
await cleanup()
const [payment] = await sql`
  insert into tollbooth_payments (tenant_id, status, amount, currency, application_fee, net_fee)
  values (${TENANT}, 'succeeded', 2500, 'usd', 25, 25)
  returning id, amount, amount_refunded
`

// The conditional update createRefund relies on: claim the refund only if nothing
// has moved the refunded total since we read it.
const claim = async (delta) => {
  const rows = await sql`
    update tollbooth_payments
    set amount_refunded = amount_refunded + ${delta}, status = 'partially_refunded'
    where id = ${payment.id} and amount_refunded = ${payment.amount_refunded}
    returning amount_refunded
  `
  return rows.length > 0
}

const outcomes = await Promise.all([claim(1250), claim(1250), claim(1250), claim(1250)])
const winners = outcomes.filter(Boolean).length
const [after] = await sql`select amount_refunded, amount from tollbooth_payments where id = ${payment.id}`

assert.equal(winners, 1, `exactly one of four concurrent refunds should win, got ${winners}`)
assert.ok(after.amount_refunded <= after.amount, `refunded ${after.amount_refunded} of ${after.amount}`)
console.log(`refund race: 4 concurrent refunds of 1250 on 2500 -> ${winners} won, ${4 - winners} got 409`)

// ─── A replayed Idempotency-Key must not run the handler twice ───────────────────
// The claim is the insert; only the request that actually inserts may execute. This
// is the same uniqueness the app relies on, checked under contention.
const KEY = "concurrency-check"
await sql`delete from tollbooth_idempotency_keys where key = ${KEY}`

const insertClaim = async () => {
  const rows = await sql`
    insert into tollbooth_idempotency_keys (key, tenant_id, method, path, request_hash)
    values (${KEY}, ${TENANT}, 'POST', '/checkout-sessions', 'hash')
    on conflict do nothing
    returning key
  `
  return rows.length > 0
}

const claims = await Promise.all(Array.from({ length: 8 }, insertClaim))
const claimed = claims.filter(Boolean).length
assert.equal(claimed, 1, `exactly one of eight concurrent claims should win, got ${claimed}`)
console.log(`idempotency race: 8 concurrent claims of one key -> ${claimed} winner, ${8 - claimed} replayed`)

await cleanup()
console.log("\nConcurrency checks passed.")
