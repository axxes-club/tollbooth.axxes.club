"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function PaymentRefresh() {
  const router = useRouter()
  useEffect(() => {
    let attempts = 0
    const timer = setInterval(() => {
      if (++attempts >= 20) clearInterval(timer)
      router.refresh()
    }, 3000)
    return () => clearInterval(timer)
  }, [router])
  return <p role="status" className="mt-3 text-xs text-muted">Checking for confirmation…</p>
}
