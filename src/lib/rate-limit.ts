import "server-only"

// Fixed-window counter kept in module scope. Serverless isolates give per-instance
// limits, which is enough to stop a runaway client and a credential-guessing loop.
// Swap the Map for Redis/Upstash if you need a limit shared across regions.
const buckets = new Map<string, { count: number; resetAt: number }>()

export type RateLimit = { limit: number; windowMs: number }

export const RATE_LIMITS = {
  read: { limit: 300, windowMs: 60_000 },
  write: { limit: 120, windowMs: 60_000 },
} satisfies Record<string, RateLimit>

export function rateLimit(key: string, { limit, windowMs }: RateLimit, now = Date.now()): RateLimitResult {
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    // Opportunistic sweep so a long-lived process can't accumulate dead keys.
    if (buckets.size > 5_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k)
    }
    return { ok: true, limit, remaining: limit - 1, resetAt: now + windowMs }
  }
  bucket.count += 1
  const remaining = Math.max(0, limit - bucket.count)
  return { ok: bucket.count <= limit, limit, remaining, resetAt: bucket.resetAt }
}

export type RateLimitResult = { ok: boolean; limit: number; remaining: number; resetAt: number }
