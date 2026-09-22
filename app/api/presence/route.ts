import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import { updatePresence, getUserById } from "@/lib/services/user.service"
import { getPartnerIds } from "@/lib/services/conversation.service"
import { broadcast, userChannel } from "@/lib/realtime"
import { isRecentlyOnline } from "@/lib/utils"

const PUSHER_CHANNEL_LIMIT = 10

/**
 * POST /api/presence
 * Heartbeat / explicit online-offline. Body: { isOnline: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId()
    const body = await request.json().catch(() => ({}))
    const isOnline = body?.isOnline !== false

    const previous = await getUserById(userId)
    const wasOnline = previous
      ? isRecentlyOnline(previous.isOnline, previous.lastSeen)
      : false

    await updatePresence(userId, isOnline)

    const nowOnline = isOnline
    if (wasOnline !== nowOnline) {
      const partners = await getPartnerIds(userId)
      const event = {
        type: "presence" as const,
        userId,
        isOnline: nowOnline,
        lastSeen: new Date().toISOString(),
      }
      for (let i = 0; i < partners.length; i += PUSHER_CHANNEL_LIMIT) {
        const slice = partners.slice(i, i + PUSHER_CHANNEL_LIMIT).map(userChannel)
        await broadcast(slice, event)
      }
    }

    return NextResponse.json({ data: { isOnline: nowOnline } })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[POST /api/presence]", err)
    return NextResponse.json({ error: "Failed to update presence" }, { status: 500 })
  }
}
