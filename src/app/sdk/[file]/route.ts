import { readFile } from "fs/promises"
import path from "path"

/**
 * Serves the SDK straight from this repo, so the version on npm and the version in
 * the docs can never drift apart: they are the same file.
 */
const FILES: Record<string, { name: string; type: string }> = {
  "tollbooth.js": { name: "tollbooth.mjs", type: "text/javascript; charset=utf-8" },
  "tollbooth.d.ts": { name: "tollbooth.d.ts", type: "text/plain; charset=utf-8" },
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const entry = FILES[file]
  if (!entry) return new Response("Not found", { status: 404 })

  // `process.cwd()` is the app root; the SDK lives in a sibling `sdk/` directory.
  const source = await readFile(path.join(process.cwd(), "sdk", entry.name), "utf8")
  return new Response(source, {
    headers: {
      "content-type": entry.type,
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  })
}
