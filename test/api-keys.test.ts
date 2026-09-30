import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { generateApiKey, bearerToken, scopeSatisfied, safeEqual, generateWebhookSecret, scopesForWrite } from "@/lib/api-keys"

describe("api keys", () => {
  test("the prefix carries the mode, so a key describes itself", () => {
    assert.ok(generateApiKey("live").secret.startsWith("tb_live_"))
    assert.ok(generateApiKey("test").secret.startsWith("tb_test_"))
  })

  test("secrets are long, unique, and never stored in the clear", () => {
    const a = generateApiKey("live")
    const b = generateApiKey("live")
    assert.notEqual(a.secret, b.secret)
    // 8 characters of prefix plus 32 of base64url entropy from 24 random bytes.
    assert.ok(a.secret.length >= 40, `key is only ${a.secret.length} characters`)
    assert.ok(a.secret.slice("tb_live_".length).length >= 32)
    // The hash is of the whole secret, and the prefix is a readable fragment of it.
    assert.match(a.keyHash, /^[0-9a-f]{64}$/)
    assert.ok(a.secret.startsWith(a.prefix))
    assert.ok(!a.keyHash.includes(a.prefix))
  })

  test("a test key and a live key never collide", () => {
    assert.notEqual(generateApiKey("test").keyHash, generateApiKey("live").keyHash)
  })

  test("bearerToken reads the key and its mode", () => {
    const req = (auth: string) => new Request("https://x.test", { headers: { authorization: auth } })
    assert.equal(bearerToken(req("Bearer tb_live_x"))?.mode, "live")
    assert.equal(bearerToken(req("Bearer tb_test_x"))?.mode, "test")
    assert.equal(bearerToken(req("bearer tb_live_x"))?.mode, "live", "scheme is case-insensitive")
    assert.equal(bearerToken(req("tb_live_x")), null, "a missing scheme is not a bearer token")
    assert.equal(bearerToken(req("Bearer sk_live_x")), null, "another vendor's key")
    assert.equal(bearerToken(req("")), null)
  })

  test("a key with no scopes is treated as fully trusted (pre-scopes keys)", () => {
    // Keys created before scopes existed have an empty array; refusing them would
    // lock out integrations that were working.
    assert.equal(scopeSatisfied([], "payments:write"), true)
  })

  test("scopes are enforced, with the documented allowances", () => {
    assert.equal(scopeSatisfied(["payments:write"], "payments:write"), true)
    assert.equal(scopeSatisfied(["payments:write"], "payments:read"), true, "write implies read")
    assert.equal(scopeSatisfied(["payments:write"], "refunds:write"), true, "a refund is a payment operation")
    assert.equal(scopeSatisfied(["payments:read"], "payments:write"), false)
    assert.equal(scopeSatisfied(["catalog:write"], "payments:write"), false)
    assert.equal(scopeSatisfied(["catalog:write"], "webhooks:write"), false)
  })

  test("safeEqual compares without leaking length or content", () => {
    assert.equal(safeEqual("abc", "abc"), true)
    assert.equal(safeEqual("abc", "abd"), false)
    assert.equal(safeEqual("abc", "abcd"), false, "different lengths are not equal")
    assert.equal(safeEqual("", ""), true)
  })

  test("webhook secrets are prefixed so they are recognisable in a log", () => {
    const secret = generateWebhookSecret()
    assert.ok(secret.startsWith("whsec_"))
    assert.ok(secret.length > 40)
    assert.notEqual(secret, generateWebhookSecret())
  })

  test("a new key gets the scopes an app actually needs", () => {
    assert.deepEqual(scopesForWrite(), ["payments:write", "refunds:write", "catalog:write", "webhooks:write"])
  })
})
