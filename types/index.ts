/**
 * Shared TypeScript types for SecureChat.
 * These types mirror the database schema and are used across
 * API routes, service layer, and client components.
 */

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string
  username: string | null
  image: string | null
  isOnline: boolean
  lastSeen: Date | string | null
  createdAt: Date | string
}

/** Safe public version — never includes passwordHash or internal fields */
export type PublicUser = Pick<User, "id" | "name" | "username" | "email" | "image" | "isOnline" | "lastSeen">

// ─── Message ──────────────────────────────────────────────────────────────────

export type MessageType = "text" | "url" | "image" | "voice" | "payment"

export interface Message {
  id: string
  conversationId: string
  senderId: string
  receiverId: string
  content: string
  messageType: MessageType
  /** Attachment URL for image/voice messages (served via /api/files/…) */
  mediaUrl: string | null
  /** Voice note duration in seconds */
  mediaDuration: number | null
  // ─── Payment request fields ──────────────────────────────────────────────
  paymentAmount: number | null
  paymentUpiId: string | null
  paymentNote: string | null
  isRead: boolean
  readAt: Date | string | null
  createdAt: Date | string
  /** Populated via JOIN when fetching messages */
  sender?: PublicUser
  // ─── Trinetra AI Analysis Fields ─────────────────────────────────────────
  /** "SAFE" | "SUSPICIOUS" | "SCAM" | null (null = not yet analyzed) */
  trinetraPrediction: string | null
  /** Confidence percentage (0–100), e.g. 99.93 */
  trinetraConfidence: number | null
  /** Probability the message is safe (0–100) */
  safeProbability: number | null
  /** Probability the message is a scam (0–100) */
  scamProbability: number | null
  /** True when Trinetra AI flagged the message as SCAM */
  isFlagged: boolean | null
  /** Timestamp when Trinetra AI analyzed the message */
  analyzedAt: Date | string | null
  /** Whisper transcript for voice messages */
  trinetraTranscription: string | null
  /** OCR text extracted from screenshot images */
  trinetraOcrText: string | null
  /** URLs found in screenshot images */
  trinetraDetectedUrls: string[]
  /** QR payload found in screenshot images */
  trinetraQrContent: string | null
  /** Detection explanations returned by Trinetra */
  trinetraReasons: string[]
  /** Language requested for the Trinetra explanation, when available */
  trinetraLanguage: string | null
  /** Speech-ready explanation returned by Trinetra, when available */
  trinetraSpeechText: string | null
}

/** Status shown on outgoing messages */
export type MessageStatus = "sending" | "sent" | "read" | "failed"

// ─── Conversation ─────────────────────────────────────────────────────────────

export interface Conversation {
  id: string
  createdAt: Date | string
  updatedAt: Date | string
  /** The other participant (not the current user) */
  otherUser: PublicUser
  /** Most recent message in this conversation */
  lastMessage: Message | null
  /** Count of unread messages for the current user */
  unreadCount: number
}

// ─── Message Service Layer ────────────────────────────────────────────────────
// These types define the contract for the message processing seam.
// processMessage() accepts MessageInput and returns ProcessedMessage.
// The Trinetra AI analysis layer populates trinetraResult before persistence.

export interface MessageInput {
  conversationId: string
  senderId: string
  receiverId: string
  messageType?: MessageType
  content: string
  mediaUrl?: string
  mediaDuration?: number
  paymentAmount?: number
  paymentUpiId?: string
  paymentNote?: string
  language?: string
}

/**
 * Payload the chat UI submits to /api/messages.
 * Covers every message type the composer can send.
 */
export interface OutgoingMessagePayload {
  messageType: MessageType
  /** Text body, or optional caption for image messages (empty for voice/payment) */
  content: string
  mediaUrl?: string
  /** Voice note duration in seconds */
  mediaDuration?: number
  paymentAmount?: number
  paymentUpiId?: string
  paymentNote?: string
  language?: string
}

/** Result returned by the Trinetra AI analysis endpoints */
export interface TrinetraAnalysisResult {
  prediction: "SAFE" | "SUSPICIOUS" | "SCAM"
  confidence: number
  safeProbability: number | null
  scamProbability: number | null
  ocrText: string | null
  detectedUrls: string[]
  qrContent: string | null
  reasons: string[]
  language: string | null
  speechText: string | null
}

export interface ProcessedMessage extends MessageInput {
  /** Always true — messages are never fully blocked, only flagged. */
  allowed: boolean
  /** Populated by the Trinetra AI analysis layer; null if Trinetra is unavailable */
  trinetraResult?: TrinetraAnalysisResult | null
  /** Whisper transcript for voice messages */
  trinetraTranscription?: string | null
}

// ─── API Response shapes ──────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T
  error?: never
}

export interface ApiError {
  error: string
  data?: never
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── Realtime event payloads ──────────────────────────────────────────────────

export interface NewMessageEvent {
  type: "new-message"
  conversationId: string
  message: Message
}

export interface MessageReadEvent {
  type: "message-read"
  conversationId: string
  messageIds: string[]
}

export interface TypingEvent {
  type: "typing" | "stop-typing"
  conversationId: string
  userId: string
  username: string
}

export interface PresenceEvent {
  type: "presence"
  userId: string
  isOnline: boolean
  lastSeen: string
}

export type RealtimePayload = NewMessageEvent | MessageReadEvent | TypingEvent | PresenceEvent
