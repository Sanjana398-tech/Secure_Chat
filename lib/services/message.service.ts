/**
 * Message Service — the central seam for all message operations.
 *
 * ARCHITECTURE:
 * All messages flow through this service in order:
 *
 *   sendMessage(input)
 *     └─ processMessage(input)   ← Trinetra AI analysis happens here
 *         └─ saveMessage(processed)
 *             └─ deliverMessage(saved)
 *
 * The Trinetra AI models analyze every outgoing message for scam patterns,
 * routed by message type:
 *
 *   text    -> DistilBERT text scan
 *   image   -> OCR + payment-screenshot fraud analysis (or text scan)
 *   voice   -> Whisper transcription + DistilBERT
 *   payment -> UPI Random Forest fraud model
 *
 * Analysis is performed server-side; the browser never communicates
 * directly with Trinetra AI.
 *
 * If Trinetra AI is unreachable or times out, the message is still
 * delivered normally (without analysis badges) — availability over blocking.
 */

import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { message, conversation } from "@/lib/db/schema"
import { broadcast, conversationChannel, userChannel } from "@/lib/realtime"
import {
  analyzeTrinetraContent,
  getTrinetraProtectionStatus,
  TRINETRA_MAX_CONTENT_LENGTH,
} from "@/lib/services/trinetra-integration.service"
import type { MessageInput, ProcessedMessage, Message } from "@/types"
import { nanoid } from "@/lib/utils"

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
  if (typeof value !== "string" || !value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

function serializeMessage(saved: Message): Message {
  return {
    ...saved,
    createdAt:
      saved.createdAt instanceof Date ? saved.createdAt.toISOString() : saved.createdAt,
    readAt:
      saved.readAt instanceof Date ? saved.readAt.toISOString() : saved.readAt,
    analyzedAt:
      saved.analyzedAt instanceof Date ? saved.analyzedAt.toISOString() : saved.analyzedAt,
    trinetraDetectedUrls: parseJsonArray(saved.trinetraDetectedUrls),
    trinetraReasons: parseJsonArray(saved.trinetraReasons),
    trinetraTips: parseJsonArray(saved.trinetraTips),
  }
}

// ─── Step 1: Process (Trinetra AI Analysis) ──────────────────────────────────

/**
 * Run the message through Trinetra AI's models, routed by message type.
 *
 * - If Trinetra returns a result, attach it to the processed message.
 * - If Trinetra is unavailable, deliver the message without analysis.
 * - Messages are NEVER blocked — only flagged with a visible badge.
 */
async function processMessage(input: MessageInput): Promise<ProcessedMessage> {
  let result: ProcessedMessage["trinetraResult"] = null
  let unavailable = false
  let detectionType: "message" | "url" | "upi" | null = null
  let detectionContent = ""

  switch (input.messageType) {
    case "url":
      detectionType = "url"
      detectionContent = input.content.trim()
      break
    case "payment": {
      detectionType = "upi"
      const payment = new URLSearchParams()
      if (input.paymentUpiId) payment.set("pa", input.paymentUpiId)
      if (input.paymentAmount != null) payment.set("am", String(input.paymentAmount))
      if (input.paymentNote) payment.set("tn", input.paymentNote)
      detectionContent = `upi://pay?${payment.toString()}`
      break
    }
    case "image":
    case "voice":
      break
    default:
      detectionType = "message"
      detectionContent = input.content.trim()
  }

  try {
    if (detectionType && detectionContent && detectionContent.length <= TRINETRA_MAX_CONTENT_LENGTH) {
      const protection = await getTrinetraProtectionStatus(input.senderId, true)
      if (protection.enabled) {
        if (!protection.linked) {
          unavailable = true
        } else {
          result = await analyzeTrinetraContent(
            input.senderId,
            detectionType,
            detectionContent,
            input.language,
          )
          unavailable = result === null
        }
      }
    }
  } catch (err) {
    unavailable = true
    console.warn("[message.service] Trinetra analysis unavailable:", (err as Error).message)
  }

  return {
    ...input,
    allowed: true,
    trinetraResult: result,
    trinetraUnavailable: unavailable,
  }
}

// ─── Step 2: Persist ──────────────────────────────────────────────────────────

async function saveMessage(processed: ProcessedMessage): Promise<Message> {
  if (!processed.allowed) {
    throw new Error("Message was blocked by the processing layer")
  }

  const id = nanoid()
  const now = new Date()
  const trinetra = processed.trinetraResult

  const [saved] = await db
    .insert(message)
    .values({
      id,
      conversationId: processed.conversationId,
      senderId: processed.senderId,
      receiverId: processed.receiverId,
      content: processed.content,
      messageType: processed.messageType ?? "text",
      mediaUrl: processed.mediaUrl ?? null,
      mediaDuration: processed.mediaDuration ?? null,
      paymentAmount: processed.paymentAmount ?? null,
      paymentUpiId: processed.paymentUpiId ?? null,
      paymentNote: processed.paymentNote ?? null,
      isRead: false,
      createdAt: now,
      // Trinetra AI analysis fields
      trinetraPrediction: trinetra?.prediction ?? null,
      trinetraConfidence: trinetra?.confidence ?? null,
      safeProbability: trinetra?.safeProbability ?? null,
      scamProbability: trinetra?.scamProbability ?? null,
      isFlagged: trinetra?.prediction === "SCAM" ? true : false,
      analyzedAt: trinetra ? now : null,
      trinetraTranscription: processed.trinetraTranscription ?? null,
      trinetraOcrText: trinetra?.ocrText ?? null,
      trinetraDetectedUrls: JSON.stringify(trinetra?.detectedUrls ?? []),
      trinetraQrContent: trinetra?.qrContent ?? null,
      trinetraReasons: JSON.stringify(trinetra?.reasons ?? []),
      trinetraLanguage: trinetra?.language ?? processed.language ?? null,
      trinetraSpeechText: trinetra?.speechText ?? null,
      trinetraDetectionType: trinetra?.detectionType ?? null,
      trinetraRisk: trinetra?.risk ?? null,
      trinetraExplanation: trinetra?.alert ?? trinetra?.explanation ?? null,
      trinetraTips: JSON.stringify(trinetra?.tips ?? []),
      trinetraUnavailable: processed.trinetraUnavailable ?? false,
    })
    .returning()

  // Update the conversation's updatedAt so sidebar sorts correctly
  await db
    .update(conversation)
    .set({ updatedAt: now })
    .where(eq(conversation.id, processed.conversationId))

  return saved as unknown as Message
}

// ─── Step 3: Deliver ─────────────────────────────────────────────────────────

async function deliverMessage(saved: Message): Promise<void> {
  const payload = {
    type: "new-message" as const,
    conversationId: saved.conversationId,
    message: serializeMessage(saved),
  }

  await broadcast(
    [
      conversationChannel(saved.conversationId),
      userChannel(saved.receiverId),
      userChannel(saved.senderId),
    ],
    payload,
  )
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * The single entry point for sending a message.
 * Called by the /api/messages route handler.
 *
 * Flow: processMessage (Trinetra AI) → saveMessage (DB) → deliverMessage (Pusher/polling)
 */
export async function sendMessage(input: MessageInput): Promise<Message> {
  const processed = await processMessage(input)
  const saved = await saveMessage(processed)
  await deliverMessage(saved)
  return serializeMessage(saved)
}

/**
 * Fetch messages for a conversation, ordered oldest-first.
 * The caller must have already verified they are a participant.
 */
export async function getMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const rows = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(desc(message.createdAt))
    .limit(limit)

  return rows.reverse().map((row) => serializeMessage(row as unknown as Message))
}

/**
 * Mark all unread messages in a conversation as read for a given user.
 * Broadcasts a read receipt so the sender's ticks update live.
 */
export async function markMessagesRead(conversationId: string, userId: string): Promise<string[]> {
  const updated = await db
    .update(message)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(message.conversationId, conversationId),
        eq(message.receiverId, userId),
        eq(message.isRead, false),
      ),
    )
    .returning({ id: message.id, senderId: message.senderId })

  if (updated.length === 0) return []

  const messageIds = updated.map((row) => row.id)
  const senderChannels = [...new Set(updated.map((row) => userChannel(row.senderId)))]

  await broadcast([conversationChannel(conversationId), ...senderChannels], {
    type: "message-read",
    conversationId,
    messageIds,
  })

  return messageIds
}
