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
  /** Headers to carry on every response, including replays (e.g. rate-limit state). */
  headers?: Record<string, string>
  run: () => Promise<{ status: number; body: Record<string, unknown> }>
}

/** A lock older than this means the first attempt died, and the key may be reused. */
const LOCK_TTL_MS = 60 * 60 * 1000

/**
 * How long a concurrent duplicate waits for the in-flight first attempt.
 *
 * Two identical requests arriving at once is the case this whole mechanism exists
 * for. The loser must not run the handler again, so it waits for the winner to
 * finish and returns its response. These are sub-second API calls, so a short wait
 * almost always produces the right answer rather than an error.
 */
const CONCURRENT_WAIT_MS = 5_000
const CONCURRENT_POLL_MS = 50

/**
 * Replay guard for `Idempotency-Key`. The first request for a key claims it with an
 * insert; a retry finds the row and gets the original response back. A key reused
 * with a different body is rejected rather than silently replayed, which is how a
 * double charge from a confused retry loop gets caught.
 */
export async function withIdempotency(args: Args): Promise<Response> {
  const { key, tenantId, apiKeyId, method, path, requestHash, requestId, headers } = args
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
      return json(result.status, result.body, { "idempotent-replay": "false" }, requestId, headers)
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

  if (!existing.completedAt) {
    const age = Date.now() - existing.lockedAt.getTime()

    if (age <= LOCK_TTL_MS) {
      // The first attempt is still running. Running the handler again here is exactly
      // the double charge this guard exists to prevent, so wait for it to settle.
      const settled = await waitForCompletion(key)

      if (settled?.completedAt) {
        return json(
          settled.responseStatus ?? 200,
          settled.responseBody ?? {},
          { "idempotent-replay": "true" },
          requestId,
          headers
        )
      }

      if (settled === null) {
        // Still running after the wait: the caller should come back shortly.
        throw new IdempotencyInProgressError()
      }

      // The row disappeared, so the first attempt failed and released the key.
      // Fall through and try to claim it again.
    } else {
      // The lock is older than the TTL: the first attempt died mid-flight and left
      // the key stranded. Re-run it under the same key.
      const result = await args.run()
      await db
        .update(schema.tollboothIdempotencyKeys)
        .set({ responseStatus: result.status, responseBody: result.body, lockedAt: new Date(), completedAt: new Date() })
        .where(eq(schema.tollboothIdempotencyKeys.key, key))
      return json(result.status, result.body, { "idempotent-replay": "false" }, requestId, headers)
    }
  }

  return json(existing.responseStatus ?? 200, existing.responseBody ?? {}, { "idempotent-replay": "true" }, requestId, headers)
}

type KeyRow = typeof schema.tollboothIdempotencyKeys.$inferSelect

/**
 * Polls until the in-flight attempt finishes.
 *
 * Returns the completed row, `null` if it is still running after the wait, or
 * `undefined` if the row was released because the first attempt failed.
 */
async function waitForCompletion(key: string): Promise<KeyRow | null | undefined> {
  const deadline = Date.now() + CONCURRENT_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CONCURRENT_POLL_MS))
    const [row] = await db
      .select()
      .from(schema.tollboothIdempotencyKeys)
      .where(eq(schema.tollboothIdempotencyKeys.key, key))
    if (!row) return undefined
    if (row.completedAt) return row
  }
  return null
}

/** The first attempt with this key is still running; the caller should retry shortly. */
export class IdempotencyInProgressError extends Error {
  constructor() {
    super("A request with this Idempotency-Key is still being processed. Retry in a moment.")
    this.name = "IdempotencyInProgressError"
  }
}

export class IdempotencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IdempotencyError"
  }
}

function json(
  status: number,
  body: Record<string, unknown>,
  extra: Record<string, string>,
  requestId: string,
  inherited: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      "cache-control": "no-store",
      ...inherited,
      ...extra,
    },
  })
}
