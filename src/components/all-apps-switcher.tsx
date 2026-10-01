"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"

export type SuiteApp = { key: string; name: string; description?: string; tagline?: string; url: string; color?: string; status: string; workspaceLaunch?: boolean }
const CATALOG = "https://members.axxes.club/api/axxes/products"

export function appLaunchUrl(app: SuiteApp, tenantId?: string) {
  const url = new URL(app.url)
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid app address")
  if (app.workspaceLaunch && tenantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    url.pathname = "/api/organization/open"
    url.search = ""
    url.searchParams.set("tenant", tenantId)
    url.hash = ""
  }
  return url.href
}

/** One authoritative catalog; the portal escapes sidebar clipping and keeps search fixed. */
export function AllAppsSwitcher({ tenantId, compact = false }: { tenantId?: string; compact?: boolean }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [apps, setApps] = useState<SuiteApp[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [bounds, setBounds] = useState<React.CSSProperties>({})

  function close() { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    const position = () => {
      const anchor = trigger.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - 16)
      const height = Math.min(480, window.innerHeight - 16)
      const top = rect.bottom + 8 + height <= window.innerHeight - 8
        ? rect.bottom + 8 : Math.max(8, Math.min(rect.top - height - 8, window.innerHeight - height - 8))
      const styles = getComputedStyle(anchor)
      const color = (value: string, fallback: string) => {
        const raw = value.trim()
        if (CSS.supports("color", raw)) return raw
        if (CSS.supports("color", `hsl(${raw})`)) return `hsl(${raw})`
        return fallback
      }
      setBounds({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top, width, height,
        background: color(styles.getPropertyValue("--panel") || styles.getPropertyValue("--card") || styles.getPropertyValue("--background"), "#111114"),
        color: color(styles.getPropertyValue("--text") || styles.getPropertyValue("--foreground"), styles.color),
        borderColor: color(styles.getPropertyValue("--line") || styles.getPropertyValue("--border-subtle") || styles.getPropertyValue("--border"), "#333"),
        fontFamily: styles.fontFamily })
    }
    position()
    requestAnimationFrame(() => search.current?.focus())
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close() }
      if (event.key === "Tab" && panel.current) {
        const elements = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]'))
        const first = elements[0], last = elements[elements.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener("resize", position)
    window.addEventListener("scroll", position, true)
    window.addEventListener("keydown", key, true)
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); window.removeEventListener("keydown", key, true) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    setLoading(true); setError(""); setApps([])
    fetch(CATALOG, { signal: abort.signal, credentials: "omit" })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() })
      .then(data => {
        if (!Array.isArray(data.products)) throw new Error()
        setApps(data.products.filter((app: SuiteApp) => {
          if (!app || typeof app.key !== "string" || typeof app.name !== "string" || !["live", "beta"].includes(app.status)) return false
          try { appLaunchUrl(app); return true } catch { return false }
        }))
      })
      .catch(() => { if (!abort.signal.aborted) setError("Could not load apps. Please try again.") })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [open, retry])

  const needle = query.trim().toLocaleLowerCase()
  const visible = apps.filter(app => `${app.name} ${app.description ?? ""} ${app.tagline ?? ""}`.toLocaleLowerCase().includes(needle))
  return <>
    <button ref={trigger} type="button" className={`axxes-all-apps-trigger ${compact ? "axxes-all-apps-compact" : ""}`} aria-label="All apps" aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined} title="All apps" onClick={() => { setQuery(""); setOpen(value => !value) }}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="12" y="2" width="6" height="6" rx="1" /><rect x="2" y="12" width="6" height="6" rx="1" /><rect x="12" y="12" width="6" height="6" rx="1" /></svg>
      <span className="axxes-all-apps-label">All apps</span>
    </button>
    {open && createPortal(<>
      <div className="axxes-apps-overlay" onClick={close} />
      <div ref={panel} id={id} role="dialog" aria-modal="true" aria-label="All apps" className="axxes-apps-dialog" style={bounds}>
        <div className="axxes-apps-search"><div className="axxes-apps-heading"><strong>All apps</strong><button type="button" aria-label="Close apps" onClick={close}>×</button></div>
          <label htmlFor={`${id}-search`} className="axxes-apps-sr-only">Search apps</label>
          <input ref={search} id={`${id}-search`} placeholder="Search apps…" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
        </div>
        <div className="axxes-apps-list" role="list" aria-label="Apps">
          {loading && <p role="status">Loading apps…</p>}
          {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
          {!loading && !error && !visible.length && <p>No apps match your search.</p>}
          {visible.map(app => <div key={app.key} role="listitem"><a href={appLaunchUrl(app, tenantId)} target="_blank" rel="noopener noreferrer" className="axxes-apps-item">
            <span className="axxes-apps-mark" aria-hidden="true" style={{ color: app.color }}>{app.name.slice(0, 2).toUpperCase()}</span>
            <span className="axxes-apps-description"><strong>{app.name}</strong><span>{app.tagline || app.description}</span></span>
            <span aria-hidden="true">↗</span>
          </a></div>)}
        </div>
        <div className="axxes-apps-footer">AXXES suite · Opens in a new tab</div>
      </div>
    </>, document.body)}
    <style>{`
      .axxes-all-apps-trigger{display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;text-align:left}
      .axxes-all-apps-trigger:hover{background:var(--panel-2,rgba(128,128,128,.12))}
      .axxes-all-apps-compact{justify-content:center;padding:8px 0}.axxes-all-apps-compact .axxes-all-apps-label{display:none}
      @media(min-width:1024px){aside[data-collapsed="true"] .axxes-all-apps-trigger{justify-content:center;padding:8px 0}aside[data-collapsed="true"] .axxes-all-apps-label{display:none}}
      .axxes-apps-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.18)}
      .axxes-apps-dialog{box-sizing:border-box;position:fixed;z-index:10001;display:flex;flex-direction:column;overflow:hidden;border:1px solid;border-radius:12px;box-shadow:0 16px 60px rgba(0,0,0,.3);font-size:13px}
      .axxes-apps-search{flex:none;padding:12px;border-bottom:1px solid rgba(128,128,128,.2)}.axxes-apps-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
      .axxes-apps-dialog button{cursor:pointer;color:inherit;background:transparent;border:0;font:inherit;padding:4px 8px;border-radius:4px}.axxes-apps-dialog input{box-sizing:border-box;width:100%;min-width:0;border:1px solid rgba(128,128,128,.35);border-radius:6px;background:transparent;color:inherit;padding:9px;font:inherit}
      .axxes-apps-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px}.axxes-apps-list>p,.axxes-apps-list>[role=alert]{padding:12px}
      .axxes-apps-item{display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;text-decoration:none;color:inherit}.axxes-apps-item:hover,.axxes-apps-item:focus-visible{background:rgba(128,128,128,.16)}
      .axxes-apps-mark{display:grid;place-items:center;width:32px;height:32px;flex:none;border:1px solid rgba(128,128,128,.25);border-radius:7px;font-size:11px;font-weight:700}
      .axxes-apps-description{min-width:0;flex:1}.axxes-apps-description strong,.axxes-apps-description>span{display:block}.axxes-apps-description>span{font-size:11px;opacity:.65;margin-top:3px;line-height:1.4;overflow-wrap:anywhere}
      .axxes-apps-footer{flex:none;padding:10px 12px;border-top:1px solid rgba(128,128,128,.2);font-size:10px;opacity:.65}
      .axxes-apps-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    `}</style>
  </>
}
