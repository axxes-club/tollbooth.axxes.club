import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

// Placeholder keeps `next build` working when DATABASE_URL isn't set.
const sql = neon(process.env.DATABASE_URL || "postgresql://placeholder:placeholder@placeholder/placeholder")

export const db = drizzle(sql, { schema })
export { schema }
