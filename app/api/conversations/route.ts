import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import {
  findOrCreateConversation,
  getUserConversations,
} from "@/lib/services/conversation.service"
import { createConversationSchema } from "@/lib/validations/message"
import { getUserById } from "@/lib/services/user.service"

/**
 * GET /api/conversations
 * Returns all conversations for the current user.
 */
export async function GET() {
  try {
    const currentUserId = await getUserId()
    const conversations = await getUserConversations(currentUserId)
    return NextResponse.json({ data: conversations })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[GET /api/conversations]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/conversations
 * Find or create a conversation with another user.
 * Returns the full Conversation object with otherUser, lastMessage, unreadCount.
 */
export async function POST(request: NextRequest) {
  try {
    const currentUserId = await getUserId()

    const body = await request.json()
    const parsed = createConversationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request: otherUserId is required" },
        { status: 400 },
      )
    }

    const { otherUserId } = parsed.data

    // Prevent self-conversation
    if (otherUserId === currentUserId) {
      return NextResponse.json(
        { error: "You cannot start a conversation with yourself" },
        { status: 400 },
      )
    }

    // Verify the other user exists
    const otherUser = await getUserById(otherUserId)
    if (!otherUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const conversationId = await findOrCreateConversation(currentUserId, otherUserId)

    // Return the full conversation shape the client expects
    const conversations = await getUserConversations(currentUserId)
    const conversation = conversations.find((c) => c.id === conversationId)

    if (!conversation) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }

    return NextResponse.json({ data: conversation }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[POST /api/conversations]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
