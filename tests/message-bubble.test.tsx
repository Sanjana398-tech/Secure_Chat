import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import MessageBubble from "@/components/chat/MessageBubble"
import type { Message } from "@/types"

describe("Trinetra result display", () => {
  it("renders the actual verdict, scores, and detection type", () => {
    const message = {
      id: "message-1",
      conversationId: "conversation-1",
      senderId: "sender-1",
      receiverId: "receiver-1",
      content: "Pay this invoice now",
      messageType: "payment",
      mediaUrl: null,
      mediaDuration: null,
      paymentAmount: 250,
      paymentUpiId: "merchant@bank",
      paymentNote: "Order 42",
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      trinetraPrediction: "SCAM",
      trinetraConfidence: 96.4,
      safeProbability: null,
      scamProbability: null,
      isFlagged: true,
      analyzedAt: new Date().toISOString(),
      trinetraTranscription: null,
      trinetraOcrText: null,
      trinetraDetectedUrls: [],
      trinetraQrContent: null,
      trinetraReasons: ["Recipient handle is uncommon."],
      trinetraLanguage: "en",
      trinetraSpeechText: null,
      trinetraDetectionType: "upi",
      trinetraRisk: 83.2,
      trinetraExplanation: "Payment indicators resemble a scam.",
      trinetraTips: ["Verify the recipient before paying."],
      trinetraUnavailable: false,
    } satisfies Message

    const html = renderToStaticMarkup(
      <MessageBubble
        message={message}
        isOwn
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
      />,
    )

    expect(html).toContain("Scam Detected")
    expect(html).toContain("96.40% confidence")
    expect(html).toContain("83.20% risk")
    expect(html).toContain("Why?")

    const spamHtml = renderToStaticMarkup(
      <MessageBubble
        message={{ ...message, id: "message-spam", trinetraPrediction: "SPAM", isFlagged: false }}
        isOwn
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
      />,
    )

    expect(spamHtml).toContain("Scam Detected")
  })

  it("shows safe-result explanation and tips without creating a second result component", () => {
    const message = {
      id: "message-safe",
      conversationId: "conversation-1",
      senderId: "sender-1",
      receiverId: "receiver-1",
      content: "See you tomorrow",
      messageType: "text",
      mediaUrl: null,
      mediaDuration: null,
      paymentAmount: null,
      paymentUpiId: null,
      paymentNote: null,
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      trinetraPrediction: "SAFE",
      trinetraConfidence: 99,
      safeProbability: null,
      scamProbability: null,
      isFlagged: false,
      analyzedAt: new Date().toISOString(),
      trinetraTranscription: null,
      trinetraOcrText: null,
      trinetraDetectedUrls: [],
      trinetraQrContent: null,
      trinetraReasons: ["No suspicious pattern was detected."],
      trinetraLanguage: "en",
      trinetraSpeechText: null,
      trinetraDetectionType: "message",
      trinetraRisk: 0.5,
      trinetraExplanation: "The message appears safe.",
      trinetraTips: ["Stay cautious with unexpected requests."],
      trinetraUnavailable: false,
    } satisfies Message

    const html = renderToStaticMarkup(
      <MessageBubble
        message={message}
        isOwn
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
      />,
    )

    expect(html).toContain("The message appears safe.")
    expect(html).toContain("No suspicious pattern was detected.")
    expect(html).toContain("Stay cautious with unexpected requests.")

    for (const safeAlias of ["NOT_SPAM", "NOT SPAM", "HAM"]) {
      const safeAliasHtml = renderToStaticMarkup(
        <MessageBubble
          message={{ ...message, id: `message-${safeAlias}`, trinetraPrediction: safeAlias }}
          isOwn
          isLastInRun
          language="en"
          voiceAlertsEnabled={false}
        />,
      )

      expect(safeAliasHtml).toContain("Safe")
    }
  })
})