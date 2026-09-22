import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import { markMessagesRead } from "@/lib/services/message.service"
import { isParticipant } from "@/lib/services/conversation.service"

/**
 * POST /api/conversations/[id]/read
 * Mark incoming messages as read (open chat + live incoming while viewing).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUserId = await getUserId()
    const { id: conversationId } = await params

    const allowed = await isParticipant(conversationId, currentUserId)
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const messageIds = await markMessagesRead(conversationId, currentUserId)
    return NextResponse.json({ data: { messageIds } })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[POST /api/conversations/[id]/read]", err)
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 })
  }
}
