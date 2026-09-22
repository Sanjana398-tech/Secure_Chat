"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import type { Conversation, Message, PublicUser } from "@/types"
import Sidebar from "@/components/chat/Sidebar"
import ChatArea from "@/components/chat/ChatArea"
import EmptyState from "@/components/chat/EmptyState"
import { isClientRealtimeEnabled } from "@/lib/realtime/client"
import { useUserRealtime } from "@/hooks/useRealtime"
import { type LanguageCode } from "@/lib/localization"

const POLL_MS = 2500

interface Props {
  currentUser: PublicUser
  initialConversations: Conversation[]
}

function applyLastMessage(
  prev: Conversation[],
  conversationId: string,
  message: Message,
  currentUserId: string,
  activeConversationId: string | null,
): Conversation[] {
  return prev
    .map((c) => {
      if (c.id !== conversationId) return c
      const incoming = message.senderId !== currentUserId
      const viewing = activeConversationId === conversationId
      return {
        ...c,
        lastMessage: message,
        updatedAt: message.createdAt,
        unreadCount: incoming && !viewing ? c.unreadCount + 1 : viewing ? 0 : c.unreadCount,
      }
    })
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
}

// ─── Toast notification ──────────────────────────────────────────────────────

interface Toast {
  id: string
  username: string
  content: string
  conversationId: string
}

