import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth, HANDSHAKE_URL } from "@/lib/auth"
import { Logo } from "@/components/logo"
import { product } from "@/product.config"
import { SignInForm } from "./sign-in-form"

export default async function SignInPage() {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/dashboard")
  if (HANDSHAKE_URL) {
    const h = await headers()
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`
    redirect(`${HANDSHAKE_URL}/sign-in?redirect=${encodeURIComponent(`${origin}/dashboard`)}`)
  }
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <Logo size="lg" />
        <h1 className="mt-10 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">{product.tagline} Use your AXXES account.</p>
        <SignInForm />
        <p className="mt-6 text-center text-xs text-muted">
          No account?{" "}
          <a className="text-accent hover:underline" href="https://members.axxes.club/sign-up">Join AXXES</a>
          {" · "}
          <a className="text-accent hover:underline" href="https://members.axxes.club/forgot-password">Forgot password</a>
        </p>
      </div>
    </main>
  )
}
