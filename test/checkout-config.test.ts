import { test } from "node:test"
import assert from "node:assert/strict"
import { createCheckout } from "@/lib/payments"
import { suiteFor, seedReadyAccount, resetTestData, sql } from "./helpers/db"

test("missing Stripe configuration does not leave a pending checkout record", { skip: !process.env.DATABASE_URL }, async (t) => {
  const suite = suiteFor("config")
  const previous = process.env.STRIPE_SECRET_KEY_TEST
  t.after(async () => {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY_TEST; else process.env.STRIPE_SECRET_KEY_TEST = previous
    await resetTestData(suite)
  })
  await resetTestData(suite)
  await seedReadyAccount(suite.tenant)
  delete process.env.STRIPE_SECRET_KEY_TEST
  await assert.rejects(createCheckout({ tenantId: suite.tenant, mode: "test", amount: 1000, currency: "usd", description: "Ticket", successUrl: "", cancelUrl: "" }), /not configured/)
  const [row] = await sql().query("select count(*)::integer as n from tollbooth_payments where tenant_id = $1", [suite.tenant])
  assert.equal(row.n, 0)
})
