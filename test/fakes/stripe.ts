/**
 * A recording stand-in for the Stripe SDK.
 *
 * The gateway's interesting logic — fees, refund reservation, retries, mode
 * handling — is all in our code, and none of it should need network access or real
 * money to be tested. This records every call and lets a test script the response or
 * force a failure, so failure paths are as testable as happy ones.
 *
 * The client in `src/lib/stripe.ts` is cached per mode, so the state lives on
 * `globalThis`: every test sees the same recorder no matter which instance it holds.
 */
import { createHmac, randomUUID } from "node:crypto"

export class StripeError extends Error {
  code?: string
  type?: string
  constructor(message: string, opts: { code?: string; type?: string } = {}) {
    super(message)
    this.name = "StripeError"
    this.code = opts.code
    this.type = opts.type
  }
}
export const errors = { StripeError }

export type Call = { op: string; args: unknown[] }

type Handlers = Record<string, (...args: any[]) => any>

type State = {
  calls: Call[]
  handlers: Handlers
  accounts: Record<string, any>
  sessions: any[]
  refunds: any[]
}

const KEY = Symbol.for("tollbooth.test.stripe")

function state(): State {
  const g = globalThis as any
  g[KEY] ??= { calls: [], handlers: {}, accounts: {}, sessions: [], refunds: [] }
  return g[KEY] as State
}

export const __stripe = {
  /** Forget every recorded call and scripted response. Call between tests. */
  reset() {
    const s = state()
    s.calls = []
    s.handlers = {}
    s.accounts = {}
    s.sessions = []
    s.refunds = []
  },
  /** Script one operation. Return a value to succeed, or throw to simulate an error. */
  on(op: string, handler: (...args: any[]) => any) {
    state().handlers[op] = handler
  },
  calls: (op?: string) => (op ? state().calls.filter((c) => c.op === op) : state().calls),
  resetCalls: () => {
    state().calls = []
  },
  /** Register a connected account that the gateway can find. */
  account(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    state().accounts[id] = {
      id,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      country: "US",
      default_currency: "usd",
      settings: { payouts: { schedule: "manual" } },
      requirements: { currently_due: [] },
      ...overrides,
    }
    return state().accounts[id]
  },
}

/** Stripe ids are unique across every account, so the fake's must be too. */
function unique() {
  return randomUUID().replaceAll("-", "").slice(0, 16)
}

function record(op: string, args: unknown[]) {
  const s = state()
  s.calls.push({ op, args })
  const handler = s.handlers[op]
  if (handler) return handler(...args)
  return undefined
}

export default class FakeStripe {
  readonly key: string
  readonly options: any
  constructor(key: string, options: any = {}) {
    this.key = key
    this.options = options
    if (!/^sk_(live|test)_/.test(key)) {
      // lib/stripe.ts guards this too; failing here proves the guard is unreachable
      // in a normal test rather than silently accepted.
      throw new Error(`Fake Stripe received a key that is not a Stripe key: ${key}`)
    }
  }

  accounts = {
    async create(params: any): Promise<any> {
      const result: any = record("accounts.create", [params]) ?? {}
      const id: string = result.id ?? `acct_${unique()}`
      return { ...(__stripe.account(id) as Record<string, unknown>), ...(result as Record<string, unknown>), id }
    },
    async retrieve(id: string): Promise<any> {
      const result = record("accounts.retrieve", [id])
      if (result) return result
      const found = state().accounts[id]
      if (!found) throw new StripeError(`No such account: ${id}`, { code: "resource_missing" })
      return found
    },
    async createLoginLink(id: string) {
      return record("accounts.createLoginLink", [id]) ?? { object: "login_link", url: `https://connect.stripe.test/${id}` }
    },
  }

  accountLinks = {
    async create(params: any) {
      return record("accountLinks.create", [params]) ?? { object: "account_link", url: "https://connect.stripe.test/setup" }
    },
  }

  checkout = {
    sessions: {
      async create(params: any) {
        const result = record("checkout.sessions.create", [params]) ?? {}
        const id = result.id ?? `cs_test_${unique()}`
        const session = {
          id,
          url: `https://checkout.stripe.test/${id}`,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          payment_status: "unpaid",
          ...result,
        }
        state().sessions.push(session)
        return session
      },
    },
  }

  refunds = {
    async create(params: any) {
      const result = record("refunds.create", [params]) ?? {}
      const refund = { id: result.id ?? `re_${unique()}`, status: "succeeded", ...result }
      state().refunds.push(refund)
      return refund
    },
  }

  balance = {
    async retrieve(params?: any, options?: any): Promise<any> {
      const result = record("balance.retrieve", [params, options])
      if (result) return result
      return {
        object: "balance",
        available: [{ amount: 5000, currency: "usd" }],
        pending: [{ amount: 1200, currency: "usd" }],
        livemode: (this as any).mode === "live",
      }
    },
  }

  payouts = {
    async list(params?: any, options?: any) {
      const result = record("payouts.list", [params, options])
      if (result) return result
      return { object: "list", data: [{ id: "po_1", amount: -5000, currency: "usd", arrival_date: Math.floor(Date.now() / 1000) + 86400, status: "paid" }] }
    },
  }

  webhooks = {
    /**
     * Verifies the signature exactly as the real SDK does, then returns the parsed
     * event. Anything that always succeeded would make the "forged request is
     * rejected" tests pass for the wrong reason.
     */
    constructEvent(payload: string, signature: string, secret: string): any {
      const scripted = record("webhooks.constructEvent", [payload, signature, secret])
      if (scripted) return scripted

      const parts = Object.fromEntries(
        String(signature ?? "")
          .split(",")
          .map((pair) => {
            const index = pair.indexOf("=")
            return [pair.slice(0, index), pair.slice(index + 1)]
          })
      )
      const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex")
      if (!parts.v1 || parts.v1 !== expected) {
        throw new StripeError("No signatures found matching the expected signature for payload", {
          code: "signature_verification_failed",
        })
      }
      return JSON.parse(payload)
    },
  }

  get mode() {
    return this.key.startsWith("sk_live_") ? "live" : "test"
  }
}
