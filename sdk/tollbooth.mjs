/**
 * Tollbooth JavaScript/TypeScript SDK.
 *
 * Zero dependencies, works in Node 18+, Bun, Deno, Cloudflare Workers and modern
 * browsers. Written as plain ESM with JSDoc types so it can be dropped in anywhere
 * without a build step.
 *
 *   import { Tollbooth } from "@tollbooth/sdk"
 *   const tollbooth = new Tollbooth({ apiKey: process.env.TOLLBOOTH_KEY })
 *
 * Every write carries an idempotency key automatically, so a retry after a timeout
 * returns the original payment instead of charging twice. That is the one mistake
 * people make when integrating a gateway, so the SDK doesn't let you.
 */

const DEFAULT_BASE = "https://tollbooth.axxes.club/api/v1"
const DEFAULT_TIMEOUT_MS = 30_000
const VERSION = "1.0.0"

export class TollboothError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, type?: string, requestId?: string, code?: string }} [info]
   */
  constructor(message, info = {}) {
    super(message)
    this.name = "TollboothError"
    this.status = info.status ?? 0
    this.type = info.type ?? "api_error"
    this.requestId = info.requestId
  }

  /** True when retrying the same request could plausibly succeed. */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

/** @param {string} value */
function defaultIdempotencyKey(value) {
  const random = Math.random().toString(36).slice(2, 10)
  return typeof value === "string" && value ? value : random
}

export class Tollbooth {
  /**
   * @param {{ apiKey: string, baseUrl?: string, timeoutMs?: number, maxRetries?: number }} options
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE, timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = 2 } = {}) {
    if (!apiKey) throw new Error("Tollbooth: apiKey is required")
    if (!/^tb_(live|test)_/.test(apiKey)) {
      throw new Error("Tollbooth: apiKey must start with tb_live_ or tb_test_")
    }
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, "")
    this.timeoutMs = timeoutMs
    this.maxRetries = maxRetries
    /** The mode is encoded in the key, so a test key can never touch real money. */
    this.mode = /** @type {"live" | "test"} */ (apiKey.startsWith("tb_test_") ? "test" : "live")
  }

  /**
   * @param {string} path
   * @param {{ method?: string, body?: unknown, query?: Record<string, string|number|undefined>, idempotencyKey?: string, headers?: Record<string,string> }} [options]
   */
  async request(path, options = {}) {
    const { method = "GET", body, query, idempotencyKey, headers = {} } = options
    const url = new URL(this.baseUrl + path)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
    }

    const method_ = method.toUpperCase()
    const isWrite = method_ !== "GET"
    const headers_ = {
      authorization: `Bearer ${this.apiKey}`,
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(isWrite ? { "idempotency-key": defaultIdempotencyKey(idempotencyKey) } : {}),
      ...headers,
    }

    let lastError
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await fetch(url, {
          method: method_,
          headers: headers_,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        })

        const text = await response.text()
        const payload = text ? JSON.parse(text) : {}

        if (!response.ok) {
          const error = new TollboothError(payload?.error?.message ?? `Request failed with ${response.status}`, {
            status: response.status,
            type: payload?.error?.type,
            requestId: payload?.error?.request_id ?? response.headers.get("x-request-id") ?? undefined,
          })
          // Only retry what could plausibly be transient. A 402 or 404 will not fix itself.
          if (!error.retryable || attempt === this.maxRetries) throw error
          lastError = error
        } else {
          return payload
        }
      } catch (err) {
        if (err instanceof TollboothError && (!err.retryable || attempt === this.maxRetries)) throw err
        lastError = err instanceof TollboothError ? err : new TollboothError(String(err?.message ?? err), { status: 0 })
      } finally {
        clearTimeout(timer)
      }
      // Exponential backoff, with jitter so a fleet doesn't retry in lockstep.
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 250 + Math.random() * 100))
    }
    throw lastError ?? new TollboothError("Request failed")
  }

  get checkout() {
    return {
      /**
       * Creates a hosted checkout and returns the payment.
       * @param {{ price?: string, amount?: number, currency?: string, description?: string, quantity?: number, reference?: string, customer?: string, customer_email?: string, metadata?: Record<string,string>, success_url?: string, cancel_url?: string }} params
       * @param {{ idempotencyKey?: string }} [options]
       */
      create: (params, options) =>
        this.request("/checkout-sessions", { method: "POST", body: params, idempotencyKey: options?.idempotencyKey }),
    }
  }

  get payments() {
    return {
      /** @param {{ id: string }} params */
      retrieve: ({ id }) => this.request(`/payments/${encodeURIComponent(id)}`),
      /**
       * @param {{ limit?: number, starting_after?: string, status?: string, customer?: string, reference?: string, mode?: "live"|"test" }} [params]
       */
      list: (params = {}) => this.request("/payments", { query: params }),
    }
  }

  get refunds() {
    return {
      /**
       * @param {{ payment_id: string, amount?: number, reason?: string, note?: string }} params
       * @param {{ idempotencyKey?: string }} [options]
       */
      create: (params, options) => this.request("/refunds", { method: "POST", body: params, idempotencyKey: options?.idempotencyKey }),
      /** @param {{ id: string }} params */
      retrieve: ({ id }) => this.request(`/refunds/${encodeURIComponent(id)}`),
      /** @param {{ payment_id?: string, limit?: number }} [params] */
      list: (params = {}) => this.request("/refunds", { query: params }),
    }
  }

  get customers() {
    return {
      /** @param {{ email: string, name?: string, phone?: string, metadata?: Record<string,string> }} params */
      create: (params) => this.request("/customers", { method: "POST", body: params }),
      /** @param {{ id: string }} params */
      retrieve: ({ id }) => this.request(`/customers/${encodeURIComponent(id)}`),
      /** @param {{ email?: string, q?: string, limit?: number }} [params] */
      list: (params = {}) => this.request("/customers", { query: params }),
      /** @param {{ id: string, name?: string, phone?: string, metadata?: Record<string,string> }} params */
      update: ({ id, ...params }) => this.request(`/customers/${encodeURIComponent(id)}`, { method: "PATCH", body: params }),
    }
  }

  get products() {
    return {
      /** @param {{ name: string, description?: string, metadata?: Record<string,string> }} params */
      create: (params) => this.request("/products", { method: "POST", body: params }),
      /** @param {{ id: string }} params */
      retrieve: ({ id }) => this.request(`/products/${encodeURIComponent(id)}`),
      /** @param {{ limit?: number }} [params] */
      list: (params = {}) => this.request("/products", { query: params }),
    }
  }

  get prices() {
    return {
      /** @param {{ product?: string, amount: number, currency?: string, nickname?: string, lookup_key?: string }} params */
      create: (params) => this.request("/prices", { method: "POST", body: params }),
      /** @param {{ id: string }} params */
      retrieve: ({ id }) => this.request(`/prices/${encodeURIComponent(id)}`),
      /** @param {{ product?: string, limit?: number }} [params] */
      list: (params = {}) => this.request("/prices", { query: params }),
    }
  }

  get links() {
    return {
      /** @param {{ price: string, name?: string, slug?: string, success_url?: string, cancel_url?: string, allow_quantity?: boolean }} params */
      create: (params) => this.request("/links", { method: "POST", body: params }),
      /** @param {{ id: string }} params */
      retrieve: ({ id }) => this.request(`/links/${encodeURIComponent(id)}`),
      /** @param {{ limit?: number }} [params] */
      list: (params = {}) => this.request("/links", { query: params }),
    }
  }

  get webhooks() {
    return {
      /** @param {{ url: string, events?: string[], description?: string }} params */
      create: (params) => this.request("/webhook-endpoints", { method: "POST", body: params }),
      /** @param {{ id: string }} params */
      retrieve: ({ id }) => this.request(`/webhook-endpoints/${encodeURIComponent(id)}`),
      /** @param {{ limit?: number }} [params] */
      list: (params = {}) => this.request("/webhook-endpoints", { query: params }),
      /** @param {{ id: string }} params */
      remove: ({ id }) => this.request(`/webhook-endpoints/${encodeURIComponent(id)}`, { method: "DELETE" }),
      /** @param {{ id: string, status?: "delivered" | "failed" | "pending", limit?: number }} params */
      deliveries: ({ id, ...params }) => this.request(`/webhook-endpoints/${encodeURIComponent(id)}/deliveries`, { query: params }),
    }
  }

  /** The workspace's live balance at Stripe. */
  balance() {
    return this.request("/balance")
  }
}

