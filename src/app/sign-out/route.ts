import { NextResponse, type NextRequest } from "next/server"
import { auth, HANDSHAKE_URL } from "@/lib/auth"
import { publicOrigin } from "@/lib/public-origin"

export async function GET(req: NextRequest) {
  if (HANDSHAKE_URL) {
    const back = new URL("/dashboard", publicOrigin(req)).href
    return NextResponse.redirect(`${HANDSHAKE_URL}/sign-out?redirect=${encodeURIComponent(back)}`)
  }

  const result = await auth.api.signOut({ headers: req.headers, asResponse: true }).catch(() => null)
  const res = NextResponse.redirect(new URL("/sign-in", publicOrigin(req)))
  result?.headers.getSetCookie().forEach((cookie) => res.headers.append("set-cookie", cookie))
  return res
}
