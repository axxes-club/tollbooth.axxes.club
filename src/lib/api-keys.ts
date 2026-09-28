import "server-only"
import { createHash, randomBytes } from "crypto"
import { and, eq, isNull } from "drizzle-orm"
import { db, schema } from "@/lib/db"

const hash = (key: string) => createHash("sha256").update(key).digest("hex")

export function generateApiKey() {
  const secret = `tb_live_${randomBytes(24).toString("base64url")}`
  return { secret, prefix: secret.slice(0, 12), keyHash: hash(secret) }
}

export type ApiCaller = { tenantId: string; apiKeyId: string }

// Resolves `Authorization: Bearer tb_live_…` to the workspace it belongs to
export async function authenticateApiKey(req: Request): Promise<ApiCaller | null> {
  const header = req.headers.get("authorization") ?? ""
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!key.startsWith("tb_")) return null

  const [row] = await db
    .select({ id: schema.tollboothApiKeys.id, tenantId: schema.tollboothApiKeys.tenantId })
    .from(schema.tollboothApiKeys)
    .where(and(eq(schema.tollboothApiKeys.keyHash, hash(key)), isNull(schema.tollboothApiKeys.revokedAt)))
  if (!row) return null

  db.update(schema.tollboothApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.tollboothApiKeys.id, row.id))
    .catch(() => {})
  return { tenantId: row.tenantId, apiKeyId: row.id }
}
