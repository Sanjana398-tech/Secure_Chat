/**
 * Server-side realtime transport for SecureChat.
 *
 * Vercel serverless functions cannot hold long-lived WebSocket connections,
 * so delivery uses Pusher Channels. All feature code talks to this module —
 * swap the provider later without touching sendMessage / UI.
 *
 * When Pusher env vars are missing, `broadcast()` is a no-op and the client
 * falls back to short polling so the app still works in local testing.
 */

import Pusher from "pusher"
import type { RealtimePayload } from "@/types"

export type { RealtimePayload }

export {
  conversationChannel,
  userChannel,
} from "@/lib/realtime/channels"

let pusher: Pusher | null | undefined

export function isRealtimeEnabled(): boolean {
  return Boolean(
    process.env.PUSHER_APP_ID &&
      process.env.PUSHER_KEY &&
      process.env.PUSHER_SECRET &&
      process.env.PUSHER_CLUSTER,
  )
}

function getPusher(): Pusher | null {
  if (!isRealtimeEnabled()) return null
  if (pusher === undefined) {
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    })
  }
  return pusher
}

/**
 * Sign a private-channel subscription. Used by /api/pusher/auth after
 * the route has already verified the user is allowed on that channel.
 */
export function authorizeChannel(socketId: string, channel: string) {
  const client = getPusher()
  if (!client) {
    throw new Error("Realtime is not configured")
  }
  return client.authorizeChannel(socketId, channel)
}

/**
 * Publish an event to one or more private channels.
 * Never throws — a delivery failure must not undo message persistence.
 */
export async function broadcast(
  channels: string | string[],
  event: RealtimePayload,
): Promise<void> {
  try {
    const client = getPusher()
    if (!client) return

    const list = [...new Set((Array.isArray(channels) ? channels : [channels]).filter(Boolean))]
    if (list.length === 0) return

    await client.trigger(list, event.type, event)
  } catch (err) {
    console.error("[realtime] broadcast failed", err)
  }
}
