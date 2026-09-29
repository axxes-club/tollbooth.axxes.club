import "server-only"
import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"

/** Handed to a handler so it can tell whether this request is the first attempt. */
export type IdempotencyGuard = { key: string; isReplay: false }

type Args = {
  key: string
  tenantId: string
  apiKeyId: string
  method: string
  path: string
  requestHash: string
  requestId: string
  run: () => Promise<{ status: number; body: Record<string, unknown> }>
}

/** Keys older than this are considered abandoned and may be reused. */
const LOCK_TTL_MS = 60 * 60 * 1000

/**
 * Replay guard for `Idempotency-Key`. The first request for a key claims it with an
 * insert; a retry finds the row and gets the original response back. A key reused
 * with a different body is rejected rather than silently replayed, which is how a
 * double charge from a confused retry loop gets caught.
 */
export async function withIdempotency(args: Args): Promise<Response> {
  const { key, tenantId, apiKeyId, method, path, requestHash, requestId } = args
  if (key.length > 255) throw new IdempotencyError("Idempotency-Key must be 255 characters or fewer")

  const [claimed] = await db
    .insert(schema.tollboothIdempotencyKeys)
    .values({ key, tenantId, apiKeyId, method, path, requestHash })
    .onConflictDoNothing()
    .returning()

  if (claimed) {
    try {
      const result = await args.run()
      await db
        .update(schema.tollboothIdempotencyKeys)
        .set({ responseStatus: result.status, responseBody: result.body, completedAt: new Date() })
        .where(eq(schema.tollboothIdempotencyKeys.key, key))
      return json(result.status, result.body, { "idempotent-replay": "false" }, requestId)
    } catch (err) {
      // A failed request must not poison the key: release it so the caller can retry.
      await db.delete(schema.tollboothIdempotencyKeys).where(eq(schema.tollboothIdempotencyKeys.key, key)).catch(() => {})
      throw err
    }
  }

  const [existing] = await db.select().from(schema.tollboothIdempotencyKeys).where(eq(schema.tollboothIdempotencyKeys.key, key))

  if (!existing) throw new IdempotencyError("Could not record this Idempotency-Key. Retry the request.")
  if (existing.tenantId !== tenantId) throw new IdempotencyError("That Idempotency-Key belongs to a different workspace")
  if (existing.requestHash !== requestHash) {
    throw new IdempotencyError("That Idempotency-Key was already used with a different request body")
  }

  if (!existing.completedAt || Date.now() - existing.lockedAt.getTime() > LOCK_TTL_MS) {
    // The first attempt died mid-flight. Re-run it under the same key.
    const result = await args.run()
    await db
      .update(schema.tollboothIdempotencyKeys)
      .set({ responseStatus: result.status, responseBody: result.body, lockedAt: new Date(), completedAt: new Date() })
      .where(eq(schema.tollboothIdempotencyKeys.key, key))
    return json(result.status, result.body, { "idempotent-replay": "false" }, requestId)
  }

  return json(existing.responseStatus ?? 200, existing.responseBody ?? {}, { "idempotent-replay": "true" }, requestId)
}

export class IdempotencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IdempotencyError"
  }
}

function json(status: number, body: Record<string, unknown>, extra: Record<string, string>, requestId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      "cache-control": "no-store",
      ...extra,
    },
  })
}
