import { NextResponse } from "next/server"
import { switchOrganization } from "@/lib/actions/org"

/** A suite launch preference is revalidated by the existing server switch action. */
export async function GET(request: Request) {
  const tenant = new URL(request.url).searchParams.get("tenant")
  if (!tenant || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)) {
    return NextResponse.json({ error: "Invalid organization." }, { status: 400 })
  }
  const result = await switchOrganization(tenant)
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.error.includes("sign in") ? 401 : 403 })
  return NextResponse.redirect(new URL("/dashboard", request.url))
}
