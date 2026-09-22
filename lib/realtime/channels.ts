/**
 * Shared channel name helpers.
 * Safe to import from both server and client — no Pusher SDK here.
 */

export function conversationChannel(conversationId: string): string {
  return `private-conversation-${conversationId}`
}

export function userChannel(userId: string): string {
  return `private-user-${userId}`
}

export function parseConversationChannel(channel: string): string | null {
  const prefix = "private-conversation-"
  if (!channel.startsWith(prefix)) return null
  const id = channel.slice(prefix.length)
  return id || null
}

export function parseUserChannel(channel: string): string | null {
  const prefix = "private-user-"
  if (!channel.startsWith(prefix)) return null
  const id = channel.slice(prefix.length)
  return id || null
}
