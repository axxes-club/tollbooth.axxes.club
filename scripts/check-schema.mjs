/**
 * Checks the Tollbooth schema three ways: the drizzle definitions, the SQL migration,
 * and the live database.
 *
 * A typo in a column name is invisible to TypeScript and fatal at runtime — the query
 * fails against Postgres while `tsc` passes. That exact bug (`payout_enabled` vs
 * `payouts_enabled`) shipped once already. This catches it in a second.
 *
 *   node scripts/check-schema.mjs
 */
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const url = process.env.DATABASE_URL
const SCHEMA = "src/lib/db/schema/tollbooth.ts"
const SQL = "scripts/create-tables.sql"

// ─── From the drizzle definitions ───────────────────────────────────────────────
const ts = readFileSync(SCHEMA, "utf8")
const drizzle = new Map() // table -> Set(column)
for (const block of ts.matchAll(/pgTable\(\s*(?:"(\w+)"|\w+,\s*"(\w+)")\s*,?\s*\{([\s\S]*?)\n\s*\}\s*(?:,\s*\(|\))/g)) {
  const name = block[1] ?? block[2]
  const body = block[3]
  const columns = new Set()
  // Anchor to a property assignment so `.default("live")` isn't read as a column.
  for (const m of body.matchAll(/^\s{4}(\w+):\s+\w+\(\s*"([a-z0-9_]+)"/gm)) columns.add(m[2])
  if (name) drizzle.set(name, columns)
}

// ─── From the migration ─────────────────────────────────────────────────────────
const sql = readFileSync(SQL, "utf8")
const migrated = new Map()
for (const m of sql.matchAll(/create table if not exists (\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, name, body] = m
  const columns = new Set()
  for (const line of body.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("--")) continue
    const col = trimmed.match(/^([a-z_][a-z0-9_]*)\s/)
    if (col) columns.add(col[1])
  }
  migrated.set(name, columns)
}

let problems = 0
const problem = (message) => {
  console.log(`  ${message}`)
  problems++
}

// ─── 1. drizzle vs migration ────────────────────────────────────────────────────
console.log("drizzle vs migration")
for (const [table, columns] of drizzle) {
  const target = migrated.get(table)
  if (!target) {
    problem(`${table}: in the schema but not created by the migration`)
    continue
  }
  for (const column of columns) {
    if (!target.has(column)) problem(`${table}.${column}: in the schema but missing from the migration`)
  }
}

// ─── 2. drizzle vs live database ────────────────────────────────────────────────
if (url) {
  console.log("drizzle vs database")
  const sql$ = neon(url)
  for (const [table, columns] of drizzle) {
    const live = await sql$`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = ${table}
    `
    if (!live.length) {
      problem(`${table}: table does not exist — run scripts/create-tables.sql`)
      continue
    }
    const liveNames = new Set(live.map((c) => c.column_name))
    for (const column of columns) {
      if (!liveNames.has(column)) problem(`${table}.${column}: in the schema but not in the database`)
    }
  }
} else {
  console.log("drizzle vs database\n  skipped: DATABASE_URL is not set")
}

console.log(problems === 0 ? "\nSchema is consistent." : `\n${problems} mismatch(es).`)
process.exit(problems === 0 ? 0 : 1)
