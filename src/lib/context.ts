import "server-only"
import { cache } from "react"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, desc, eq, isNull, ne } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db, schema } from "@/lib/db"

export type Membership = {
  tenantId: string
  name: string
  slug: string
  role: string
  isPrimary: boolean
}

export type AppContext = {
  userId: string
  user: { name: string; email: string }
  tenant: { id: string; name: string; slug: string }
  role: string
  /** Every organization this person belongs to, so a switcher can offer them. */
  memberships: Membership[]
  /** True when there is a choice to make; a switcher should hide otherwise. */
  canSwitchOrg: boolean
}

/**
 * Which organization the cookie says is selected.
 *
 * The cookie is a preference, not a permission: it is only ever honoured if
 * the person is still a live member of that organization. A stale cookie from
 * a membership they have since left, or one somebody edited by hand, lands on
 * the default instead of granting access to anything.
 */
export const ORG_COOKIE = "axxes_org"

/** Every live membership, in the order the switcher should show them. */
export const listMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const rows = await db
    .select({
      tenantId: schema.tenantMemberships.tenantId,
      name: schema.tenants.name,
      slug: schema.tenants.slug,
      role: schema.tenantMemberships.role,
      isPrimary: schema.tenantMemberships.isPrimary,
    })
    .from(schema.tenantMemberships)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.tenantMemberships.tenantId))
    .where(
      and(
        eq(schema.tenantMemberships.userId, userId),
        isNull(schema.tenantMemberships.deletedAt),
        isNull(schema.tenants.deletedAt),
        ne(schema.tenants.status, "suspended"),
        ne(schema.tenants.status, "cancelled"),
      ),
    )
    .orderBy(desc(schema.tenantMemberships.isPrimary))

  return rows
    .map((r) => ({
      tenantId: r.tenantId,
      name: r.name,
      slug: r.slug,
      role: r.role,
      isPrimary: r.isPrimary === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

/**
 * Resolves the signed-in person and the organization they are working in.
 *
 * The selected organization wins if they are still a member of it; otherwise
 * the primary membership; otherwise the first by name. Every page and server
 * action goes through this, so all data access is organization-scoped.
 */
export const getContext = cache(async (tenantHint?: string): Promise<AppContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const memberships = await listMemberships(session.user.id)
  if (memberships.length === 0) return null
  if (tenantHint && !memberships.some(m => m.tenantId === tenantHint)) return null

  const selected = (await cookies()).get(ORG_COOKIE)?.value
  const chosen =
    (tenantHint ? memberships.find((m) => m.tenantId === tenantHint) : undefined) ??
    (selected ? memberships.find((m) => m.tenantId === selected) : undefined) ??
    memberships.find((m) => m.isPrimary) ??
    memberships[0]

  return {
    userId: session.user.id,
    user: { name: session.user.name, email: session.user.email },
    tenant: { id: chosen.tenantId, name: chosen.name, slug: chosen.slug },
    role: chosen.role,
    memberships,
    canSwitchOrg: memberships.length > 1,
  }
})

export async function requireContext(): Promise<AppContext> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")
  const ctx = await getContext()
  if (!ctx) redirect("/no-tenant")
  return ctx
}