function ToastNotification({
  toasts,
  onDismiss,
  onClick,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
  onClick: (conversationId: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="
            flex items-start gap-3 rounded-xl bg-card border border-border shadow-lg
            px-4 py-3 cursor-pointer transition-all animate-in slide-in-from-bottom-2 fade-in
          "
          onClick={() => {
            onClick(toast.conversationId)
            onDismiss(toast.id)
          }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">
              {toast.username}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {toast.content}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDismiss(toast.id)
            }}
            className="text-muted-foreground hover:text-foreground text-xs flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export default function ChatDashboard({ currentUser, initialConversations }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [currentUserState, setCurrentUserState] = useState<PublicUser>(currentUser)
  const [language, setLanguage] = useState<LanguageCode>("en")
  const [voiceAlertsEnabled, setVoiceAlertsEnabled] = useState(true)
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeConversationId

  useEffect(() => {
    const saved = window.localStorage.getItem("trinetra-language")
    if (saved === "en" || saved === "hi" || saved === "kn" || saved === "te" || saved === "ta" || saved === "ml") {
      setLanguage(saved)
    }
    const savedVoiceAlerts = window.localStorage.getItem("trinetra-voice-alerts")
    if (savedVoiceAlerts !== null) setVoiceAlertsEnabled(savedVoiceAlerts === "true")
  }, [])

  function handleLanguageChange(nextLanguage: LanguageCode) {
    setLanguage(nextLanguage)
    window.localStorage.setItem("trinetra-language", nextLanguage)
  }

  function handleVoiceAlertsChange(enabled: boolean) {
    setVoiceAlertsEnabled(enabled)
    window.localStorage.setItem("trinetra-voice-alerts", String(enabled))
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null

  // Auto-dismiss toasts after 5 seconds
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1))
    }, 5000)
    return () => clearTimeout(timer)
  }, [toasts])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (conversationId: string, username: string, content: string) => {
      // Don't show toast for the currently viewed conversation
      if (activeIdRef.current === conversationId) return
      setToasts((prev) => [
        ...prev.slice(-3), // keep max 4 toasts
        { id: `${Date.now()}-${conversationId}`, username, content, conversationId },
      ])
    },
    [],
  )

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations")
      const json = await res.json()
      if (res.ok && json.data) {
        setConversations(json.data)
      }
    } catch {
      /* keep current list on network errors */
    }
  }, [])

  // Subscribe to user channel for new-message and presence events
  useUserRealtime(currentUser.id, {
    onNewMessage: (event) => {
      const { conversationId, message } = event
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversationId)
        if (!exists) {
          void refreshConversations()
          // Show toast for new conversation messages
          if (message.senderId !== currentUser.id) {
            addToast(conversationId, message.sender?.username ?? "New message", message.content)
          }
          return prev
        }
        // Show toast for incoming messages not in the active conversation
        if (message.senderId !== currentUser.id) {
          const convo = prev.find((c) => c.id === conversationId)
          addToast(
            conversationId,
            convo?.otherUser.username ?? convo?.otherUser.name ?? "New message",
            message.content,
          )
        }
        return applyLastMessage(
          prev,
          conversationId,
          message,
          currentUser.id,
          activeIdRef.current,
        )
      })
    },
    onPresence: (event) => {
      // Update the online status of the relevant user in the conversations list
      setConversations((prev) =>
        prev.map((c) =>
          c.otherUser.id === event.userId
            ? {
                ...c,
                otherUser: {
                  ...c.otherUser,
                  isOnline: event.isOnline,
                  lastSeen: event.lastSeen,
                },
              }
            : c,
        ),
      )
    },
  })

  useEffect(() => {
    if (isClientRealtimeEnabled()) return
    const timer = window.setInterval(() => {
      void refreshConversations()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [refreshConversations])

  // Presence heartbeat — tell the server we're online while the dashboard is open.
  // Uses the Page Visibility API: when the tab is hidden the user is marked offline,
  // and when it becomes visible again the heartbeat resumes.
  // sendBeacon is intentionally NOT used — it sends text/plain which the server
  // cannot parse as JSON. The 45-second presence TTL handles stale sessions.
  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    async function heartbeat() {
      if (cancelled) return
      try {
        await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isOnline: true }),
        })
      } catch {
        /* ignore heartbeat failures */
      }
    }

    async function markOffline() {
      try {
        await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isOnline: false }),
        })
      } catch {
        /* ignore */
      }
    }

    function startHeartbeat() {
      heartbeat()
      timer = window.setInterval(heartbeat, 30_000)
    }

    function stopHeartbeat() {
      if (timer) {
        window.clearInterval(timer)
        timer = null
      }
    }

    // Start or stop based on current visibility
    if (document.hidden) {
      markOffline()
    } else {
      startHeartbeat()
    }

    function onVisibilityChange() {
      if (cancelled) return
      if (document.hidden) {
        stopHeartbeat()
        markOffline()
      } else {
        startHeartbeat()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      cancelled = true
      stopHeartbeat()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id)
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
    )
    setShowChat(true)
    // Dismiss any toasts for this conversation
    setToasts((prev) => prev.filter((t) => t.conversationId !== id))
  }, [])

  const handleNewConversation = useCallback((conversation: Conversation) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === conversation.id)
      if (exists) return prev
      return [conversation, ...prev]
    })
    setActiveConversationId(conversation.id)
    setShowChat(true)
  }, [])

  const handleConversationUpdate = useCallback(
    (conversationId: string, update: Partial<Conversation>) => {
      setConversations((prev) =>
        prev
          .map((c) => (c.id === conversationId ? { ...c, ...update } : c))
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
      )
    },
    [],
  )

  const handleProfileUpdate = useCallback((updated: PublicUser) => {
    setCurrentUserState(updated)
  }, [])

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <div
        className={`
          flex-shrink-0 w-full md:w-80 lg:w-96 border-r border-border
          ${showChat ? "hidden md:flex" : "flex"}
          flex-col
        `}
      >
        <Sidebar
          currentUser={currentUserState}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onProfileUpdate={handleProfileUpdate}
          language={language}
          onLanguageChange={handleLanguageChange}
          voiceAlertsEnabled={voiceAlertsEnabled}
          onVoiceAlertsChange={handleVoiceAlertsChange}
        />
      </div>

      <div
        className={`
          flex-1 min-w-0
          ${showChat ? "flex" : "hidden md:flex"}
          flex-col
        `}
      >
        {activeConversation ? (
          <ChatArea
            key={activeConversation.id}
            conversation={activeConversation}
            currentUser={currentUserState}
            onBack={() => setShowChat(false)}
            onConversationUpdate={handleConversationUpdate}
            language={language}
            voiceAlertsEnabled={voiceAlertsEnabled}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Toast notifications */}
      <ToastNotification
        toasts={toasts}
        onDismiss={dismissToast}
        onClick={handleSelectConversation}
      />
    </div>
  )
}
