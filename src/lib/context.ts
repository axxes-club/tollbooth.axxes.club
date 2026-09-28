import "server-only"
import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, desc, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db, schema } from "@/lib/db"

export type AppContext = {
  userId: string
  user: { name: string; email: string }
  tenant: { id: string; name: string; slug: string }
  role: string
}

// Resolves the signed-in user and their primary AXXES tenant. Every page and
// server action goes through this, so all data access is tenant-scoped.
export const getContext = cache(async (): Promise<AppContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const [membership] = await db
    .select({
      role: schema.tenantMemberships.role,
      id: schema.tenants.id,
      name: schema.tenants.name,
      slug: schema.tenants.slug,
    })
    .from(schema.tenantMemberships)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.tenantMemberships.tenantId))
    .where(and(eq(schema.tenantMemberships.userId, session.user.id)))
    .orderBy(desc(schema.tenantMemberships.isPrimary))
    .limit(1)

  if (!membership) return null
  return {
    userId: session.user.id,
    user: { name: session.user.name, email: session.user.email },
    tenant: { id: membership.id, name: membership.name, slug: membership.slug },
    role: membership.role,
  }
})

export async function requireContext(): Promise<AppContext> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")
  const ctx = await getContext()
  if (!ctx) redirect("/no-tenant")
  return ctx
}
