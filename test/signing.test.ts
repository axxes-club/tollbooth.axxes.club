import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { signPayload, verifySignature } from "@/lib/webhooks"

const SECRET = "whsec_test_secret"
const PAYLOAD = JSON.stringify({ id: "evt_1", type: "payment.succeeded", data: { object: { amount: 2500 } } })

/**
 * The server-side helper returns `{ ok, reason }` so a failed webhook can be logged
 * with a cause; the SDK's equivalent returns a plain boolean (see sdk.test.ts).
 */
const verify = (header: string, payload = PAYLOAD, secret = SECRET, tolerance?: number) =>
  verifySignature(secret, header, payload, tolerance).ok

const reasonFor = (header: string, payload = PAYLOAD, secret = SECRET) => verifySignature(secret, header, payload).reason

describe("webhook signing", () => {
  test("a signature verifies against the payload it was made for", () => {
    const { header } = signPayload(SECRET, PAYLOAD)
    assert.equal(verify(header), true)
  })

  test("a signature still verifies with a pinned timestamp", () => {
    const ts = Math.floor(Date.now() / 1000) - 60
    const { header } = signPayload(SECRET, PAYLOAD, ts)
    assert.equal(verify(header), true)
  })

  test("the header carries a unix timestamp and a hex signature", () => {
    const { header, mac, timestamp } = signPayload(SECRET, PAYLOAD)
    assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/)
    assert.ok(header.includes(mac))
    assert.ok(Math.abs(Math.floor(Date.now() / 1000) - timestamp) <= 2)
  })

  test("the timestamp is inside the signed material, so a capture cannot be replayed", () => {
    // Signing only the body would let anyone who captured a delivery re-post it later.
    const bodyOnly = createHmac("sha256", SECRET).update(PAYLOAD).digest("hex")
    const { header } = signPayload(SECRET, PAYLOAD)
    assert.ok(!header.endsWith(bodyOnly), "the signature must not be over the body alone")
    assert.equal(header.includes(bodyOnly), false)
  })

  test("a tampered payload is rejected", () => {
    const { header } = signPayload(SECRET, PAYLOAD)
    assert.equal(verify(header, PAYLOAD.replace("2500", "1")), false)
  })

  test("a tampered signature is rejected", () => {
    const { header } = signPayload(SECRET, PAYLOAD)
    const flipped = header.replace(/v1=(.)/, (_m, c: string) => `v1=${c === "a" ? "b" : "a"}`)
    assert.equal(verify(flipped), false)
  })

  test("the wrong secret is rejected", () => {
    const { header } = signPayload(SECRET, PAYLOAD)
    assert.equal(verify(header, PAYLOAD, "whsec_other"), false)
  })

  test("a signature of the wrong length never throws", () => {
    assert.equal(verify("t=1,v1=ab"), false)
  })

  test("a timestamp outside the tolerance is rejected, in either direction", () => {
    const old = signPayload(SECRET, PAYLOAD, Math.floor(Date.now() / 1000) - 3600).header
    assert.equal(verify(old, PAYLOAD, SECRET, 300), false, "an hour old")
    assert.equal(verify(old, PAYLOAD, SECRET, 7200), true, "still inside a wider window")

    const ahead = signPayload(SECRET, PAYLOAD, Math.floor(Date.now() / 1000) + 3600).header
    assert.equal(verify(ahead, PAYLOAD, SECRET, 300), false, "an hour in the future")
  })

  test("malformed headers are rejected rather than throwing", () => {
    const cases = ["", "garbage", "t=abc,v1=def", "v1=deadbeef", "t=123", `t=1,v1=${"z".repeat(64)}`, "=,="]
    for (const header of cases) {
      assert.equal(verify(header), false, `accepted: ${JSON.stringify(header)}`)
    }
  })

  test("a missing header or secret is rejected", () => {
    const { header } = signPayload(SECRET, PAYLOAD)
    assert.equal(verify(""), false)
    assert.equal(verify(header, PAYLOAD, ""), false)
  })

  test("failures say why, so a broken integration can be diagnosed", () => {
    const stale = signPayload(SECRET, PAYLOAD, Math.floor(Date.now() / 1000) - 3600).header
    assert.equal(reasonFor(stale), "timestamp_out_of_tolerance", "the default tolerance is 300s")
    assert.equal(reasonFor(signPayload(SECRET, PAYLOAD).header, PAYLOAD, "other"), "signature_mismatch")
    assert.equal(reasonFor("nonsense"), "malformed")
  })

  test("two payloads with the same bytes verify identically", () => {
    // Guards against a signing scheme that depends on call order or randomness.
    const a = signPayload(SECRET, PAYLOAD, 1_700_000_000).header
    const b = signPayload(SECRET, PAYLOAD, 1_700_000_000).header
    assert.equal(a, b, "signing must be deterministic for a given timestamp")
  })
})
