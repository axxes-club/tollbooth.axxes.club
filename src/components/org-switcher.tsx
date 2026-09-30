"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { switchOrganization } from "@/lib/actions/org"
import type { Membership } from "@/lib/context"

export function OrgSwitcher({ current, memberships, collapsed = false }: {
  current: Membership
  memberships: Membership[]
  collapsed?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  function choose(tenantId: string) {
    if (tenantId === current.tenantId) { setOpen(false); return }
    setError(null)
    startTransition(async () => {
      try {
        const result = await switchOrganization(tenantId)
        if (result.error) { setError(result.error); return }
        setOpen(false)
        router.push("/dashboard")
        router.refresh()
      } catch {
        setError("Could not switch organization. Please try again.")
      }
    })
  }
  return (
    <div className="org-switcher relative" data-compact={collapsed}>
      <button type="button" onClick={() => setOpen(!open)} disabled={pending}
        aria-label={`Switch organization: ${current.name}`} aria-expanded={open} aria-haspopup="listbox"
        title={current.name}
        className="org-trigger flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-xs hover:bg-panel-2 disabled:opacity-60">
        <span aria-hidden className="org-monogram hidden size-8 shrink-0 place-items-center rounded-lg bg-panel-2 font-semibold">{current.name.slice(0, 2).toUpperCase()}</span>
        <span className="org-details min-w-0 flex-1">
          <span className="block truncate font-medium text-text">{current.name}</span>
          <span className="block truncate text-muted">{pending ? "Switching…" : current.role.replaceAll("_", " ")}</span>
        </span>
        <span className="org-details" aria-hidden>↕</span>
      </button>
      {open && <>
        <button className="fixed inset-0 z-40 cursor-default" aria-label="Close organizations" onClick={() => setOpen(false)} />
        <div className="absolute bottom-full left-0 z-50 mb-2 w-60 max-w-[80vw] rounded-lg border border-line bg-panel p-1 shadow-lg">
          <ul role="listbox" aria-label="Organizations" className="max-h-64 overflow-y-auto">
            {memberships.map(m => <li key={m.tenantId}>
              <button type="button" role="option" aria-selected={m.tenantId === current.tenantId} disabled={pending} onClick={() => choose(m.tenantId)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-panel-2 disabled:opacity-60">
                <span className="min-w-0 flex-1"><span className="block truncate">{m.name}</span><span className="text-muted">{m.role}</span></span>
                {m.tenantId === current.tenantId && <span aria-hidden>✓</span>}
              </button>
            </li>)}
          </ul>
          {error && <p role="alert" className="p-2 text-xs text-red-500">{error}</p>}
        </div>
      </>}
    </div>
  )
}
