import Link from "next/link"
import { Logo } from "@/components/logo"

const NAV = [
  { href: "/#features", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
]

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Tollbooth home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-muted transition hover:text-text">
                {item.label}
              </Link>
            ))}
            <Link href="/dashboard" className="btn-ghost ml-1 hidden sm:inline-flex">
              Sign in
            </Link>
            <Link href="/dashboard" className="btn-primary ml-1">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 text-sm sm:px-6 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-muted">
              Payment infrastructure for AXXES businesses. Card processing by Stripe, everything else by us.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Product</p>
              <ul className="mt-3 space-y-2">
                <li><Link href="/#features" className="text-muted transition hover:text-text">Overview</Link></li>
                <li><Link href="/pricing" className="text-muted transition hover:text-text">Pricing</Link></li>
                <li><Link href="/docs" className="text-muted transition hover:text-text">API docs</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Use it</p>
              <ul className="mt-3 space-y-2">
                <li><Link href="/dashboard" className="text-muted transition hover:text-text">Dashboard</Link></li>
                <li><Link href="/dashboard/links" className="text-muted transition hover:text-text">Payment links</Link></li>
                <li><Link href="/dashboard/developers" className="text-muted transition hover:text-text">API keys</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">AXXES</p>
              <ul className="mt-3 space-y-2">
                <li><a href="https://axxes.club" className="text-muted transition hover:text-text">axxes.club</a></li>
                <li><a href="https://members.axxes.club" className="text-muted transition hover:text-text">AXXES Suite</a></li>
                <li><a href="mailto:hello@axxes.club" className="text-muted transition hover:text-text">hello@axxes.club</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-line/60">
          <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">
            © {new Date().getFullYear()} AXXES. Tollbooth is a product of AXXES.
          </div>
        </div>
      </footer>
    </div>
  )
}
