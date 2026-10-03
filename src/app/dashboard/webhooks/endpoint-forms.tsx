"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { StatusBadge, Code, CopyButton } from "@/components/ui"
import { createEndpoint, deleteEndpoint, replayEvent, rotateEndpointSecret, sendTestEvent, toggleEndpoint } from "../actions"

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

type Endpoint = {
  id: string
  url: string
  description: string | null
  enabled: number
  mode: string
  failureCount: number
  lastDeliveryStatus: string | null
  events: string[] | null
  deliveries: {
    id: string
    eventType: string
    status: string
    attempts: number
    responseStatus: number | null
    error: string | null
    createdAt: Date
  }[]
}

export function EndpointForm({ events }: { events: string[] }) {
  const router = useRouter()
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        setError(null)
        start(async () => {
          const result = await createEndpoint(data)
          if (result.ok && result.data) {
            setSecret(result.data.secret)
            router.refresh()
          } else setError(result.ok ? "Could not create the endpoint" : result.error)
        })
      }}
    >
      <h2 className="font-medium">Add an endpoint</h2>

      {secret ? (
        <div className="space-y-3">
          <p className="text-sm text-amber-300">Copy the signing secret now — it isn&apos;t shown again.</p>
          <div className="flex gap-2">
            <code className="input flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{secret}</code>
            <CopyButton value={secret} label="Copy" />
          </div>
          <button type="button" className="btn-ghost w-full" onClick={() => setSecret(null)}>
            Done
          </button>
        </div>
      ) : (
        <>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Environment</span>
            <select className="input" name="mode" defaultValue="test"><option value="test">Test — fake money</option><option value="live">Live — real payments</option></select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">URL</span>
            <input className="input" name="url" type="url" required placeholder="https://yoursite.com/api/tollbooth" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Description</span>
            <input className="input" name="description" placeholder="Production" />
          </label>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-muted">Events</legend>
            <p className="mb-2 text-xs text-muted">Select none to receive everything.</p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {events.map((event) => (
                <label key={event} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="events" value={event} defaultChecked={event === "payment.succeeded"} className="size-3.5 accent-[var(--accent)]" />
                  <span className="font-mono">{event}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="text-sm text-danger" role="alert">{error}</p>}

          <button className="btn-primary w-full" disabled={pending}>
            {pending ? "Creating…" : "Create endpoint"}
          </button>
        </>
      )}
    </form>
  )
}

export function EndpointRow({ endpoint, canManage }: { endpoint: Endpoint; canManage: boolean }) {
  const router = useRouter()
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const enabled = !!endpoint.enabled
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      const result = await fn()
      if (!result.ok && result.error) setError(result.error)
      router.refresh()
    })

  return (
    <section className={`card p-5 ${enabled ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{endpoint.description ?? endpoint.url}</h3>
            <StatusBadge value={enabled ? (endpoint.failureCount > 0 ? "failing" : "active") : "disabled"} />
            <StatusBadge value={endpoint.mode} />
          </div>
          <p className="mt-1 break-all font-mono text-xs text-muted">{endpoint.url}</p>
          <p className="mt-1 text-xs text-muted">
            {endpoint.events?.includes("*") || !endpoint.events?.length ? "All events" : endpoint.events.join(", ")}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-1.5">
            <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => run(() => toggleEndpoint(endpoint.id, !enabled))}>
              {enabled ? "Pause" : "Resume"}
            </button>
            <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => run(() => sendTestEvent(endpoint.id))}>
              Send test
            </button>
            <button
              className="btn-ghost px-2 py-1 text-xs"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await rotateEndpointSecret(endpoint.id)
                  if (result.ok && result.data) setSecret(result.data.secret)
                  else if (!result.ok) setError(result.error)
                  router.refresh()
                })
              }
            >
              Rotate secret
            </button>
            <button className="btn-ghost px-2 py-1 text-xs text-danger" disabled={pending} onClick={() => run(() => deleteEndpoint(endpoint.id))}>
              Delete
            </button>
          </div>
        )}
      </div>

      {secret && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="text-sm text-amber-200">New secret — the old one stops working immediately.</p>
          <div className="mt-2 flex gap-2">
            <code className="input flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{secret}</code>
            <CopyButton value={secret} label="Copy" />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}

      {endpoint.deliveries.length > 0 && (
        <div className="mt-4 border-t border-line/60 pt-3">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted">Recent deliveries</p>
          <ul className="space-y-1.5">
            {endpoint.deliveries.map((delivery) => (
              <li key={delivery.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-muted">{delivery.eventType}</span>
                <StatusBadge value={delivery.status} />
                {delivery.responseStatus && <span className="text-muted">HTTP {delivery.responseStatus}</span>}
                {delivery.attempts > 1 && <span className="text-muted">{delivery.attempts} attempts</span>}
                <span className="text-muted/70">{dateFmt.format(delivery.createdAt)}</span>
                {delivery.error && <span className="text-amber-300/80">{delivery.error}</span>}
                {canManage && delivery.status !== "delivered" && (
                  <button className="text-accent hover:underline" disabled={pending} onClick={() => run(() => replayEvent(delivery.id))}>
                    resend
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
