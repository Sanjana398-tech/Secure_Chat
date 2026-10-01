import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import MessageBubble from "@/components/chat/MessageBubble"
import { getProtectionAlertCopy } from "@/lib/localization"
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
      trinetraScanId: null,
      trinetraSpeechText: null,
      trinetraDetectionType: "upi",
      trinetraRisk: 83.2,
      trinetraExplanation: "Payment indicators resemble a scam.",
      trinetraTips: ["Verify the recipient before paying."],
      trinetraUnavailable: false,
      trinetraOpenedAt: null,
      trinetraLocked: false,
    } satisfies Message

    const html = renderToStaticMarkup(
      <MessageBubble
        message={message}
        isOwn
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
        onOpenProtectedMessage={async () => true}
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
        onOpenProtectedMessage={async () => true}
      />,
    )

    expect(spamHtml).toContain("Spam Detected")
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
      trinetraScanId: null,
      trinetraSpeechText: null,
      trinetraDetectionType: "message",
      trinetraRisk: 0.5,
      trinetraExplanation: "The message appears safe.",
      trinetraTips: ["Stay cautious with unexpected requests."],
      trinetraUnavailable: false,
      trinetraOpenedAt: null,
      trinetraLocked: false,
    } satisfies Message

    const html = renderToStaticMarkup(
      <MessageBubble
        message={message}
        isOwn
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
        onOpenProtectedMessage={async () => true}
      />,
    )

    expect(html).toContain("The message appears safe.")
    expect(html).toContain("No suspicious pattern was detected.")
    expect(html).toContain("Stay cautious with unexpected requests.")
    expect(html).not.toContain("Trinetra Protection Alert")

    const receivedSafeHtml = renderToStaticMarkup(
      <MessageBubble
        message={message}
        isOwn={false}
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
        onOpenProtectedMessage={async () => true}
      />,
    )
    expect(receivedSafeHtml).toContain("Trinetra Safe")
    expect(receivedSafeHtml).toContain("See you tomorrow")

    for (const safeAlias of ["NOT_SPAM", "NOT SPAM", "HAM"]) {
      const safeAliasHtml = renderToStaticMarkup(
        <MessageBubble
          message={{ ...message, id: `message-${safeAlias}`, trinetraPrediction: safeAlias }}
          isOwn
          isLastInRun
          language="en"
          voiceAlertsEnabled={false}
          onOpenProtectedMessage={async () => true}
        />,
      )

      expect(safeAliasHtml).toContain("Safe")
    }
  })

  it("hides a locked suspicious message until the receiver chooses to open it", () => {
    const message = {
      id: "message-locked",
      conversationId: "conversation-1",
      senderId: "sender-1",
      receiverId: "receiver-1",
      content: "Send your password immediately",
      messageType: "text",
      mediaUrl: null,
      mediaDuration: null,
      paymentAmount: null,
      paymentUpiId: null,
      paymentNote: null,
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      trinetraPrediction: "SUSPICIOUS",
      trinetraConfidence: 91,
      safeProbability: null,
      scamProbability: null,
      isFlagged: false,
      analyzedAt: new Date().toISOString(),
      trinetraTranscription: null,
      trinetraOcrText: null,
      trinetraDetectedUrls: [],
      trinetraQrContent: null,
      trinetraReasons: [],
      trinetraLanguage: "en",
      trinetraScanId: "scan-locked-1",
      trinetraSpeechText: null,
      trinetraDetectionType: "message",
      trinetraRisk: 88,
      trinetraExplanation: "Potentially harmful content.",
      trinetraTips: [],
      trinetraUnavailable: false,
      trinetraOpenedAt: null,
      trinetraLocked: true,
    } satisfies Message

    const html = renderToStaticMarkup(
      <MessageBubble
        message={message}
        isOwn={false}
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
        onOpenProtectedMessage={async () => true}
      />,
    )

    expect(html).toContain("Trinetra Protection Alert")
    expect(html).toContain(">Open</button>")
    expect(html).toContain("Don&#x27;t Open")
    expect(html).not.toContain("Send your password immediately")

    const aliasedSpamHtml = renderToStaticMarkup(
      <MessageBubble
        message={{
          ...message,
          id: "message-spam-alias",
          trinetraPrediction: "SPAM",
          trinetraLocked: false,
        }}
        isOwn={false}
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
        onOpenProtectedMessage={async () => true}
      />,
    )
    expect(aliasedSpamHtml).toContain("Trinetra Protection Alert")
    expect(aliasedSpamHtml).not.toContain("Send your password immediately")

    const openedHtml = renderToStaticMarkup(
      <MessageBubble
        message={{
          ...message,
          trinetraOpenedAt: new Date().toISOString(),
          trinetraLocked: false,
        }}
        isOwn={false}
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
        onOpenProtectedMessage={async () => true}
      />,
    )
    expect(openedHtml).toContain("Send your password immediately")
    expect(openedHtml).not.toContain("Trinetra Protection Alert")

    const hindiAlertHtml = renderToStaticMarkup(
      <MessageBubble
        message={{ ...message, trinetraLanguage: "hi-IN" }}
        isOwn={false}
        isLastInRun
        language="en"
        voiceAlertsEnabled={false}
        onOpenProtectedMessage={async () => true}
      />,
    )
    expect(hindiAlertHtml).toContain(getProtectionAlertCopy("hi").open)
    expect(hindiAlertHtml).toContain(getProtectionAlertCopy("hi").dontOpen)
    expect(hindiAlertHtml).not.toContain("Send your password immediately")

    for (const language of ["en", "hi", "kn", "te", "ta", "ml"]) {
      expect(getProtectionAlertCopy(language).open).toBeTruthy()
      expect(getProtectionAlertCopy(language).dontOpen).toBeTruthy()
    }

    const protectedMedia = [
      {
        ...message,
        id: "message-image-locked",
        messageType: "image" as const,
        mediaUrl: "/api/files/0123456789abcdef0123456789abcdef.png",
      },
      {
        ...message,
        id: "message-voice-locked",
        messageType: "voice" as const,
        mediaUrl: "/api/files/0123456789abcdef0123456789abcdef.webm",
      },
    ]

    for (const protectedMessage of protectedMedia) {
      const lockedMediaHtml = renderToStaticMarkup(
        <MessageBubble
          message={protectedMessage}
          isOwn={false}
          isLastInRun
          language="en"
          voiceAlertsEnabled={false}
          onOpenProtectedMessage={async () => true}
        />,
      )
      expect(lockedMediaHtml).not.toContain("<img")
      expect(lockedMediaHtml).not.toContain("<audio")

      const openedMediaHtml = renderToStaticMarkup(
        <MessageBubble
          message={{
            ...protectedMessage,
            trinetraOpenedAt: new Date().toISOString(),
            trinetraLocked: false,
          }}
          isOwn={false}
          isLastInRun
          language="en"
          voiceAlertsEnabled={false}
          onOpenProtectedMessage={async () => true}
        />,
      )
      if (protectedMessage.messageType === "image") {
        expect(openedMediaHtml).toContain("<img")
      } else {
        expect(openedMediaHtml).toContain("<audio")
        expect(openedMediaHtml).toContain("controls")
        expect(openedMediaHtml).not.toContain("autoplay")
      }
    }
  })
})