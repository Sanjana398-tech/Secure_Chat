import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const db = {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  }
  const getTrinetraProtectionStatus = vi.fn()
  const analyzeTrinetraContent = vi.fn()
  const analyzeTrinetraMedia = vi.fn()
  const broadcast = vi.fn()
  return { db, getTrinetraProtectionStatus, analyzeTrinetraContent, analyzeTrinetraMedia, broadcast }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/db/schema", () => ({
  message: {
    id: "message.id",
    receiverId: "message.receiverId",
    conversationId: "message.conversationId",
    trinetraPrediction: "message.trinetraPrediction",
  },
  conversation: { id: "conversation.id" },
}))
vi.mock("@/lib/realtime", () => ({
  broadcast: mocks.broadcast,
  conversationChannel: (id: string) => `conversation-${id}`,
  userChannel: (id: string) => `user-${id}`,
}))
vi.mock("@/lib/services/trinetra-integration.service", () => ({
  analyzeTrinetraContent: mocks.analyzeTrinetraContent,
  analyzeTrinetraMedia: mocks.analyzeTrinetraMedia,
  getTrinetraProtectionStatus: mocks.getTrinetraProtectionStatus,
  TRINETRA_MAX_CONTENT_LENGTH: 4000,
}))
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  desc: (column: unknown) => column,
  eq: (column: unknown, value: unknown) => ({ column, value }),
  inArray: (column: unknown, values: unknown[]) => ({ column, values }),
}))

import { getMessages, openProtectedMessage, sendMessage } from "@/lib/services/message.service"
import type { TrinetraAnalysisResult } from "@/types"

const safeResult: TrinetraAnalysisResult = {
  detectionType: "message",
  prediction: "SAFE",
  confidence: 98.2,
  risk: 1.8,
  safeProbability: null,
  scamProbability: null,
  explanation: "No suspicious indicators found.",
  reasons: [],
  tips: ["Continue to verify unexpected requests."],
  ocrText: null,
  detectedUrls: [],
  qrContent: null,
  language: "en",
  scanId: null,
  speechText: null,
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: "conversation-1",
    senderId: "secure-user-1",
    receiverId: "secure-user-2",
    messageType: "text" as const,
    content: "Hello there",
    language: "en",
    ...overrides,
  }
}

