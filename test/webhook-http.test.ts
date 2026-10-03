import { test, mock } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

test("webhook transport blocks internal network targets in production", async (t) => {
  const previous = process.env.NODE_ENV
  t.after(() => { Object.assign(process.env, { NODE_ENV: previous ?? "test" }) })
  Object.assign(process.env, { NODE_ENV: "production" })
  let post: (url: string, body: string, headers: Record<string, string>, timeout: number) => Promise<unknown>
  try { post = require("@/lib/webhook-http").postWebhook } catch { assert.fail("Protected webhook transport is missing") }
  for (const host of ["localhost", "127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "[::1]", "[::ffff:127.0.0.1]"]) {
    await assert.rejects(post(`https://${host}/hook`, "{}", {}, 1000), /public|private|internal/i)
  }
})

test("webhook responses are bounded instead of loading an unlimited body", async (t) => {
  let post: (url: string, body: string, headers: Record<string, string>, timeout: number) => Promise<{ status: number; body: string }>
  try { post = require("@/lib/webhook-http").postWebhook } catch { assert.fail("Protected webhook transport is missing") }
  const previous = process.env.NODE_ENV
  Object.assign(process.env, { NODE_ENV: "test" })
  t.after(() => { Object.assign(process.env, { NODE_ENV: previous ?? "test" }) })
  const server = createServer((_req, res) => res.writeHead(200).end("x".repeat(100000)))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())))
  const result = await post(`http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, "{}", {}, 1000)
  assert.equal(result.status, 200)
  assert.equal(result.body.length, 2000)
})

test("a stalled webhook response times out", async (t) => {
  const { postWebhook } = require("@/lib/webhook-http")
  const server = createServer(() => {})
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())))
  await assert.rejects(postWebhook(`http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, "{}", {}, 50), /timed out/)
})

test("DNS resolution cannot route a public-looking hostname to a private address", async (t) => {
  const previous = process.env.NODE_ENV
  Object.assign(process.env, { NODE_ENV: "production" })
  t.after(() => { mock.restoreAll(); Object.assign(process.env, { NODE_ENV: previous ?? "test" }) })
  mock.method(require("node:dns/promises"), "lookup", async () => [{ address: "10.0.0.1", family: 4 }])
  const { postWebhook } = require("@/lib/webhook-http")
  await assert.rejects(postWebhook("https://public-looking.example/hook", "{}", {}, 1000), /public|internal/)
})

test("the socket uses the validated DNS result without resolving again", async (t) => {
  const dns = mock.method(require("node:dns/promises"), "lookup", async () => [{ address: "127.0.0.1", family: 4 }])
  t.after(() => mock.restoreAll())
  let received = 0
  const server = createServer((_req, res) => { received++; res.writeHead(200).end("ok") })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())))
  const { postWebhook } = require("@/lib/webhook-http")
  const result = await postWebhook(`http://localhost:${(server.address() as AddressInfo).port}/hook`, "{}", {}, 1000)
  assert.equal(result.status, 200)
  assert.equal(received, 1)
  assert.equal(dns.mock.callCount(), 1)
})
