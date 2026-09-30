import "server-only"
import { cache } from "react"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

/**
 * The organization's white-label brand, when it has one switched on.
 *
 * A white-label customer uses the AXXES products under its own name. What it
 * looks like lives in the shared database — `tenants.settings.whiteLabel` and
 * the tenant's `brand_profiles` row — and is edited by AXXES staff in
 * members.axxes.club → White-label. Every *.axxes.club product reads it the
 * same way, so a customer looks the same in all of them.
 */
export type CustomerBrand = {
  name: string
  logoUrl: string | null
  iconUrl: string | null
  accent: string | null
  faviconUrl: string | null
  signInUrl: string
}

const hex = (v: unknown) => (typeof v === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()) ? v.trim() : null)
const url = (v: unknown) => {
  if (typeof v !== "string" || !v.trim()) return null
  try {
    const u = new URL(v.trim())
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}

export const getCustomerBrand = cache(async (tenantId: string): Promise<CustomerBrand | null> => {
  try {
    const result = await db.execute(sql`
      select t.name, t.settings -> 'whiteLabel' ->> 'slug' as slug, t.logo_url as tenant_logo, t.primary_color as tenant_color,
             b.brand_name, b.primary_color, b.logo_url, b.logo_icon_url, b.favicon_url
      from tenants t
      left join brand_profiles b on b.tenant_id = t.id
      where t.id = ${tenantId}
        and (t.settings -> 'whiteLabel' ->> 'enabled')::boolean is true
      limit 1
    `)
    const row = (result as unknown as { rows: Record<string, unknown>[] }).rows?.[0]
    if (!row) return null
    const handshake = (process.env.HANDSHAKE_URL || "https://handshake.axxes.club").replace(/\/$/, "")
    return {
      name: (typeof row.brand_name === "string" && row.brand_name) || String(row.name),
      logoUrl: url(row.logo_url) ?? url(row.tenant_logo),
      iconUrl: url(row.logo_icon_url),
      accent: hex(row.primary_color) ?? hex(row.tenant_color),
      faviconUrl: url(row.favicon_url),
      signInUrl: `${handshake}/o/${String(row.slug)}`,
    }
  } catch (error) {
    // Branding is decoration: never let it take the app down.
    console.error("white-label brand lookup failed", error)
    return null
  }
})
