"use client"

import { useState } from "react"

/**
 * Copies text and confirms it for a moment. A server component can't hold state, so
 * this is split out — it's the one part of a code block that has to be interactive.
 */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="btn-ghost absolute right-2 top-2 px-2 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
        } catch {
          // Clipboard access can be denied; the text is still selectable on screen.
          return
        }
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
    >
      {copied ? "Copied" : label}
    </button>
  )
}
