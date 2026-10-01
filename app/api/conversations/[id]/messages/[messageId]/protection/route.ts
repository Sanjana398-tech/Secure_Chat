import { NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import { isParticipant } from "@/lib/services/conversation.service"
import { openProtectedMessage } from "@/lib/services/message.service"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const userId = await getUserId()
    const { id: conversationId, messageId } = await params
    if (!(await isParticipant(conversationId, userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const openedMessage = await openProtectedMessage(conversationId, messageId, userId)
    return NextResponse.json({ data: openedMessage })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (error instanceof Error && error.message === "Protected message not found") {
      return NextResponse.json({ error: "Protected message not found" }, { status: 404 })
    }
    console.error("[POST /api/conversations/[id]/messages/[messageId]/protection]", error)
    return NextResponse.json({ error: "Failed to open protected message" }, { status: 500 })
  }
}