import { test } from "node:test"
import assert from "node:assert/strict"
import { POST } from "@/app/api/cron/deliveries/route"

test("delivery cron fails closed when no secret is configured", async (t) => {
  const previous = process.env.CRON_SECRET
  t.after(() => { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous })
  delete process.env.CRON_SECRET
  assert.equal((await POST(new Request("https://example.com/api/cron/deliveries"))).status, 503)
})

test("delivery cron refuses an incorrect bearer secret", async (t) => {
  const previous = process.env.CRON_SECRET
  t.after(() => { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous })
  process.env.CRON_SECRET = "test-secret"
  assert.equal((await POST(new Request("https://example.com/api/cron/deliveries", { headers: { authorization: "Bearer wrong" } }))).status, 401)
})
