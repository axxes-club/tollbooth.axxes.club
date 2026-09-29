"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

export type NavItem = { href: string; label: string; group?: string }

export function Sidebar({ items, footer, logo }: { items: NavItem[]; footer: React.ReactNode; logo: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const active = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href))

  // Group the nav so eight items don't read as one long undifferentiated list.
  const groups = items.reduce<{ name: string | null; items: NavItem[] }[]>((acc, item) => {
    const last = acc.at(-1)
    if (last && last.name === (item.group ?? null)) last.items.push(item)
    else acc.push({ name: item.group ?? null, items: [item] })
    return acc
  }, [])

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
        <div className="mb-7 hidden lg:block">{logo}</div>
        <nav className="space-y-5">
          {groups.map((group, index) => (
            <div key={group.name ?? index}>
              {group.name && (
                <p className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.15em] text-muted/70">{group.name}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active(item.href) ? "page" : undefined}
                      className={`block rounded-lg px-3 py-1.5 text-sm transition ${
                        active(item.href) ? "bg-panel-2 font-medium text-text" : "text-muted hover:bg-panel-2 hover:text-text"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-8 border-t border-line pt-4">{footer}</div>
      </aside>
    </>
  )
}
