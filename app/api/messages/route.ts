import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import { sendMessage } from "@/lib/services/message.service"
import { isParticipant } from "@/lib/services/conversation.service"
import { sendMessageSchema } from "@/lib/validations/message"

/**
 * POST /api/messages
 * Send a message (text, image, voice note, or payment request) through
 * the processing pipeline:
 *
 *   processMessage (Trinetra AI) → saveMessage → deliverMessage
 */
export async function POST(request: NextRequest) {
  try {
    const senderId = await getUserId()

    const body = await request.json()
    const parsed = sendMessageSchema.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return NextResponse.json(
        { error: issue?.message ?? "Invalid request" },
        { status: 400 },
      )
    }

    const {
      conversationId,
      receiverId,
      messageType,
      content,
      mediaUrl,
      mediaDuration,
      paymentAmount,
      paymentUpiId,
      paymentNote,
      language,
    } = parsed.data

    // Security: verify the sender is actually a participant
    const allowed = await isParticipant(conversationId, senderId)
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Security: server always uses session userId — never trust client-provided senderId.
    // Trinetra analysis happens inside sendMessage() (server-side only).
    const saved = await sendMessage({
      conversationId,
      senderId, // from verified session
      receiverId,
      messageType,
      content: content.trim(),
      mediaUrl,
      mediaDuration,
      paymentAmount,
      paymentUpiId,
      paymentNote,
      language,
    })

    return NextResponse.json({ data: saved }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[POST /api/messages]", err)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
