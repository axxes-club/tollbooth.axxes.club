import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL || "postgresql://build:build@localhost/build";
const usesNeon = new URL(url).hostname.endsWith(".neon.tech");
const neonDb = () => drizzle(neon(url), { schema });
const globalForDb = globalThis as unknown as { axxesPgPool?: Pool };

// Reuse one bounded pool per process, including separately loaded route bundles.
function postgresDb() {
  const pool = globalForDb.axxesPgPool ??= new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return drizzlePg(pool, { schema });
}

// Both connections expose the existing Drizzle query API during the cutover.
export const db: ReturnType<typeof neonDb> = usesNeon
  ? neonDb()
  : postgresDb() as unknown as ReturnType<typeof neonDb>;

export { schema }
