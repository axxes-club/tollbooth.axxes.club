"use client"

// /sign-out ends the session here, or for every AXXES app via Handshake when it's on
export function SignOut() {
  return (
    <a className="text-xs text-muted hover:text-text" href="/sign-out">
      Sign out
    </a>
  )
}
