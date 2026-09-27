import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const db = {
    insert: vi.fn(),
    update: vi.fn(),
  }
  const getTrinetraProtectionStatus = vi.fn()
  const analyzeTrinetraContent = vi.fn()
  const broadcast = vi.fn()
  return { db, getTrinetraProtectionStatus, analyzeTrinetraContent, broadcast }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/db/schema", () => ({
  message: { id: "message.id" },
  conversation: { id: "conversation.id" },
}))
vi.mock("@/lib/realtime", () => ({
  broadcast: mocks.broadcast,
  conversationChannel: (id: string) => `conversation-${id}`,
  userChannel: (id: string) => `user-${id}`,
}))
vi.mock("@/lib/services/trinetra-integration.service", () => ({
  analyzeTrinetraContent: mocks.analyzeTrinetraContent,
  getTrinetraProtectionStatus: mocks.getTrinetraProtectionStatus,
  TRINETRA_MAX_CONTENT_LENGTH: 4000,
}))
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  desc: (column: unknown) => column,
  eq: (column: unknown, value: unknown) => ({ column, value }),
}))

import { sendMessage } from "@/lib/services/message.service"
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

  it("Trinetra errors do not block message persistence or delivery", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: true, pending: false })
    mocks.analyzeTrinetraContent.mockRejectedValue(new Error("provider unavailable"))

    const sent = await sendMessage(input())

    expect(sent.content).toBe("Hello there")
    expect(sent.trinetraPrediction).toBeNull()
    expect(sent.trinetraUnavailable).toBe(true)
    expect(mocks.broadcast).toHaveBeenCalledOnce()
  })

  it("does not send image or voice payloads to unsupported detection types", async () => {
    mocks.getTrinetraProtectionStatus.mockResolvedValue({ enabled: true, linked: true, pending: false })

    await sendMessage(input({ messageType: "image", mediaUrl: "/api/files/0123456789abcdef0123456789abcdef.png" }))
    await sendMessage(input({ messageType: "voice", mediaUrl: "/api/files/0123456789abcdef0123456789abcdef.webm" }))

    expect(mocks.analyzeTrinetraContent).not.toHaveBeenCalled()
    expect(mocks.broadcast).toHaveBeenCalledTimes(2)
  })
})