"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CopyButton, StatusBadge } from "@/components/ui"
import { createApiKey, revokeApiKey } from "../actions"

type Key = {
  id: string
  name: string
  prefix: string
  mode: string
  scopes: string[] | null
  createdAt: string
  lastUsedAt: string | null
  revoked: boolean
}

const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso))

export function ApiKeys({ keys, canManage }: { keys: Key[]; canManage: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<"test" | "live">("test")
  const [name, setName] = useState("")
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const result = await createApiKey(name, mode)
      if (result.ok && result.data) {
        setSecret(result.data.secret)
        setName("")
        router.refresh()
      } else setError(result.ok ? "Could not create the key" : result.error)
    })
  }

  const revoke = (id: string) =>
    start(async () => {
      const result = await revokeApiKey(id)
      if (!result.ok) setError(result.error)
      router.refresh()
    })

  return (
    <div className="space-y-5">
      {secret && (
        <div className="card border-accent/50 p-5" role="status">
          <p className="font-medium">Copy your new key now</p>
          <p className="mt-1 text-sm text-muted">
            Only a hash is stored, so this is the only time it can be shown. Put it in your server&apos;s environment, never in code you
            commit.
          </p>
          <div className="mt-3 flex gap-2">
            <code className="input flex-1 overflow-x-auto whitespace-nowrap font-mono" data-api-secret>{secret}</code>
            <CopyButton value={secret} label="Copy" />
          </div>
          <button className="btn-ghost mt-3" onClick={() => setSecret(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      {canManage && (
        <form onSubmit={create} className="card space-y-4 p-5">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-muted">Key type</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["test", "live"] as const).map((value) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-xl border p-3 text-sm transition ${
                    mode === value ? "border-accent bg-accent/5" : "border-line hover:border-line/80"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                    <span className={`size-3.5 rounded-full border-2 ${mode === value ? "border-accent bg-accent/10" : "border-line"}`} />
                    <span className="font-medium capitalize">{value}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {value === "test" ? "Fake money. Use this while you build." : "Real money. Only create this when you're ready to go live."}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Name</span>
            <input
              className="input"
              placeholder={mode === "test" ? "Local development" : "Production — afters.am"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Key name"
            />
          </label>

          {error && <p className="text-sm text-danger" role="alert">{error}</p>}

          <button className="btn-primary w-full" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : `Create ${mode} key`}
          </button>
        </form>
      )}

      <div className="card divide-y divide-line/60">
        {keys.length === 0 && <p className="p-5 text-sm text-muted">No API keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm" data-api-key={k.name}>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                <span className={k.revoked ? "text-muted line-through" : ""}>{k.name}</span>
                <StatusBadge value={k.mode} />
              </p>
              <p className="font-mono text-xs text-muted">
                {k.prefix}… · created {fmt(k.createdAt)} · {k.lastUsedAt ? `last used ${fmt(k.lastUsedAt)}` : "never used"}
              </p>
            </div>
            {k.revoked ? (
              <span className="text-xs text-muted">Revoked</span>
            ) : (
              canManage && (
                <button className="btn-ghost text-danger" disabled={pending} onClick={() => revoke(k.id)}>
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
