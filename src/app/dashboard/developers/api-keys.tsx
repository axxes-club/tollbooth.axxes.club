"use client"

import { useState, useTransition } from "react"
import { createApiKey, revokeApiKey } from "../actions"

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revoked: boolean }

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

export function ApiKeys({ keys, canManage }: { keys: Key[]; canManage: boolean }) {
  const [name, setName] = useState("")
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const result = await createApiKey(name)
      if (result.ok) {
        setSecret(result.secret)
        setName("")
        setCopied(false)
      } else setError(result.error)
    })
  }

  return (
    <div className="space-y-4">
      {secret && (
        <div className="card border-accent/50 p-5" role="status">
          <p className="font-medium">Copy your new key now</p>
          <p className="mt-1 text-sm text-muted">For your security it won&apos;t be shown again.</p>
          <div className="mt-3 flex gap-2">
            <code className="input flex-1 overflow-x-auto whitespace-nowrap font-mono" data-api-secret>{secret}</code>
            <button
              className="btn-ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(secret)
                setCopied(true)
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {canManage && (
        <form onSubmit={create} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <input className="input sm:max-w-xs" placeholder="Key name, e.g. afters.am production" value={name} onChange={(e) => setName(e.target.value)} aria-label="Key name" />
          <button className="btn-primary" disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create API key"}</button>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        </form>
      )}

      <div className="card divide-y divide-line/60">
        {keys.length === 0 && <p className="p-5 text-sm text-muted">No API keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-4 p-4 text-sm" data-api-key={k.name}>
            <div className="min-w-0">
              <p className={`font-medium ${k.revoked ? "text-muted line-through" : ""}`}>{k.name}</p>
              <p className="font-mono text-xs text-muted">
                {k.prefix}… · created {fmt(k.createdAt)} · {k.lastUsedAt ? `last used ${fmt(k.lastUsedAt)}` : "never used"}
              </p>
            </div>
            {k.revoked ? (
              <span className="text-xs text-muted">Revoked</span>
            ) : (
              canManage && (
                <button className="btn-ghost text-danger" disabled={pending} onClick={() => start(() => revokeApiKey(k.id))}>
                  Revoke
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
