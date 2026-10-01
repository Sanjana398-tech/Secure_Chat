import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import ConversationItem from "@/components/chat/ConversationItem"
import type { Conversation, Message } from "@/types"

function conversation(message: Partial<Message> & Pick<Message, "content" | "trinetraLocked">) {
  const lastMessage = {
    id: "message-1",
    conversationId: "conversation-1",
    senderId: "sender-1",
    receiverId: "receiver-1",
    messageType: "text",
    mediaUrl: null,
    mediaDuration: null,
    paymentAmount: null,
    paymentUpiId: null,
    paymentNote: null,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    trinetraPrediction: "SCAM",
    trinetraConfidence: 95,
    safeProbability: null,
    scamProbability: null,
    isFlagged: true,
    analyzedAt: new Date().toISOString(),
    trinetraTranscription: null,
    trinetraOcrText: null,
    trinetraDetectedUrls: [],
    trinetraQrContent: null,
    trinetraReasons: [],
    trinetraLanguage: "en",
    trinetraSpeechText: null,
    trinetraDetectionType: "message",
    trinetraRisk: 95,
    trinetraExplanation: null,
    trinetraTips: [],
    trinetraUnavailable: false,
    trinetraOpenedAt: null,
    ...message,
  } satisfies Message

  return {
    id: "conversation-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    otherUser: {
      id: "sender-1",
      name: "Sender Name",
      username: "sender",
      email: "sender@example.test",
      image: null,
      isOnline: true,
      lastSeen: null,
    },
    lastMessage,
    unreadCount: 1,
  } satisfies Conversation
}

describe("conversation previews", () => {
  it("hides a locked message body from the receiver's sidebar preview", () => {
    const html = renderToStaticMarkup(
      <ConversationItem
        conversation={conversation({ content: "secret suspicious body", trinetraLocked: true })}
        isActive={false}
        currentUserId="receiver-1"
        onSelect={() => undefined}
      />,
    )

    expect(html).toContain("Trinetra flagged a message.")
    expect(html).not.toContain("secret suspicious body")
  })

  it("keeps the sender's own message preview visible", () => {
    const html = renderToStaticMarkup(
      <ConversationItem
        conversation={conversation({ content: "my sent suspicious body", trinetraLocked: true })}
        isActive={false}
        currentUserId="sender-1"
        onSelect={() => undefined}
      />,
    )

    expect(html).toContain("You: my sent suspicious body")
  })
})
