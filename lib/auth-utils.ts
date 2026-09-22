import { auth } from "@/lib/auth"
import { headers } from "next/headers"

/**
 * Returns the current session or null. Server-side only.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/**
 * Returns the authenticated user id, throwing if there is no session.
 * Use this in every server action / route handler that touches user data —
 * there is no RLS on Neon, so every query MUST be scoped by this id.
 */
export async function getUserId() {
  const session = await getSession()
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}
