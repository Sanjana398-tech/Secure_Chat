"use client"

import Pusher from "pusher-js"

let client: Pusher | null | undefined

export function isClientRealtimeEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  )
}

/**
 * Browser Pusher singleton. Returns null when public keys are not set
 * so callers can fall back to polling.
 */
export function getPusherClient(): Pusher | null {
  if (!isClientRealtimeEnabled()) return null
  if (client === undefined) {
    client = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
    })
  }
  return client
}
