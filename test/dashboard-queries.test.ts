import { test, describe, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import { getPayments, getVolume, getOnboarding, getEndpoints } from "@/app/dashboard/queries"
import PaymentsPage from "@/app/dashboard/payments/page"
import { renderToStaticMarkup } from "react-dom/server"
import { mock } from "node:test"
import { sql, suiteFor, resetTestData, seedReadyAccount } from "./helpers/db"
const SUITE = suiteFor("queries")

describe("merchant reporting and setup", { skip: !process.env.DATABASE_URL }, () => {
  beforeEach(() => resetTestData(SUITE))
  after(async () => { mock.restoreAll(); await resetTestData(SUITE) })

  test("the default payments page keeps live and test statistics separate", async () => {
    const previous = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = "sk_live_testonly"
    mock.method(require("@/lib/context"), "requireContext", async () => ({ tenant: { id: SUITE.tenant } }))
    try {
      await sql().query(`insert into tollbooth_payments (tenant_id, amount, currency, mode, status) values ($1, 1000, 'usd', 'live', 'succeeded'), ($1, 99999, 'usd', 'test', 'succeeded')`, [SUITE.tenant])
      const html = renderToStaticMarkup(await PaymentsPage({ searchParams: Promise.resolve({}) }))
      assert.doesNotMatch(html, /1,009\.99|999\.99/)
      assert.match(html, /10\.00/)
    } finally {
      process.env.STRIPE_SECRET_KEY = previous
      mock.restoreAll()
    }
  })

  test("mode filters apply before the payment list limit", async () => {
    await sql().query(`insert into tollbooth_payments (tenant_id, amount, currency, mode, created_at) values ($1, 1000, 'usd', 'live', now() - interval '1 day'), ($1, 9999, 'usd', 'test', now())`, [SUITE.tenant])
    const rows = await (getPayments as unknown as (tenant: string, limit: number, status: undefined, mode: string) => Promise<{ mode: string }[]>)(SUITE.tenant, 1, undefined, "live")
    assert.equal(rows.length, 1)
    assert.equal(rows[0].mode, "live")
  })

  test("reported fees exclude pending and failed attempts", async () => {
    await sql().query(`insert into tollbooth_payments (tenant_id, amount, currency, mode, status, net_fee) values ($1, 1000, 'usd', 'live', 'succeeded', 10), ($1, 1000, 'usd', 'live', 'pending', 10), ($1, 1000, 'usd', 'live', 'failed', 10), ($1, 9000, 'usd', 'test', 'succeeded', 90)`, [SUITE.tenant])
    const [volume] = await getVolume(SUITE.tenant, 30, "live")
    assert.equal(volume.gross, 1000)
    assert.equal(volume.fees, 10)
  })

  test("payment-link setup does not require developer credentials", async () => {
    await seedReadyAccount(SUITE.tenant)
    await sql().query("insert into tollbooth_prices (tenant_id, amount, currency) values ($1, 1000, 'usd')", [SUITE.tenant])
    const onboarding = await getOnboarding(SUITE.tenant)
    assert.equal(onboarding.total, 2)
    assert.equal(onboarding.done, 2)
  })

  test("dashboard endpoint data does not serialize signing secrets to the browser", async () => {
    await sql().query("insert into tollbooth_webhook_endpoints (tenant_id, url, secret, created_by_id) values ($1, 'https://example.com/hook', 'whsec_private_test', 'test')", [SUITE.tenant])
    const endpoints = await getEndpoints(SUITE.tenant)
    assert.equal(endpoints.length, 1)
    assert.doesNotMatch(JSON.stringify(endpoints), /whsec_private_test/)
    assert.equal("secret" in endpoints[0], false)
  })
})
