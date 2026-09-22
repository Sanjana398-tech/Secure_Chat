"use client"

import type { Conversation } from "@/types"
import { formatMessageTime } from "@/lib/utils"
import UserAvatar from "@/components/chat/UserAvatar"

interface Props {
  conversation: Conversation
  isActive: boolean
  currentUserId: string
  onSelect: () => void
}

export default function ConversationItem({
  conversation,
  isActive,
  currentUserId,
  onSelect,
}: Props) {
  const { otherUser, lastMessage, unreadCount } = conversation

  const preview = lastMessage
    ? lastMessage.senderId === currentUserId
      ? `You: ${lastMessage.content}`
      : lastMessage.content
    : "Start a conversation"

  const time = lastMessage
    ? formatMessageTime(lastMessage.createdAt)
    : null

  const truncated =
    preview.length > 42 ? preview.slice(0, 42) + "…" : preview

  return (
    <button
      onClick={onSelect}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
        ${isActive
          ? "bg-sidebar-accent"
          : "hover:bg-sidebar-accent/60"
        }
      `}
    >
      <UserAvatar user={otherUser} size="md" showOnline />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span
            className={`truncate text-sm ${
              unreadCount > 0
                ? "font-semibold text-sidebar-foreground"
                : "font-medium text-sidebar-foreground"
            }`}
          >
            {otherUser.username ?? otherUser.name}
          </span>
          {time && (
            <span className="flex-shrink-0 text-[10px] text-muted-foreground">
              {time}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span
            className={`truncate text-xs ${
              unreadCount > 0
                ? "text-sidebar-foreground"
                : "text-muted-foreground"
            }`}
          >
            {truncated}
          </span>
          {unreadCount > 0 && (
            <span className="flex-shrink-0 flex size-4 min-w-[1rem] items-center justify-center rounded-full bg-sidebar-primary text-[10px] font-semibold text-sidebar-primary-foreground px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
