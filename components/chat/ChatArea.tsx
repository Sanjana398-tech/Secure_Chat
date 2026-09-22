"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ArrowLeft } from "lucide-react"
import type { Conversation, Message, OutgoingMessagePayload, PublicUser } from "@/types"
import UserAvatar from "@/components/chat/UserAvatar"
import MessageList from "@/components/chat/MessageList"
import MessageInput from "@/components/chat/MessageInput"
import { formatLastSeen } from "@/lib/utils"
import { isClientRealtimeEnabled } from "@/lib/realtime/client"
import { useConversationRealtime } from "@/hooks/useRealtime"
import type { LanguageCode } from "@/lib/localization"

const POLL_MS = 2500

function mergeIncoming(prev: Message[], incoming: Message): Message[] {
  if (prev.some((m) => m.id === incoming.id)) return prev
  const withoutOptimistic = prev.filter(
    (m) =>
      !(
        m.id.startsWith("temp-") &&
        m.senderId === incoming.senderId &&
        m.content === incoming.content
      ),
  )
  return [...withoutOptimistic, incoming]
}

interface Props {
  conversation: Conversation
  currentUser: PublicUser
  onBack: () => void
  onConversationUpdate: (id: string, update: Partial<Conversation>) => void
  language: LanguageCode
  voiceAlertsEnabled: boolean
}