describe("message delivery with Trinetra Protection", () => {
  beforeEach(() => {
    mocks.db.insert.mockImplementation(() => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => [{ id: "message-1", ...values, readAt: null }],
      }),
    }))
    mocks.db.update.mockImplementation(() => ({
      set: () => ({ where: async () => [] }),
    }))
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: false, linked: false, pending: false })
    mocks.analyzeTrinetraContent.mockResolvedValue(safeResult)
    mocks.analyzeTrinetraMedia.mockResolvedValue({ result: safeResult, transcription: null })
    mocks.broadcast.mockResolvedValue(undefined)
  })

  it("Protection OFF makes no Trinetra request and delivers normally", async () => {
    const sent = await sendMessage(input())

    expect(mocks.analyzeTrinetraContent).not.toHaveBeenCalled()
    expect(sent.content).toBe("Hello there")
    expect(sent.trinetraPrediction).toBeNull()
    expect(sent.trinetraUnavailable).toBe(false)
    expect(mocks.broadcast).toHaveBeenCalledOnce()
  })

  it("Protection ON sends supported message, URL, and UPI content with language", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: true, pending: false })

    await sendMessage(input())
    await sendMessage(input({ messageType: "url", content: "https://example.test/pay" }))
    await sendMessage(input({
      messageType: "payment",
      content: "",
      paymentUpiId: "merchant@bank",
      paymentAmount: 250,
      paymentNote: "Order 42",
    }))

    expect(mocks.analyzeTrinetraContent.mock.calls).toEqual([
      ["secure-user-1", "message", "Hello there", "en"],
      ["secure-user-1", "url", "https://example.test/pay", "en"],
      ["secure-user-1", "upi", "upi://pay?pa=merchant%40bank&am=250&tn=Order+42", "en"],
    ])
  })

  it("persists and broadcasts a scam verdict as an alertable message result", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: true, pending: false })
    mocks.analyzeTrinetraContent.mockResolvedValue({
      ...safeResult,
      prediction: "SCAM",
      scamProbability: 94,
      explanation: "This message matches scam patterns.",
      scanId: "scan-scam-1",
      language: "kn",
    })

    const sent = await sendMessage(input())
    const broadcastMessage = mocks.broadcast.mock.calls[0][1].message

    expect(sent.trinetraPrediction).toBe("SCAM")
    expect(sent.isFlagged).toBe(true)
    expect(sent.trinetraScanId).toBe("scan-scam-1")
    expect(sent.trinetraLanguage).toBe("kn")
    expect(sent.analyzedAt).not.toBeNull()
    expect(broadcastMessage.trinetraPrediction).toBe("SCAM")
    expect(broadcastMessage.isFlagged).toBe(true)
    expect(sent.trinetraLocked).toBe(true)
    expect(broadcastMessage.trinetraLocked).toBe(true)
  })

  it("persists SPAM as a distinct locked receiver result", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: true, pending: false })
    mocks.analyzeTrinetraContent.mockResolvedValue({
      ...safeResult,
      prediction: "SPAM",
      scanId: "scan-spam-1",
    })

    const sent = await sendMessage(input())

    expect(sent.trinetraPrediction).toBe("SPAM")
    expect(sent.isFlagged).toBe(true)
    expect(sent.trinetraLocked).toBe(true)
    expect(sent.trinetraScanId).toBe("scan-spam-1")
  })

  it("persists and broadcasts the receiver's explicit open decision", async () => {
    mocks.db.update.mockImplementationOnce(() => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [{
            id: "message-1",
            conversationId: "conversation-1",
            senderId: "secure-user-1",
            receiverId: "secure-user-2",
            content: "Suspicious content",
            messageType: "text",
            createdAt: new Date(),
            trinetraPrediction: "SCAM",
            trinetraOpenedAt: values.trinetraOpenedAt,
            trinetraDetectedUrls: "[]",
            trinetraReasons: "[]",
            trinetraTips: "[]",
          }],
        }),
      }),
    }))

    const opened = await openProtectedMessage("conversation-1", "message-1", "secure-user-2")

    expect(opened.trinetraLocked).toBe(false)
    expect(opened.trinetraOpenedAt).toBeTypeOf("string")
    expect(mocks.broadcast).toHaveBeenCalledWith(
      ["conversation-conversation-1", "user-secure-user-2", "user-secure-user-1"],
      expect.objectContaining({
        type: "message-protection-updated",
        message: expect.objectContaining({ trinetraLocked: false }),
      }),
    )
  })

  it("rejects a protected-message open request from anyone except its receiver", async () => {
    mocks.db.update.mockImplementationOnce(() => ({
      set: () => ({
        where: () => ({ returning: async () => [] }),
      }),
    }))

    await expect(openProtectedMessage("conversation-1", "message-1", "secure-user-1"))
      .rejects.toThrow("Protected message not found")
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it("derives locked state from stored verdict and open timestamp after refresh", async () => {
    const rows = [
      {
        id: "message-opened",
        conversationId: "conversation-1",
        senderId: "secure-user-1",
        receiverId: "secure-user-2",
        content: "Previously opened",
        trinetraPrediction: "SUSPICIOUS",
        trinetraOpenedAt: new Date("2026-01-01T00:01:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:30.000Z"),
      },
      {
        id: "message-locked",
        conversationId: "conversation-1",
        senderId: "secure-user-1",
        receiverId: "secure-user-2",
        content: "Still hidden",
        trinetraPrediction: "SCAM",
        trinetraOpenedAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]
    mocks.db.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => rows }),
        }),
      }),
    }))

    const messages = await getMessages("conversation-1")

    expect(messages.map(({ id, trinetraLocked }) => ({ id, trinetraLocked }))).toEqual([
      { id: "message-locked", trinetraLocked: true },
      { id: "message-opened", trinetraLocked: false },
    ])
  })

  it("requests link diagnostics when protection is on but the account is not linked", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: false, pending: false })

    const sent = await sendMessage(input())

    expect(mocks.getTrinetraProtectionStatus).toHaveBeenCalledWith("secure-user-1", true)
    expect(mocks.analyzeTrinetraContent).not.toHaveBeenCalled()
    expect(sent.trinetraUnavailable).toBe(true)
  })

  it("Trinetra errors do not block message persistence or delivery", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: true, pending: false })
    mocks.analyzeTrinetraContent.mockRejectedValue(new Error("provider unavailable"))

    const sent = await sendMessage(input())

    expect(sent.content).toBe("Hello there")
    expect(sent.trinetraPrediction).toBeNull()
    expect(sent.trinetraUnavailable).toBe(true)
    expect(mocks.broadcast).toHaveBeenCalledOnce()
  })

  it("analyzes images and voice through Trinetra before delivery", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: true, pending: false })
    mocks.analyzeTrinetraMedia
      .mockResolvedValueOnce({ result: { ...safeResult, detectionType: "image" }, transcription: null })
      .mockResolvedValueOnce({
        result: { ...safeResult, detectionType: "voice", prediction: "SCAM" },
        transcription: "Send your account details immediately",
      })

    const image = await sendMessage(input({
      messageType: "image",
      content: "A caption",
      mediaUrl: "/api/files/0123456789abcdef0123456789abcdef.png",
    }))
    const voice = await sendMessage(input({
      messageType: "voice",
      content: "",
      mediaUrl: "/api/files/0123456789abcdef0123456789abcdef.webm",
    }))

    expect(mocks.analyzeTrinetraMedia.mock.calls).toEqual([
      ["secure-user-1", "image", "/api/files/0123456789abcdef0123456789abcdef.png", "en"],
      ["secure-user-1", "voice", "/api/files/0123456789abcdef0123456789abcdef.webm", "en"],
    ])
    expect(image.trinetraPrediction).toBe("SAFE")
    expect(image.trinetraUnavailable).toBe(false)
    expect(voice.trinetraPrediction).toBe("SCAM")
    expect(voice.trinetraLocked).toBe(true)
    expect(voice.trinetraTranscription).toBe("Send your account details immediately")
    expect(mocks.broadcast).toHaveBeenCalledTimes(2)
  })

  it("supports protected image and safe voice messages in both chat directions", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: true, pending: false })
    mocks.analyzeTrinetraMedia
      .mockResolvedValueOnce({
        result: { ...safeResult, detectionType: "image", prediction: "SCAM" },
        transcription: null,
      })
      .mockResolvedValueOnce({
        result: { ...safeResult, detectionType: "voice", prediction: "SAFE" },
        transcription: "Meet me at five.",
      })

    const spamImage = await sendMessage(input({
      messageType: "image",
      content: "Review this photo",
      mediaUrl: "/api/files/0123456789abcdef0123456789abcdef.png",
    }))
    const safeVoice = await sendMessage(input({
      senderId: "secure-user-2",
      receiverId: "secure-user-1",
      messageType: "voice",
      content: "",
      mediaUrl: "/api/files/0123456789abcdef0123456789abcdef.webm",
    }))

    expect(spamImage.trinetraLocked).toBe(true)
    expect(spamImage.trinetraUnavailable).toBe(false)
    expect(safeVoice.trinetraPrediction).toBe("SAFE")
    expect(safeVoice.trinetraLocked).toBe(false)
    expect(safeVoice.trinetraUnavailable).toBe(false)
    expect(mocks.broadcast.mock.calls.map((call) => call[1].message.receiverId)).toEqual([
      "secure-user-2",
      "secure-user-1",
    ])
  })

  it("does not mark a valid media verdict unavailable when caption analysis fails", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: true, pending: false })
    mocks.analyzeTrinetraMedia.mockResolvedValueOnce({
      result: { ...safeResult, detectionType: "image" },
      transcription: null,
    })
    mocks.analyzeTrinetraContent.mockRejectedValueOnce(new Error("caption scan unavailable"))

    const sent = await sendMessage(input({
      messageType: "image",
      content: "Safe caption",
      mediaUrl: "/api/files/0123456789abcdef0123456789abcdef.png",
    }))

    expect(sent.trinetraPrediction).toBe("SAFE")
    expect(sent.trinetraUnavailable).toBe(false)
  })
})