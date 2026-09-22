"use client"

import type { Conversation } from "@/types"
import ConversationItem from "@/components/chat/ConversationItem"
import { MessageSquarePlus } from "lucide-react"

interface Props {
  conversations: Conversation[]
  activeConversationId: string | null
  currentUserId: string
  onSelect: (id: string) => void
  searchActive: boolean
}

export default function ConversationList({
  conversations,
  activeConversationId,
  currentUserId,
  onSelect,
  searchActive,
}: Props) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-sidebar-accent">
          <MessageSquarePlus className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-sidebar-foreground">
            {searchActive ? "No conversations found" : "No conversations yet"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {searchActive
              ? "Try a different search term"
              : "Tap + to start your first conversation"}
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="flex flex-col py-1">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <ConversationItem
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
            currentUserId={currentUserId}
            onSelect={() => onSelect(conversation.id)}
          />
        </li>
      ))}
    </ul>
  )
}
