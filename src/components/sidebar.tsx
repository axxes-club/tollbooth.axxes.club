"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

export type NavItem = { href: string; label: string }

export function Sidebar({ items, footer, logo }: { items: NavItem[]; footer: React.ReactNode; logo: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const active = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href))

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        {logo}
        <button className="btn-ghost px-3" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
          {open ? "Close" : "Menu"}
        </button>
      </header>
      <aside
        className={`${open ? "block" : "hidden"} fixed inset-x-0 top-[57px] bottom-0 z-20 overflow-y-auto border-r border-line bg-panel p-4 lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-64 lg:shrink-0`}
      >
        <div className="mb-8 hidden lg:block">{logo}</div>
        <nav className="space-y-0.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2 text-sm transition ${active(item.href) ? "bg-panel-2 font-medium text-text" : "text-muted hover:bg-panel-2 hover:text-text"}`}
            >
              {active(item.href) && <span className="mr-2 inline-block size-1.5 rounded-full bg-accent align-middle" />}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-line pt-4">{footer}</div>
      </aside>
    </>
  )
}
