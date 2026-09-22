import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// Single shared pg Pool used by BOTH Drizzle (app queries) and Better Auth.
// One connection, one source of truth.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const db = drizzle(pool, { schema })
