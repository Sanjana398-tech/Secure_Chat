"use client"

import type { Message } from "@/types"
import MessageBubble from "@/components/chat/MessageBubble"
import { formatMessageDate } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import type { LanguageCode } from "@/lib/localization"

interface Props {
  messages: Message[]
  currentUserId: string
  loading: boolean
  error: string
  bottomRef: React.RefObject<HTMLDivElement | null>
  language: LanguageCode
  voiceAlertsEnabled: boolean
}

export default function MessageList({
  messages,
  currentUserId,
  loading,
  error,
  bottomRef,
  language,
  voiceAlertsEnabled,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 text-muted-foreground animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="text-sm text-muted-foreground">
          No messages yet. Say hello! 👋
        </p>
      </div>
    )
  }

  // Group messages by date and add separators
  const groups: { date: string; messages: Message[] }[] = []
  for (const msg of messages) {
    const date = formatMessageDate(msg.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.date === date) {
      last.messages.push(msg)
    } else {
      groups.push({ date, messages: [msg] })
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {groups.map((group) => (
        <div key={group.date}>
          {/* Date separator */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground px-1 flex-shrink-0">
              {group.date}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-1">
            {group.messages.map((msg, i) => {
              const isOwn = msg.senderId === currentUserId
              // Show avatar only on the last message in a run from same sender
              const nextMsg = group.messages[i + 1]
              const isLastInRun =
                !nextMsg || nextMsg.senderId !== msg.senderId

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={isOwn}
                  isLastInRun={isLastInRun}
                  language={language}
                  voiceAlertsEnabled={voiceAlertsEnabled}
                />
              )
            })}
          </div>
        </div>
      ))}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  )
}
