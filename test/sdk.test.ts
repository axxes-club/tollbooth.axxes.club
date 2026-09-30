/**
 * The published SDK.
 *
 * The SDK is the first thing a merchant touches, and the mistakes it could make are
 * expensive: dropping an idempotency key, retrying a request that shouldn't be
 * retried, or verifying a webhook signature incorrectly. `fetch` is stubbed so each
 * request can be inspected without a server.
 */
import { test, describe, before, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

interface SdkShape {
  Tollbooth: new (options: { apiKey: string; baseUrl?: string; maxRetries?: number; timeoutMs?: number }) => any
  TollboothError: new (message: string, info?: { status?: number; type?: string; requestId?: string }) => Error & {
    status: number
    type: string
    requestId?: string
    retryable: boolean
  }
  verifySignature: (options: { payload: string; header: string; secret: string; toleranceSeconds?: number }) => Promise<boolean>
  signPayload: (secret: string, payload: string, timestamp?: number) => Promise<{ header: string; timestamp: number; mac: string }>
  version: string
}

// The SDK ships as ESM while the test build is CommonJS. TypeScript would rewrite a
// plain `import()` into `require()`, which cannot load ESM, so the real dynamic
// import is kept behind a function the compiler cannot see through. The specifier is
// built at runtime for the same reason: the SDK is not part of this TypeScript
// program, and its `.d.ts` is checked by its consumers instead.
const dynamicImport = new Function("specifier", "return import(specifier)") as (s: string) => Promise<any>
const SDK_MODULE = ["..", "..", "sdk", "tollbooth.mjs"].join("/")

let SDK!: SdkShape
before(async () => {
  SDK = (await dynamicImport(SDK_MODULE)) as SdkShape
})

type Capture = { url: string; method: string; headers: Record<string, string>; body: any }
let captures: Capture[] = []
let respond: (call: Capture) => { status: number; body?: any } = () => ({ status: 200, body: { object: "ok" } })
let realFetch: typeof globalThis.fetch

function stubFetch() {
  realFetch = globalThis.fetch
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
    const capture: Capture = {
      // The SDK passes a URL instance, which is neither a string nor a Request.
      url: input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url,
      method: init.method ?? "GET",
      headers,
      body: init.body ? JSON.parse(init.body) : undefined,
    }
    captures.push(capture)
    const { status, body } = respond(capture)
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
    })
  }) as typeof fetch
}

const client = (overrides: Record<string, unknown> = {}) =>
  new SDK.Tollbooth({ apiKey: "tb_test_" + "a".repeat(32), baseUrl: "https://api.test/api/v1", maxRetries: 0, ...overrides })

