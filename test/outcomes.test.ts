import { describe, test, after } from "node:test"
import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import CompletePage from "@/app/pay/complete/[id]/page"
import CancelledPage from "@/app/pay/cancelled/[id]/page"
import { suiteFor, sql, resetTestData } from "./helpers/db"

const SUITE = suiteFor("outcomes")

describe("public payment outcomes", { skip: !process.env.DATABASE_URL }, () => {
  after(() => resetTestData(SUITE))

  test("malformed payment identifiers produce a helpful page", async () => {
    for (const page of [CompletePage, CancelledPage]) {
      const html = renderToStaticMarkup(await page({ params: Promise.resolve({ id: "invalid" }) }))
      assert.match(html, /payment|checkout/i)
    }
  })

  test("outcomes describe refunds and disputes without leaking customer email or promising receipts", async () => {
    for (const [status, title] of [
      ["pending", "Confirming your payment"], ["succeeded", "Payment received"],
      ["partially_refunded", "Payment partially refunded"], ["refunded", "Payment refunded"],
      ["disputed", "Payment under dispute"], ["expired", "Checkout expired"], ["failed", "Payment could not be completed"],
    ]) {
      const [payment] = await sql().query(
        `insert into tollbooth_payments (tenant_id, amount, currency, application_fee, description, status, customer_email, amount_refunded)
         values ($1, 1000, 'usd', 10, 'Ticket', $2, 'private@example.com', $3) returning id`,
        [SUITE.tenant, status, status === "refunded" ? 1000 : status === "partially_refunded" ? 500 : 0]
      )
      const router = { bfcacheId: "test", refresh() {}, back() {}, forward() {}, push() {}, replace() {}, prefetch: async () => {} }
      const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, await CompletePage({ params: Promise.resolve({ id: payment.id }) })))
      assert.ok(html.includes(title), `${status}: ${html}`)
      assert.doesNotMatch(html, /private@example.com|Receipt sent|email a receipt|No money was taken/i)
      if (status === "partially_refunded") { assert.match(html, /10\.00/); assert.match(html, /5\.00/) }
    }
  })
})
