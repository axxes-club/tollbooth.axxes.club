import { Logo } from "@/components/logo"

export default function NoTenantPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm">
        <Logo size="lg" />
        <h1 className="mt-10 text-2xl font-semibold tracking-tight">No workspace yet</h1>
        <p className="mt-2 text-sm text-muted">
          Your account isn&apos;t a member of any AXXES workspace. Finish onboarding in the members portal, then come back.
        </p>
        <a className="btn-primary mt-6" href="https://members.axxes.club/onboarding">Open members portal</a>
      </div>
    </main>
  )
}
