import type { Config } from "drizzle-kit"
import { config } from "dotenv"
import { resolve } from "path"

// Load .env.local explicitly — drizzle-kit runs outside Next.js
// so it doesn't pick up env vars automatically.
config({ path: resolve(process.cwd(), ".env.local") })

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Use the unpooled URL for direct schema migrations.
    // Neon's pooled connection (pgbouncer) blocks DDL statements.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
} satisfies Config
