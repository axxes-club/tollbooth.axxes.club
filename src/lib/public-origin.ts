/**
 * The origin a visitor actually used, for building absolute redirects.
 *
 * Behind Cloud Run, a route handler's `request.url` / `nextUrl.origin` is the
 * container's own listen address (`https://0.0.0.0:8080`), not the public host,
 * so `new URL("/dashboard", request.url)` sends the browser nowhere. The load
 * balancer preserves the `Host` header, which is the public host. Middleware is
 * unaffected; route handlers need this.
 */
export function publicOrigin(request: Request): string {
  const own = new URL(request.url)
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim()
  // The container's own address, or no header at all, means there is nothing better to use.
  if (!host || /^(0\.0\.0\.0|127\.0\.0\.1|\[::\]|\[::1\])(:\d+)?$/.test(host)) return own.origin
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim()
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : own.protocol.replace(":", "")
  // localhost in development keeps plain http; everything public is https.
  const scheme = /^localhost(:\d+)?$/.test(host) ? proto : "https"
  return `${scheme}://${host}`
}
