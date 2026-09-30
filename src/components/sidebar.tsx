"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

export type NavItem = { href: string; label: string; icon?: React.ReactNode; group?: string }

type Props = {
  items: NavItem[]
  footer: React.ReactNode
  logo: React.ReactNode
  /** Shown instead of `logo` when the rail is collapsed. */
  mark?: React.ReactNode
  /**
   * Extra path prefixes that should light up the matching item. Lanes highlights
   * "Dashboard" for /dashboard/b/*, Vibez for /dashboard/events.
   */
  activeAlso?: string[]
  storageKey?: string
}

const KEY = "axxes:sidebar-collapsed"

/** Lucide's panel-left / panel-left-close, inlined so every product gets the
 *  same control without each one taking a dependency on lucide-react. */
function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      {collapsed && <path d="m16 15-3-3 3-3" />}
    </svg>
  )
}

/** The first emoji or character, so a plain-text item still reads as a glyph
 *  once the label is hidden. */
function leadingGlyph(label: string) {
  const trimmed = label.trim()
  if (!trimmed) return "•"
  const first = [...trimmed][0]
  // Keep emoji whole rather than splitting a surrogate pair.
  return first.codePointAt(0)! > 0x2000 ? first : first.toUpperCase()
}

export function Sidebar({ items, footer, logo, mark, activeAlso, storageKey = KEY }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [ready, setReady] = useState(false)

  // The rail starts expanded on the server and corrects itself once mounted, so
  // a remembered collapse never arrives as a hydration mismatch.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(storageKey) === "1")
    } catch {}
    setReady(true)
  }, [storageKey])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(storageKey, collapsed ? "1" : "0")
    } catch {}
  }, [collapsed, ready, storageKey])

  const toggle = useCallback(() => setCollapsed((c) => !c), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.activeElement
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle])

  // The drawer overlays the page on small screens, so the page behind it must
  // not scroll under the thumb. Released on close, unmount, and past the
  // breakpoint where the drawer is used at all.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    const wide = window.matchMedia("(min-width: 1024px)")
    const onWide = () => wide.matches && setOpen(false)
    window.addEventListener("keydown", onKey)
    wide.addEventListener("change", onWide)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
      wide.removeEventListener("change", onWide)
    }
  }, [open])

  // Any navigation closes the drawer, so following a deep link from the menu
  // does not leave the overlay hanging over the page it just opened.
  useEffect(() => setOpen(false), [pathname])

  // The index item ("/" or "/dashboard") is a landing page, not a section, so it
  // is lit only on itself and on the prefixes a product nominates via
  // `activeAlso`. Every other item is a section, so it also lights on its
  // sub-pages. Without this split the index stayed lit across the whole app.
  const isIndex = (href: string) => href === "/" || href === "/dashboard"

  // `activeAlso` entries are accepted with or without a trailing slash, so a
  // product can write "/dashboard/b/" as it appears in its URLs.
  const extras = (activeAlso ?? []).map((p) => p.replace(/\/+$/, ""))

  const isActive = (href: string) =>
    isIndex(href)
      ? pathname === href || extras.some((p) => pathname === p || pathname.startsWith(`${p}/`))
      : pathname === href || pathname.startsWith(`${href}/`)

  // Group the nav so eight items don't read as one long undifferentiated list.
  // Collapsed, the headings go and only the gaps between groups remain.
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
        <button
          className="btn-ghost px-3"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="app-nav-drawer"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {/* Tapping the page behind the drawer dismisses it. Without this the drawer
          is a dead end on a phone, where there is no pointer to move away. */}
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        id="app-nav-drawer"
        data-collapsed={collapsed}
        className={`${
          open ? "flex" : "hidden"
        } fixed inset-y-0 left-0 z-30 w-72 max-w-[85vw] flex-col overflow-y-auto overscroll-contain border-r border-line bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:max-w-none lg:shrink-0 lg:overflow-visible lg:transition-[width] lg:duration-200 ${
          collapsed ? "lg:w-16" : "lg:w-64"
        }`}
      >
        <div className={`mb-7 hidden lg:block ${collapsed ? "text-center" : ""}`}>
          {collapsed && mark ? (
            <Link href="/dashboard" className="block text-xl leading-none" aria-label="Home">
              {mark}
            </Link>
          ) : (
            logo
          )}
        </div>

        <nav className={`flex-1 ${collapsed ? "space-y-0.5" : "space-y-5"}`}>
          {groups.map((group, index) => (
            <div key={group.name ?? index}>
              {group.name && !collapsed && (
                <p className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.15em] text-muted/70">{group.name}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const on = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={on ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`group relative flex items-center rounded-lg text-sm transition ${
                          collapsed ? "justify-center px-0 py-2" : "gap-2 px-3 py-2"
                        } ${on ? "bg-panel-2 font-medium text-text" : "text-muted hover:bg-panel-2 hover:text-text"}`}
                      >
                        {on && !collapsed && (
                          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                        )}
                        {collapsed ? (
                          <span className="text-base leading-none">{item.icon ?? leadingGlyph(item.label)}</span>
                        ) : (
                          <>
                            {item.icon && <span className="shrink-0 leading-none">{item.icon}</span>}
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          </>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* A 64px rail has no room for the account block, and Members hides it in
            exactly the same way, so the two rails read the same. */}
        {!collapsed && <div className="mt-8 border-t border-line pt-4">{footer}</div>}

        {/* The recognisable AXXES control: a round button riding the rail's edge. */}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar  [" : "Collapse sidebar  ["}
          className="absolute -right-3 top-20 hidden size-6 place-items-center rounded-full border border-line bg-panel text-muted shadow-sm transition hover:text-text lg:grid"
        >
          <PanelIcon collapsed={collapsed} />
        </button>
      </aside>
    </>
  )
}
