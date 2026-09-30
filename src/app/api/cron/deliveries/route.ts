import { NextResponse } from "next/server"
import { deliverPending } from "@/lib/webhooks"
import { timingSafeEqual } from "crypto"

export const maxDuration = 60

/**
 * POST /api/cron/deliveries
 *
 * Retries queued webhook deliveries. The Stripe handler already drains what's due
 * after each event, so this exists for the case where the app was asleep when an
 * event landed: a customer turns their app on and the backlog clears within a minute.
 *
 * Vercel cron calls this once a day (see vercel.json; the Hobby plan allows no
 * more), with GET. It is also safe to POST to by hand, for a faster drain.
 * Requires `Authorization: Bearer $CRON_SECRET` when that is set.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
    const a = Buffer.from(provided)
    const b = Buffer.from(secret)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const results = await deliverPending(50)
  const delivered = results.filter((r) => r?.ok).length
  return NextResponse.json({ attempted: results.length, delivered, failed: results.length - delivered })
}

// Vercel cron jobs send GET.
export const GET = POST
