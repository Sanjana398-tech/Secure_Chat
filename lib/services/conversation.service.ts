/**
 * Conversation Service
 *
 * Handles finding and creating conversations between users.
 * Key rule: one conversation per user pair — always reuse, never duplicate.
 */

import { eq, and, inArray, desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { conversation, conversationParticipant, message, user } from "@/lib/db/schema"
import type { Conversation, PublicUser } from "@/types"
import { nanoid, isRecentlyOnline } from "@/lib/utils"

function toPublicUser(row: PublicUser): PublicUser {
  return {
    ...row,
    isOnline: isRecentlyOnline(row.isOnline, row.lastSeen),
  }
}

/**
 * Find an existing conversation between two users, or create a new one.
 * This ensures there is always exactly one conversation per user pair.
 */
export async function findOrCreateConversation(
  userAId: string,
  userBId: string,
): Promise<string> {
  // Find conversations where both users are participants
  const userAConvos = await db
    .select({ conversationId: conversationParticipant.conversationId })
    .from(conversationParticipant)
    .where(eq(conversationParticipant.userId, userAId))

  const userAConvoIds = userAConvos.map((r) => r.conversationId)

  if (userAConvoIds.length > 0) {
    const shared = await db
      .select({ conversationId: conversationParticipant.conversationId })
      .from(conversationParticipant)
      .where(
        and(
          eq(conversationParticipant.userId, userBId),
          inArray(conversationParticipant.conversationId, userAConvoIds),
        ),
      )
      .limit(1)

    if (shared.length > 0) {
      return shared[0].conversationId
    }
  }

  // No existing conversation — create one
  const newId = nanoid()

  await db.insert(conversation).values({
    id: newId,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await db.insert(conversationParticipant).values([
    { id: nanoid(), conversationId: newId, userId: userAId, createdAt: new Date() },
    { id: nanoid(), conversationId: newId, userId: userBId, createdAt: new Date() },
  ])

  return newId
}

/**
 * Get all conversations for a user, with the other participant's info,
 * the last message, and unread count. Sorted by most recent activity.
 */
export async function getUserConversations(userId: string): Promise<Conversation[]> {
  // Get all conversation IDs for this user
  const participations = await db
    .select({ conversationId: conversationParticipant.conversationId })
    .from(conversationParticipant)
    .where(eq(conversationParticipant.userId, userId))

  if (participations.length === 0) return []

  const conversationIds = participations.map((p) => p.conversationId)

  // Get the conversations with updatedAt for sorting
  const conversations = await db
    .select()
    .from(conversation)
    .where(inArray(conversation.id, conversationIds))
    .orderBy(desc(conversation.updatedAt))

  // For each conversation, fetch the other participant and last message
  const results: Conversation[] = []

  for (const convo of conversations) {
    // Get other participant
    const otherParticipant = await db
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        image: user.image,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      })
      .from(conversationParticipant)
      .innerJoin(user, eq(conversationParticipant.userId, user.id))
      .where(
        and(
          eq(conversationParticipant.conversationId, convo.id),
          sql`${conversationParticipant.userId} != ${userId}`,
        ),
      )
      .limit(1)

    if (otherParticipant.length === 0) continue

    // Get last message
    const lastMessages = await db
      .select()
      .from(message)
      .where(eq(message.conversationId, convo.id))
      .orderBy(desc(message.createdAt))
      .limit(1)

    // Get unread count
    const unreadResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(message)
      .where(
        and(
          eq(message.conversationId, convo.id),
          eq(message.receiverId, userId),
          eq(message.isRead, false),
        ),
      )

    results.push({
      id: convo.id,
      createdAt: convo.createdAt,
      updatedAt: convo.updatedAt,
      otherUser: toPublicUser(otherParticipant[0] as PublicUser),
      lastMessage: lastMessages[0]
        ? ({
            ...lastMessages[0],
            trinetraDetectedUrls: JSON.parse(lastMessages[0].trinetraDetectedUrls ?? "[]"),
            trinetraReasons: JSON.parse(lastMessages[0].trinetraReasons ?? "[]"),
          } as unknown as Conversation["lastMessage"])
        : null,
      unreadCount: unreadResult[0]?.count ?? 0,
    })
  }

  return results
}

/**
 * Verify that a user is a participant in a conversation.
 * Use this before any read/write operation to prevent unauthorized access.
 */
export async function isParticipant(conversationId: string, userId: string): Promise<boolean> {
  const result = await db
    .select({ id: conversationParticipant.id })
    .from(conversationParticipant)
    .where(
      and(
        eq(conversationParticipant.conversationId, conversationId),
        eq(conversationParticipant.userId, userId),
      ),
    )
    .limit(1)

  return result.length > 0
}

const TYPING_TTL_MS = 4000

/**
 * User IDs of everyone the current user shares a conversation with.
 * Used to fan out presence events.
 */
export async function getPartnerIds(userId: string): Promise<string[]> {
  const mine = await db
    .select({ conversationId: conversationParticipant.conversationId })
    .from(conversationParticipant)
    .where(eq(conversationParticipant.userId, userId))

  if (mine.length === 0) return []

  const others = await db
    .select({ userId: conversationParticipant.userId })
    .from(conversationParticipant)
    .where(
      and(
        inArray(
          conversationParticipant.conversationId,
          mine.map((r) => r.conversationId),
        ),
        sql`${conversationParticipant.userId} != ${userId}`,
      ),
    )

  return [...new Set(others.map((r) => r.userId))]
}

export async function setTyping(
  conversationId: string,
  userId: string,
  typing: boolean,
): Promise<void> {
  await db
    .update(conversationParticipant)
    .set({ typingAt: typing ? new Date() : null })
    .where(
      and(
        eq(conversationParticipant.conversationId, conversationId),
        eq(conversationParticipant.userId, userId),
      ),
    )
}

export async function isOtherUserTyping(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ typingAt: conversationParticipant.typingAt })
    .from(conversationParticipant)
    .where(
      and(
        eq(conversationParticipant.conversationId, conversationId),
        sql`${conversationParticipant.userId} != ${userId}`,
      ),
    )
    .limit(1)

  if (!row?.typingAt) return false
  return Date.now() - new Date(row.typingAt).getTime() < TYPING_TTL_MS
}
