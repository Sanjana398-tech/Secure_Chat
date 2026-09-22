"use client"

import { useEffect, useRef } from "react"
import { getPusherClient } from "@/lib/realtime/client"
import { conversationChannel, userChannel } from "@/lib/realtime/channels"
import type {
  NewMessageEvent,
  MessageReadEvent,
  TypingEvent,
  PresenceEvent,
} from "@/types"

export { isClientRealtimeEnabled } from "@/lib/realtime/client"

// ─── User channel (sidebar + incoming chats + presence) ──────────────────────

interface UserRealtimeHandlers {
  onNewMessage: (event: NewMessageEvent) => void
  onPresence?: (event: PresenceEvent) => void
}

/**
 * Subscribe to a user's private channel.
 * Handles new-message and presence events.
 */
export function useUserRealtime(
  userId: string | null,
  handlers: UserRealtimeHandlers,
) {
  const handlerRef = useRef(handlers)
  handlerRef.current = handlers

  useEffect(() => {
    if (!userId) return
    const pusher = getPusherClient()
    if (!pusher) return

    const name = userChannel(userId)
    const channel = pusher.subscribe(name)

    const messageHandler = (event: NewMessageEvent) => {
      if (event?.type === "new-message" && event.message) {
        handlerRef.current.onNewMessage(event)
      }
    }
    const presenceHandler = (event: PresenceEvent) => {
      if (event?.type === "presence") {
        handlerRef.current.onPresence?.(event)
      }
    }

    channel.bind("new-message", messageHandler)
    channel.bind("presence", presenceHandler)

    return () => {
      channel.unbind("new-message", messageHandler)
      channel.unbind("presence", presenceHandler)
      pusher.unsubscribe(name)
    }
  }, [userId])
}

// ─── Conversation channel (open chat thread + typing + read receipts) ────────

interface ConversationRealtimeHandlers {
  onNewMessage: (event: NewMessageEvent) => void
  onMessageRead?: (event: MessageReadEvent) => void
  onTyping?: (event: TypingEvent) => void
}

/**
 * Subscribe to a conversation channel.
 * Handles new-message, message-read, typing, and stop-typing events.
 */
export function useConversationRealtime(
  conversationId: string | null,
  handlers: ConversationRealtimeHandlers,
) {
  const handlerRef = useRef(handlers)
  handlerRef.current = handlers

  useEffect(() => {
    if (!conversationId) return
    const pusher = getPusherClient()
    if (!pusher) return

    const name = conversationChannel(conversationId)
    const channel = pusher.subscribe(name)

    const messageHandler = (event: NewMessageEvent) => {
      if (event?.type === "new-message" && event.message) {
        handlerRef.current.onNewMessage(event)
      }
    }
    const readHandler = (event: MessageReadEvent) => {
      if (event?.type === "message-read") {
        handlerRef.current.onMessageRead?.(event)
      }
    }
    const typingHandler = (event: TypingEvent) => {
      if (event?.type === "typing" || event?.type === "stop-typing") {
        handlerRef.current.onTyping?.(event)
      }
    }

    channel.bind("new-message", messageHandler)
    channel.bind("message-read", readHandler)
    channel.bind("typing", typingHandler)
    channel.bind("stop-typing", typingHandler)

    return () => {
      channel.unbind("new-message", messageHandler)
      channel.unbind("message-read", readHandler)
      channel.unbind("typing", typingHandler)
      channel.unbind("stop-typing", typingHandler)
      pusher.unsubscribe(name)
    }
  }, [conversationId])
}