export default function ChatArea({
  conversation,
  currentUser,
  onBack,
  onConversationUpdate,
  language,
  voiceAlertsEnabled,
}: Props) {
  const { otherUser } = conversation
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [otherUserOnline, setOtherUserOnline] = useState(otherUser.isOnline)
  const [otherUserLastSeen, setOtherUserLastSeen] = useState(otherUser.lastSeen)
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when conversation prop changes (e.g. from presence event)
  useEffect(() => {
    setOtherUserOnline(otherUser.isOnline)
    setOtherUserLastSeen(otherUser.lastSeen)
  }, [otherUser.isOnline, otherUser.lastSeen])

  const loadMessages = useCallback(
    async (markRead: boolean) => {
      const qs = markRead ? "" : "?markRead=false"
      const res = await fetch(`/api/conversations/${conversation.id}/messages${qs}`)
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to load messages")
      return (json.data ?? []) as Message[]
    },
    [conversation.id],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    setMessages([])
    setIsTyping(false)

    loadMessages(true)
      .then((data) => {
        if (!cancelled) setMessages(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load messages")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadMessages])

  // Polling fallback when Pusher is not configured
  useEffect(() => {
    if (isClientRealtimeEnabled()) return

    // Poll messages
    const msgTimer = window.setInterval(() => {
      loadMessages(false)
        .then((serverMessages) => {
          setMessages((prev) => {
            const temps = prev.filter(
              (m) =>
                m.id.startsWith("temp-") &&
                !serverMessages.some(
                  (s) => s.senderId === m.senderId && s.content === m.content,
                ),
            )
            return [...serverMessages, ...temps]
          })
        })
        .catch(() => {
          /* keep existing messages on transient poll errors */
        })
    }, POLL_MS)

    // Poll typing state
    const typingTimer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${conversation.id}/typing`)
        const json = await res.json()
        if (res.ok) {
          setIsTyping(json.data?.typing ?? false)
        }
      } catch {
        /* ignore polling failures */
      }
    }, POLL_MS)

    return () => {
      window.clearInterval(msgTimer)
      window.clearInterval(typingTimer)
    }
  }, [loadMessages, conversation.id])

  // Subscribe to conversation channel for realtime events
  useConversationRealtime(conversation.id, {
    onNewMessage: (event) => {
      if (event.conversationId !== conversation.id) return
      setMessages((prev) => mergeIncoming(prev, event.message))
      onConversationUpdate(conversation.id, {
        lastMessage: event.message,
        updatedAt: event.message.createdAt,
        unreadCount: 0,
      })
      // If the other user sent a message, they stopped typing
      if (event.message.senderId !== currentUser.id) {
        setIsTyping(false)
      }
    },
    onMessageRead: (event) => {
      if (event.conversationId !== conversation.id) return
      // Mark messages as read in the local state (update double-ticks)
      setMessages((prev) =>
        prev.map((m) =>
          event.messageIds.includes(m.id) ? { ...m, isRead: true, readAt: new Date().toISOString() } : m,
        ),
      )
    },
    onTyping: (event) => {
      if (event.conversationId !== conversation.id) return
      // Ignore own typing events
      if (event.userId === currentUser.id) return

      if (event.type === "typing") {
        setIsTyping(true)
        // Auto-clear after 4 seconds (matches server TTL)
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
        typingTimerRef.current = setTimeout(() => setIsTyping(false), 4000)
      } else {
        setIsTyping(false)
        if (typingTimerRef.current) {
          clearTimeout(typingTimerRef.current)
          typingTimerRef.current = null
        }
      }
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(
    async (payload: OutgoingMessagePayload): Promise<boolean> => {
      const tempId = `temp-${Date.now()}`
      const optimistic: Message = {
        id: tempId,
        conversationId: conversation.id,
        senderId: currentUser.id,
        receiverId: otherUser.id,
        content: payload.content,
        messageType: payload.messageType ?? "text",
        mediaUrl: payload.mediaUrl ?? null,
        mediaDuration: payload.mediaDuration ?? null,
        paymentAmount: payload.paymentAmount ?? null,
        paymentUpiId: payload.paymentUpiId ?? null,
        paymentNote: payload.paymentNote ?? null,
        isRead: false,
        readAt: null,
        createdAt: new Date().toISOString(),
        // Trinetra fields not yet available for optimistic message
        trinetraPrediction: null,
        trinetraConfidence: null,
        safeProbability: null,
        scamProbability: null,
        isFlagged: null,
        analyzedAt: null,
        trinetraTranscription: null,
        trinetraOcrText: null,
        trinetraDetectedUrls: [],
        trinetraQrContent: null,
        trinetraReasons: [],
        trinetraLanguage: null,
        trinetraSpeechText: null,
      }
      setMessages((prev) => [...prev, optimistic])

      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            receiverId: otherUser.id,
            ...payload,
            language,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "Send failed")

        setMessages((prev) => {
          if (prev.some((m) => m.id === json.data.id)) {
            return prev.filter((m) => m.id !== tempId)
          }
          return prev.map((m) => (m.id === tempId ? json.data : m))
        })

        onConversationUpdate(conversation.id, {
          lastMessage: json.data,
          updatedAt: json.data.createdAt,
        })

        return true
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        return false
      }
    },
    [conversation.id, currentUser.id, otherUser.id, onConversationUpdate, language],
  )

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card flex-shrink-0">
        <button
          onClick={onBack}
          className="flex md:hidden size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors flex-shrink-0"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-4" />
        </button>

        <UserAvatar
          user={{ ...otherUser, isOnline: otherUserOnline }}
          size="md"
          showOnline
          dotBorder="border-card"
        />

        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {otherUser.username ?? otherUser.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {otherUserOnline ? (
              <span className="text-emerald-400">● Online</span>
            ) : (
              formatLastSeen(otherUserLastSeen)
            )}
          </p>
        </div>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        currentUserId={currentUser.id}
        loading={loading}
        error={error}
        bottomRef={bottomRef}
        language={language}
        voiceAlertsEnabled={voiceAlertsEnabled}
      />

      {/* Typing indicator */}
      {isTyping && (
        <div className="px-4 py-1.5 flex items-center gap-2">
          <div className="flex gap-1">
            <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
            <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
            <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-muted-foreground italic">
            {otherUser.username ?? otherUser.name} is typing…
          </span>
        </div>
      )}

      {/* Message input */}
      <MessageInput onSend={handleSend} conversationId={conversation.id} />
    </div>
  )
}