describe("sdk", () => {
  beforeEach(stubFetch)
  afterEach(() => {
    globalThis.fetch = realFetch
    captures = []
    respond = () => ({ status: 200, body: { object: "ok" } })
  })

  describe("construction", () => {
    test("refuses a key that is not ours", () => {
      assert.throws(() => new SDK.Tollbooth({ apiKey: "sk_live_123" }), /tb_live_ or tb_test_/)
      assert.throws(() => new SDK.Tollbooth({ apiKey: "" }), /apiKey is required/)
    })

    test("derives the mode from the key, so a test key is self-describing", () => {
      assert.equal(client({ apiKey: "tb_test_x" }).mode, "test")
      assert.equal(client({ apiKey: "tb_live_x" }).mode, "live")
    })

    test("exposes a version", () => {
      assert.match(SDK.version, /^\d+\.\d+\.\d+$/)
    })
  })

  describe("requests", () => {
    test("sends the key as a bearer token and parses the body", async () => {
      respond = () => ({ status: 200, body: { object: "list", data: [], has_more: false } })
      const result = await client().payments.list()
      assert.equal(captures[0].headers.authorization.startsWith("Bearer tb_test_"), true)
      assert.equal(result.object, "list")
    })

    test("a GET carries no idempotency key", async () => {
      await client().payments.list()
      assert.equal(captures[0].headers["idempotency-key"], undefined)
    })

    test("every write gets an idempotency key automatically", async () => {
      await client().checkout.create({ amount: 2500, description: "T" })
      assert.ok(captures[0].headers["idempotency-key"], "a write without one could double-charge")
    })

    test("an explicit idempotency key is used on every create", async () => {
      // This is the bug worth guarding: a key silently dropped by one method.
      const sdk = client()
      const methods: [string, () => Promise<unknown>][] = [
        ["customers", () => sdk.customers.create({ email: "a@b.test" }, { idempotencyKey: "k" })],
        ["products", () => sdk.products.create({ name: "P" }, { idempotencyKey: "k" })],
        ["prices", () => sdk.prices.create({ amount: 1000 }, { idempotencyKey: "k" })],
        ["links", () => sdk.links.create({ price: "vip" }, { idempotencyKey: "k" })],
        ["webhooks", () => sdk.webhooks.create({ url: "https://a.test/h" }, { idempotencyKey: "k" })],
        ["refunds", () => sdk.refunds.create({ payment_id: "p" }, { idempotencyKey: "k" })],
        ["checkout", () => sdk.checkout.create({ amount: 1000, description: "T" }, { idempotencyKey: "k" })],
      ]
      for (const [name, run] of methods) {
        captures = []
        await run().catch(() => {})
        assert.equal(captures[0]?.headers["idempotency-key"], "k", `${name}.create dropped the key`)
      }
    })

    test("query parameters are sent, and empty ones are omitted", async () => {
      await client().payments.list({ limit: 5, status: "succeeded", starting_after: undefined })
      const url = new URL(captures[0].url)
      assert.equal(url.searchParams.get("limit"), "5")
      assert.equal(url.searchParams.get("status"), "succeeded")
      assert.equal(url.searchParams.has("starting_after"), false)
    })

    test("path parameters are escaped, so an id cannot break out of the path", async () => {
      await client().payments.retrieve({ id: "../../admin" })
      assert.equal(new URL(captures[0].url).pathname, "/api/v1/payments/..%2F..%2Fadmin")
    })

    test("the method matches the operation", async () => {
      const sdk = client()
      await sdk.payments.list()
      await sdk.checkout.create({ amount: 1000, description: "T" })
      await sdk.customers.update({ id: "11111111-1111-4111-8111-111111111111", name: "X" })
      assert.deepEqual(captures.map((c) => c.method), ["GET", "POST", "PATCH"])
    })
  })

  describe("errors", () => {
    test("an API error becomes a TollboothError with its type and request id", async () => {
      respond = () => ({ status: 409, body: { error: { type: "account_not_ready", message: "not ready", request_id: "req_1" } } })
      await assert.rejects(client().checkout.create({ amount: 1000, description: "T" }), (err: any) => {
        assert.ok(err instanceof SDK.TollboothError)
        assert.equal(err.status, 409)
        assert.equal(err.type, "account_not_ready")
        assert.equal(err.message, "not ready")
        assert.equal(err.requestId, "req_1")
        return true
      })
    })

    test("only genuinely transient failures are retried", async () => {
      const cases: [number, string, boolean][] = [
        [500, "api_error", true],
        [503, "api_error", true],
        [429, "rate_limit_exceeded", true],
        [402, "card_declined", false],
        [404, "resource_missing", false],
        [401, "authentication_error", false],
        [400, "invalid_request_error", false],
      ]
      for (const [status, type, shouldRetry] of cases) {
        const sdk = client({ maxRetries: 2 })
        respond = () => ({ status, body: { error: { type, message: "x" } } })
        await assert.rejects(sdk.payments.list())
        const attempts = captures.length
        if (shouldRetry) assert.equal(attempts, 3, `${status} should be retried`)
        else assert.equal(attempts, 1, `${status} must not be retried`)
        captures = []
      }
    })

    test("a 409 saying the request is still in flight is retried", async () => {
      // The first attempt with this key is still running; asking again is right.
      const sdk = client({ maxRetries: 2 })
      respond = () => ({ status: 409, body: { error: { type: "idempotent_request_in_progress", message: "wait" } } })
      await assert.rejects(sdk.checkout.create({ amount: 1000, description: "T" }))
      assert.equal(captures.length, 3)
    })

    test("a network failure is retried and then reported", async () => {
      const sdk = client({ maxRetries: 1 })
      globalThis.fetch = (async () => {
        throw new TypeError("fetch failed")
      }) as typeof fetch
      await assert.rejects(sdk.payments.list(), (err: any) => {
        assert.equal(err.retryable, true)
        return true
      })
    })

    test("a non-JSON error body still produces a usable error", async () => {
      globalThis.fetch = (async () => new Response("<html>502</html>", { status: 502 })) as typeof fetch
      await assert.rejects(client({ maxRetries: 0 }).payments.list(), SDK.TollboothError)
    })

    test("retryable is false for errors that will never succeed", () => {
      assert.equal(new SDK.TollboothError("x", { status: 404 }).retryable, false)
      assert.equal(new SDK.TollboothError("x", { status: 429 }).retryable, true)
      assert.equal(new SDK.TollboothError("x", { status: 0 }).retryable, true)
    })
  })

  describe("webhook verification", () => {
    const secret = "whsec_sdk_test"
    const payload = JSON.stringify({ id: "evt_1", type: "payment.succeeded" })

    test("accepts a genuine signature", async () => {
      const { header } = await SDK.signPayload(secret, payload)
      assert.equal(await SDK.verifySignature({ payload, header, secret }), true)
    })

    test("returns a boolean, unlike the server helper's { ok, reason }", async () => {
      const { header } = await SDK.signPayload(secret, payload)
      assert.strictEqual(await SDK.verifySignature({ payload, header, secret }), true)
    })

    test("rejects a tampered payload, wrong secret, and a stale timestamp", async () => {
      const { header } = await SDK.signPayload(secret, payload)
      assert.equal(await SDK.verifySignature({ payload: payload + " ", header, secret }), false)
      assert.equal(await SDK.verifySignature({ payload, header, secret: "whsec_other" }), false)
      assert.equal(await SDK.verifySignature({ payload, header: "nonsense", secret }), false)

      const old = await SDK.signPayload(secret, payload, Math.floor(Date.now() / 1000) - 3600)
      assert.equal(await SDK.verifySignature({ payload, header: old.header, secret }), false)
      assert.equal(await SDK.verifySignature({ payload, header: old.header, secret, toleranceSeconds: 7200 }), true)
    })
  })
})
