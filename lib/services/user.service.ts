/**
 * User Service
 *
 * Handles user lookups, search, and presence updates.
 */

import { eq, or, ilike, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import type { PublicUser } from "@/types"
import { isRecentlyOnline } from "@/lib/utils"

function toPublicUser(row: PublicUser): PublicUser {
  return {
    ...row,
    isOnline: isRecentlyOnline(row.isOnline, row.lastSeen),
  }
}

/**
 * Search for users by username or email.
 * Excludes the current user from results.
 */
export async function searchUsers(query: string, currentUserId: string): Promise<PublicUser[]> {
  const pattern = `%${query}%`

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      image: user.image,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
    })
    .from(user)
    .where(
      and(
        or(ilike(user.username, pattern), ilike(user.email, pattern), ilike(user.name, pattern)),
        sql`${user.id} != ${currentUserId}`,
      ),
    )
    .limit(20)

  return rows.map((row) => toPublicUser(row as PublicUser))
}

/**
 * Get a single user's public profile by ID.
 */
export async function getUserById(id: string): Promise<PublicUser | null> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      image: user.image,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)

  return rows[0] ? toPublicUser(rows[0] as PublicUser) : null
}

/**
 * Update a user's online status and lastSeen timestamp.
 * Called from the presence API route.
 */
export async function updatePresence(userId: string, isOnline: boolean): Promise<void> {
  await db
    .update(user)
    .set({
      isOnline,
      lastSeen: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))
}

/**
 * Update basic profile fields.
 */
export async function updateProfile(
  userId: string,
  data: { name?: string; username?: string; image?: string },
): Promise<PublicUser | null> {
  const [updated] = await db
    .update(user)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      image: user.image,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
    })

  return updated ? toPublicUser(updated as PublicUser) : null
}
