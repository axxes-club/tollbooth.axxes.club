import Link from "next/link"
import { Logo } from "@/components/logo"

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Tollbooth home"><Logo /></Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/#features" className="hidden rounded-lg px-3 py-2 text-muted hover:text-text sm:block">Product</Link>
            <Link href="/pricing" className="rounded-lg px-3 py-2 text-muted hover:text-text">Pricing</Link>
            <Link href="/docs" className="rounded-lg px-3 py-2 text-muted hover:text-text">Docs</Link>
            <Link href="/dashboard" className="hidden rounded-lg px-3 py-2 text-muted hover:text-text sm:block">Sign in</Link>
            <Link href="/dashboard" className="btn-primary ml-2">Get started</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden sm:inline">·</span>
            <span>Payments powered by Stripe.</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/pricing" className="hover:text-text">Pricing</Link>
            <Link href="/docs" className="hover:text-text">API docs</Link>
            <a href="https://axxes.club" className="hover:text-text">AXXES</a>
            <a href="https://members.axxes.club" className="hover:text-text">AXXES Suite</a>
            <a href="mailto:hello@axxes.club" className="hover:text-text">hello@axxes.club</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
