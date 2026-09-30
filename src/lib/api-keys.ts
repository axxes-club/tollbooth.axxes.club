import "server-only"
import { createHash, randomBytes, timingSafeEqual } from "crypto"
import { and, eq, isNull } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import type { TbMode } from "@/lib/db/schema/tollbooth"

const hash = (key: string) => createHash("sha256").update(key).digest("hex")

/** What a key can do. Read scopes are implied by every write scope. */
export const SCOPES = ["payments:read", "payments:write", "refunds:write", "catalog:write", "webhooks:write"] as const
export type Scope = (typeof SCOPES)[number]

const SCOPE_LABEL: Record<Scope, string> = {
  "payments:read": "Read payments, customers and balances",
  "payments:write": "Create checkouts and charge customers",
  "refunds:write": "Issue refunds",
  "catalog:write": "Manage products, prices and payment links",
  "webhooks:write": "Manage webhook endpoints",
}

/** Refunds are a payment operation, so they ride on the payments scopes too. */
export function scopeSatisfied(granted: string[], required: Scope) {
  if (granted.length === 0) return true // legacy keys created before scopes existed
  if (granted.includes(required)) return true
  if (required === "refunds:write" && granted.includes("payments:write")) return true
  if (required === "payments:read" && granted.some((s) => s.endsWith(":read") || s.endsWith(":write"))) return true
  return false
}

export function scopesForWrite(): Scope[] {
  return ["payments:write", "refunds:write", "catalog:write", "webhooks:write"]
}

export const scopeOptions = (): { value: Scope; label: string }[] => SCOPES.map((value) => ({ value, label: SCOPE_LABEL[value] }))

/**
 * Mints a key. The prefix carries the mode so a secret key is self-describing:
 * `tb_live_…` can move real money, `tb_test_…` cannot.
 */
export function generateApiKey(mode: TbMode = "live") {
  const secret = `tb_${mode}_${randomBytes(24).toString("base64url")}`
  return { secret, prefix: secret.slice(0, 11), mode, keyHash: hash(secret) }
}

export function generateWebhookSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`
}

export type ApiCaller = { tenantId: string; apiKeyId: string; mode: TbMode; scopes: string[] }

/** Reads `tb_live_…` or `tb_test_…` out of the Authorization header. */
export function bearerToken(req: Request): { key: string; mode: TbMode } | null {
  const header = req.headers.get("authorization") ?? ""
  // RFC 7235 makes the auth scheme case-insensitive, and some clients and proxies
  // lower-case it. Rejecting `bearer …` would be a confusing 401.
  const key = /^bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() ?? ""
  const match = /^tb_(live|test)_/.exec(key)
  return match ? { key, mode: match[1] as TbMode } : null
}

/**
 * Resolves a bearer token to the workspace it belongs to. A `tb_test_` key never
 * authenticates against a live-mode row, so a mislabelled key fails closed.
 */
export async function authenticateApiKey(req: Request): Promise<ApiCaller | null> {
  const token = bearerToken(req)
  if (!token) return null

  const [row] = await db
    .select({
      id: schema.tollboothApiKeys.id,
      tenantId: schema.tollboothApiKeys.tenantId,
      mode: schema.tollboothApiKeys.mode,
      scopes: schema.tollboothApiKeys.scopes,
    })
    .from(schema.tollboothApiKeys)
    .where(and(eq(schema.tollboothApiKeys.keyHash, hash(token.key)), isNull(schema.tollboothApiKeys.revokedAt)))
  if (!row || row.mode !== token.mode) return null

  // Fire-and-forget: a stale `last used` is never worth blocking a request for.
  db.update(schema.tollboothApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.tollboothApiKeys.id, row.id))
    .catch(() => {})

  return { tenantId: row.tenantId, apiKeyId: row.id, mode: token.mode, scopes: row.scopes ?? [] }
}

/** Constant-time HMAC compare, for webhook secrets and signature checks. */
export function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
