import { describe, test, beforeEach, after, mock } from "node:test"
import assert from "node:assert/strict"
import * as actions from "@/app/dashboard/actions"
import { onboardingLink, payoutDetailsLink } from "@/lib/accounts"
import { resetTestData, seedReadyAccount, sql, suiteFor } from "./helpers/db"
import { __stripe } from "./fakes/stripe"

const SUITE = suiteFor("actions")
const context = require("@/lib/context")
const cache = require("next/cache")
const PAYOUT_CONTROLLER = {
  stripe_dashboard: { type: "none" },
  fees: { payer: "account" },
  losses: { payments: "stripe" },
  requirement_collection: "stripe",
}

describe("dashboard actions", { skip: !process.env.DATABASE_URL }, () => {
  beforeEach(async () => {
    mock.restoreAll()
    __stripe.reset()
    await resetTestData(SUITE)
    mock.method(context, "requireContext", async () => ({ tenant: { id: SUITE.tenant, name: "Test" }, user: { email: "test@example.com" }, userId: "test", role: "owner" }))
    mock.method(cache, "revalidatePath", () => {})
  })
  after(async () => { mock.restoreAll(); await resetTestData(SUITE) })

  test("refresh requires authentication before calling Stripe", async () => {
    mock.method(context, "requireContext", async () => { throw new Error("Unauthorized") })
    await assert.rejects(actions.refreshAccount(), /Unauthorized/)
    assert.equal(__stripe.calls("accounts.retrieve").length, 0)
  })

  test("account sync cannot bypass the authenticated action boundary", async () => {
    const unsafe = (actions as unknown as { syncAccount?: (tenant: string) => Promise<unknown> }).syncAccount
    if (!unsafe) return
    mock.method(context, "requireContext", async () => { throw new Error("Unauthorized") })
    const account = await seedReadyAccount(SUITE.tenant)
    __stripe.account(account)
    await assert.rejects(unsafe(SUITE.tenant), /Unauthorized/)
  })

  test("invalid onboarding mode is rejected before account creation", async () => {
    const form = new FormData()
    form.set("mode", "invalid")
    await assert.rejects(actions.startOnboarding(form), /mode/i)
    assert.equal(__stripe.calls("accounts.create").length, 0)
  })

  test("payout accounts make Stripe the fee payer and risk holder, with no Stripe dashboard", async () => {
    const url = await onboardingLink({ tenantId: SUITE.tenant, name: "Test", email: "test@example.com" }, "test", "https://tollbooth.test")
    assert.equal(url, "https://connect.stripe.test/setup")

    const [create] = __stripe.calls("accounts.create")
    const params = create.args[0] as any
    assert.equal(params.type, undefined, "legacy account types would make Tollbooth pay fees and carry losses")
    assert.deepEqual(params.controller, PAYOUT_CONTROLLER)
    const [link] = __stripe.calls("accountLinks.create")
    assert.equal((link.args[0] as any).type, "account_onboarding")
  })

  test("an account from another Stripe platform is replaced, not reused", async () => {
    await seedReadyAccount(SUITE.tenant, "acct_previous_platform")
    await sql().query(`update tollbooth_accounts set charges_enabled = 0 where tenant_id = $1`, [SUITE.tenant])
    await onboardingLink({ tenantId: SUITE.tenant, name: "Test", email: "test@example.com" }, "test", "https://tollbooth.test")

    assert.equal(__stripe.calls("accounts.create").length, 1)
    const [row] = await sql().query(`select stripe_account_id, details_submitted from tollbooth_accounts where tenant_id = $1`, [SUITE.tenant])
    assert.notEqual(row.stripe_account_id, "acct_previous_platform")
    assert.equal(row.details_submitted, 0, "the new account starts unverified")
  })

  test("a correctly configured account is reused", async () => {
    const id = await seedReadyAccount(SUITE.tenant, "acct_configured")
    __stripe.account(id, { controller: PAYOUT_CONTROLLER })
    await onboardingLink({ tenantId: SUITE.tenant, name: "Test", email: "test@example.com" }, "test", "https://tollbooth.test")

    assert.equal(__stripe.calls("accounts.create").length, 0)
    assert.equal((__stripe.calls("accountLinks.create")[0].args[0] as any).account, id)
  })

  test("payout details are edited through Stripe's form, not a Stripe dashboard login", async () => {
    const id = await seedReadyAccount(SUITE.tenant, "acct_details")
    __stripe.account(id, { controller: PAYOUT_CONTROLLER })
    await payoutDetailsLink(SUITE.tenant, "test", "https://tollbooth.test")

    assert.equal(__stripe.calls("accounts.createLoginLink").length, 0)
    const params = __stripe.calls("accountLinks.create")[0].args[0] as any
    assert.equal(params.type, "account_onboarding")
    assert.equal(params.account, id)
  })

  test("JPY prices use whole currency units", async () => {
    const form = new FormData()
    form.set("amount", "1000")
    form.set("currency", "jpy")
    assert.equal((await actions.createPrice(form)).ok, true)
    const [row] = await sql().query("select amount from tollbooth_prices where tenant_id = $1", [SUITE.tenant])
    assert.equal(row.amount, 1000)
  })

  test("JPY refunds are parsed in the owned payment currency", async () => {
    __stripe.account(await seedReadyAccount(SUITE.tenant))
    const [payment] = await sql().query("insert into tollbooth_payments (tenant_id, amount, currency, status, payment_intent_id,mode) values ($1, 1000, 'jpy', 'succeeded', 'pi_jpy','test') returning id", [SUITE.tenant])
    const form = new FormData()
    __stripe.on("refunds.create",()=>({currency:"jpy"}));
    __stripe.on("charges.retrieve",()=>({payment_intent:"pi_jpy",currency:"jpy",livemode:false,amount_refunded:100}));
    form.set("payment_id", payment.id)
    form.set("amount", "100")
    assert.equal((await actions.refundPayment(form)).ok, true)
    const params = __stripe.calls("refunds.create")[0].args[0] as { amount: number }
    assert.equal(params.amount, 100)
    form.set("amount", "0.1")
    assert.equal((await actions.refundPayment(form)).ok, false)
    assert.equal(__stripe.calls("refunds.create").length, 1)
  })

  test("read-only workspace members cannot create prices or refund payments", async () => {
    mock.method(context, "requireContext", async () => ({ tenant: { id: SUITE.tenant }, role: "viewer" }))
    await assert.rejects(actions.createPrice(new FormData()), /owners and admins/)
    await assert.rejects(actions.refundPayment(new FormData()), /owners and admins/)
    assert.equal(__stripe.calls("refunds.create").length, 0)
  })

  test("test endpoints can be configured from the dashboard", async () => {
    const form = new FormData()
    form.set("url", "https://example.com/hook")
    form.set("mode", "test")
    assert.equal((await actions.createEndpoint(form)).ok, true)
    const [row] = await sql().query("select mode from tollbooth_webhook_endpoints where tenant_id = $1", [SUITE.tenant])
    assert.equal(row.mode, "test")
  })
})
