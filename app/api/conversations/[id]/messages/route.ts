import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import { getMessages, markMessagesRead } from "@/lib/services/message.service"
import { isParticipant } from "@/lib/services/conversation.service"

/**
 * GET /api/conversations/[id]/messages
 * Fetch message history for a conversation.
 * Also marks all unread messages as read for the current user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUserId = await getUserId()
    const { id: conversationId } = await params
    const markRead = request.nextUrl.searchParams.get("markRead") !== "false"

    // Security: only participants can read messages
    const allowed = await isParticipant(conversationId, currentUserId)
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const messages = await getMessages(conversationId)

    // Mark incoming messages as read when the user opens the chat.
    // Polling fallback uses ?markRead=false so we do not rewrite rows every few seconds.
    if (markRead) {
      await markMessagesRead(conversationId, currentUserId)
    }

    return NextResponse.json({ data: messages })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[GET /api/conversations/[id]/messages]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
