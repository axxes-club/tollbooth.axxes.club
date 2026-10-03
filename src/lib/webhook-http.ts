import "server-only"
import { lookup } from "node:dns/promises"
import { request as httpsRequest } from "node:https"
import { request as httpRequest } from "node:http"
import { BlockList, isIP } from "node:net"

const blocked = new BlockList()
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4")
const globalV6 = new BlockList()
globalV6.addSubnet("2000::", 3, "ipv6")
for (const [address, prefix] of [["2001::", 32], ["2001:db8::", 32], ["2002::", 16]] as const) blocked.addSubnet(address, prefix, "ipv6")

/** Resolve once and pin the socket to that address to prevent DNS rebinding. */
export async function postWebhook(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number; body: string }> {
  const target = new URL(url)
  const hostname = target.hostname.replace(/^\[|\]$/g, "")
  const local = ["test", "development"].includes(process.env.NODE_ENV ?? "") && ["127.0.0.1", "::1", "localhost"].includes(hostname)
  if (target.username || target.password || (target.protocol !== "https:" && !(local && target.protocol === "http:"))) throw new Error("Webhook URL must use public HTTPS")
  const deadline = Date.now() + timeoutMs
  const addresses = await Promise.race([
    isIP(hostname) ? Promise.resolve([{ address: hostname, family: isIP(hostname) }]) : lookup(hostname, { all: true }),
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Webhook DNS timed out")), timeoutMs)
      timer.unref()
    }),
  ])
  if (!addresses.length || (!local && addresses.some(({ address, family }) => family === 4 ? blocked.check(address, "ipv4") : !globalV6.check(address, "ipv6") || blocked.check(address, "ipv6")))) throw new Error("Webhook destination must be a public address, not an internal network")
  const pinned = addresses[0]
  return new Promise((resolve, reject) => {
    const req = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, {
      method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) },
      lookup: ((_name: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        if (options.all) callback(null, [{ address: pinned.address, family: pinned.family }])
        else callback(null, pinned.address, pinned.family)
      }) as import("node:net").LookupFunction,
    }, (res) => {
      const chunks: Buffer[] = []
      let length = 0
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") })
      }
      res.on("data", (chunk: Buffer) => {
        const part = Buffer.from(chunk).subarray(0, Math.max(0, 2000 - length))
        chunks.push(part); length += part.length
        if (length >= 2000) { finish(); res.destroy() }
      })
      res.on("end", finish)
      res.on("error", (error) => { if (!done) reject(error) })
    })
    const timer = setTimeout(() => req.destroy(new Error("Webhook request timed out")), Math.max(1, deadline - Date.now()))
    req.on("error", reject)
    req.on("close", () => clearTimeout(timer))
    req.end(body)
  })
}
