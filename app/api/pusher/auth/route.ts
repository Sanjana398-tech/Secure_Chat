import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import { isParticipant } from "@/lib/services/conversation.service"
import { authorizeChannel, isRealtimeEnabled } from "@/lib/realtime"
import { parseConversationChannel, parseUserChannel } from "@/lib/realtime/channels"

/**
 * POST /api/pusher/auth
 * Authorizes private channel subscriptions. Pusher sends socket_id + channel_name.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isRealtimeEnabled()) {
      return NextResponse.json({ error: "Realtime is not configured" }, { status: 503 })
    }

    const userId = await getUserId()
    const contentType = request.headers.get("content-type") ?? ""

    let socketId = ""
    let channelName = ""

    if (contentType.includes("application/json")) {
      const body = await request.json()
      socketId = String(body.socket_id ?? "")
      channelName = String(body.channel_name ?? "")
    } else {
      const form = await request.formData()
      socketId = String(form.get("socket_id") ?? "")
      channelName = String(form.get("channel_name") ?? "")
    }

    if (!socketId || !channelName) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const userChannelId = parseUserChannel(channelName)
    if (userChannelId) {
      if (userChannelId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      return NextResponse.json(authorizeChannel(socketId, channelName))
    }

    const conversationId = parseConversationChannel(channelName)
    if (conversationId) {
      const allowed = await isParticipant(conversationId, userId)
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      return NextResponse.json(authorizeChannel(socketId, channelName))
    }

    return NextResponse.json({ error: "Unknown channel" }, { status: 403 })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[POST /api/pusher/auth]", err)
    return NextResponse.json({ error: "Authorization failed" }, { status: 500 })
  }
}
