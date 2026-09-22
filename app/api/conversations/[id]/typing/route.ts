import { NextRequest, NextResponse } from "next/server"
import { getUserId, getSession } from "@/lib/auth-utils"
import {
  isParticipant,
  setTyping,
  isOtherUserTyping,
} from "@/lib/services/conversation.service"
import { broadcast, conversationChannel } from "@/lib/realtime"

/**
 * GET /api/conversations/[id]/typing
 * Polling fallback: whether the other participant is currently typing.
 */
export async function GET(
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

    const typing = await isOtherUserTyping(conversationId, currentUserId)
    return NextResponse.json({ data: { typing } })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[GET /api/conversations/[id]/typing]", err)
    return NextResponse.json({ error: "Failed to load typing state" }, { status: 500 })
  }
}

/**
 * POST /api/conversations/[id]/typing
 * Body: { typing: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const currentUserId = session.user.id
    const { id: conversationId } = await params

    const allowed = await isParticipant(conversationId, currentUserId)
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const typing = Boolean(body?.typing)

    await setTyping(conversationId, currentUserId, typing)

    const username =
      (session.user as { username?: string }).username ?? session.user.name ?? "User"

    await broadcast(conversationChannel(conversationId), {
      type: typing ? "typing" : "stop-typing",
      conversationId,
      userId: currentUserId,
      username,
    })

    return NextResponse.json({ data: { typing } })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[POST /api/conversations/[id]/typing]", err)
    return NextResponse.json({ error: "Failed to update typing" }, { status: 500 })
  }
}