export default Tollbooth
export { VERSION as version }

/**
 * HMAC-SHA256 of a string, as hex.
 * Web Crypto is async but present in every runtime this SDK targets (Node 18+,
 * Bun, Deno, Workers, browsers), which beats branching on `node:crypto`.
 * @param {string} secret
 * @param {string} value
 * @returns {Promise<string>}
 */
async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Verify a `Tollbooth-Signature` header against a raw request body.
 *
 * Use this in every webhook handler. Skipping it means anyone who learns your URL can
 * POST a fake "payment succeeded" and mark goods as paid. The timestamp is part of
 * the signed string, so a captured request can't be replayed later either.
 *
 * @param {{ payload: string, header: string, secret: string, toleranceSeconds?: number }} options
 * @returns {Promise<boolean>}
 */
export async function verifySignature({ payload, header, secret, toleranceSeconds = 300 }) {
  if (!header || !secret) return false

  const parts = Object.fromEntries(
    header.split(",").map((pair) => {
      const index = pair.indexOf("=")
      return [pair.slice(0, index).trim(), pair.slice(index + 1).trim()]
    }),
  )
  const timestamp = Number(parts.t)
  const signature = parts.v1
  if (!Number.isFinite(timestamp) || !signature) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) return false

  const expected = await hmacHex(secret, `${timestamp}.${payload}`)
  // Constant-time-ish compare: both are fixed-length hex.
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

/**
 * Build a signed header. Exposed so integrators can test their handler against a
 * known fixture without needing a real delivery.
 *
 * @param {string} secret
 * @param {string} payload
 * @param {number} [timestamp]
 * @returns {Promise<string>}
 */
export async function signPayload(secret, payload, timestamp = Math.floor(Date.now() / 1000)) {
  const mac = await hmacHex(secret, `${timestamp}.${payload}`)
  return { header: `t=${timestamp},v1=${mac}`, timestamp, mac }
}
