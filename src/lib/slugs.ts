import "server-only"
import { randomBytes } from "crypto"
import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"

/** URL-safe, unambiguous alphabet: no 0/o or 1/l to mistype. */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"

function randomSlug(length = 10) {
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length]
  return out
}

/** Slugs appear in URLs customers type, so collisions must be resolved, not retried forever. */
export async function uniqueLinkSlug(preferred?: string) {
  const base = preferred
    ? preferred.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
    : ""

  if (base) {
    const [taken] = await db.select({ id: schema.tollboothLinks.id }).from(schema.tollboothLinks).where(eq(schema.tollboothLinks.slug, base))
    if (!taken) return base
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = base ? `${base}-${randomSlug(4)}` : randomSlug()
    const [taken] = await db.select({ id: schema.tollboothLinks.id }).from(schema.tollboothLinks).where(eq(schema.tollboothLinks.slug, candidate))
    if (!taken) return candidate
  }
  return `${randomSlug(8)}-${Date.now().toString(36)}`
}
