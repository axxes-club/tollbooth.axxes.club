import "server-only"
import {randomUUID} from "node:crypto"
import { and, eq, lt, isNull } from "drizzle-orm"
import { db, schema } from "@/lib/db"

/** Handed to a handler so it can tell whether this request is the first attempt. */
export type IdempotencyGuard = { key:string;isReplay:boolean;checkpoint:Record<string,unknown>|null;assertOwnership:()=>Promise<void>;saveCheckpoint:(value:Record<string,unknown>)=>Promise<void> }

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
  mode?: "test" | "live"
  run: (guard:IdempotencyGuard) => Promise<{ status: number; body: Record<string, unknown> }>
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

  const leaseToken=randomUUID();
  const [claimed] = await db
    .insert(schema.tollboothIdempotencyKeys)
    .values({ key, tenantId, apiKeyId, method, path, requestHash,leaseToken,mode:args.mode??null })
    .onConflictDoNothing()
    .returning()

  const identity=()=>and(eq(schema.tollboothIdempotencyKeys.tenantId,tenantId),eq(schema.tollboothIdempotencyKeys.method,method),eq(schema.tollboothIdempotencyKeys.path,path),eq(schema.tollboothIdempotencyKeys.requestHash,requestHash),args.mode?eq(schema.tollboothIdempotencyKeys.mode,args.mode):undefined);
  function validate(row:KeyRow){if(row.tenantId!==tenantId||row.requestHash!==requestHash||row.method!==method||row.path!==path||(args.mode&&(row.mode??row.responseBody?.mode)!==args.mode))throw new IdempotencyError('That Idempotency-Key was already used with a different request body');}
  async function execute(checkpoint:Record<string,unknown>|null,isReplay:boolean){
    const owner=()=>and(eq(schema.tollboothIdempotencyKeys.key,key),eq(schema.tollboothIdempotencyKeys.leaseToken,leaseToken),identity(),isNull(schema.tollboothIdempotencyKeys.completedAt));
    const guard:IdempotencyGuard={key,isReplay,checkpoint,assertOwnership:async()=>{const [owned]=await db.update(schema.tollboothIdempotencyKeys).set({lockedAt:new Date()}).where(owner()).returning();if(!owned)throw new IdempotencyInProgressError();},saveCheckpoint:async(value)=>{
      const saved={...value,preparedAt:guard.checkpoint?.preparedAt??new Date().toISOString()};
      if(JSON.stringify(saved).length>16384)throw new IdempotencyError('Operation checkpoint is too large');
      const [owned]=await db.update(schema.tollboothIdempotencyKeys).set({responseBody:saved,lockedAt:new Date()}).where(owner()).returning();if(!owned)throw new IdempotencyInProgressError();guard.checkpoint=saved;
    }};
    try{const result=await args.run(guard);const [finished]=await db.update(schema.tollboothIdempotencyKeys).set({responseStatus:result.status,responseBody:result.body,completedAt:new Date()}).where(owner()).returning();if(!finished)throw new IdempotencyInProgressError();return json(result.status,result.body,{'idempotent-replay':isReplay?'true':'false'},requestId,headers);}
    catch(error){if(guard.checkpoint){await db.update(schema.tollboothIdempotencyKeys).set({lockedAt:new Date(0)}).where(owner()).catch(()=>{});}else{await db.delete(schema.tollboothIdempotencyKeys).where(owner()).catch(()=>{});}throw error;}
  }
  if(claimed)return execute(null,false);

  const [existing] = await db.select().from(schema.tollboothIdempotencyKeys).where(eq(schema.tollboothIdempotencyKeys.key, key))

  if (!existing) throw new IdempotencyError("Could not record this Idempotency-Key. Retry the request.")
  validate(existing);
  if (existing.tenantId !== tenantId) throw new IdempotencyError("That Idempotency-Key belongs to a different workspace")
  if (existing.requestHash !== requestHash || existing.method!==method || existing.path!==path || (args.mode && (existing.mode??existing.responseBody?.mode)!==args.mode)) {
    throw new IdempotencyError("That Idempotency-Key was already used with a different request body")
  }

  if (!existing.completedAt) {
    const age = Date.now() - existing.lockedAt.getTime()

    if (age <= LOCK_TTL_MS) {
      // The first attempt is still running. Running the handler again here is exactly
      // the double charge this guard exists to prevent, so wait for it to settle.
      const settled = await waitForCompletion(key)

      if (settled?.completedAt) {
        validate(settled);
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
      return withIdempotency(args);
    } else {
      // Atomically acquire the expired lease. Recovery uses its durable domain checkpoint.
      const [leased]=await db.update(schema.tollboothIdempotencyKeys).set({lockedAt:new Date(),leaseToken}).where(and(eq(schema.tollboothIdempotencyKeys.key,key),identity(),lt(schema.tollboothIdempotencyKeys.lockedAt,new Date(Date.now()-LOCK_TTL_MS)),isNull(schema.tollboothIdempotencyKeys.completedAt))).returning();
      if(!leased)throw new IdempotencyInProgressError();
      validate(leased);
      return execute(leased.responseBody??null,true);
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
