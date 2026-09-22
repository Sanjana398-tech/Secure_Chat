import { z } from "zod"

export const MAX_MESSAGE_LENGTH = 2000

export const MESSAGE_TYPES = ["text", "url", "image", "voice", "payment"] as const
export type MessageTypeTuple = (typeof MESSAGE_TYPES)[number]

// Extensions the upload endpoint accepts (mirrors /api/upload whitelist)
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const
export const AUDIO_EXTENSIONS = ["webm", "ogg", "mp3", "wav", "m4a", "mp4"] as const

// Media URLs must point at our own /api/files endpoint with a generated
// 32-hex-char filename — this also blocks path traversal attempts.
const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS]
const mediaUrlSchema = z
  .string()
  .regex(
    new RegExp(`^/api/files/[a-f0-9]{32}\\.(${MEDIA_EXTENSIONS.join("|")})$`),
    "Invalid media URL",
  )

const UPI_ID_PATTERN = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,20}$/

export const sendMessageSchema = z
  .object({
    conversationId: z.string().min(1, "Conversation ID is required"),
    receiverId: z.string().min(1, "Receiver ID is required"),
    messageType: z.enum(MESSAGE_TYPES).default("text"),
    // For text: the message body. For image: optional caption. Otherwise empty.
    content: z
      .string()
      .max(MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`)
      .default(""),
    mediaUrl: mediaUrlSchema.optional(),
    // Voice note duration in seconds (max 2 minutes)
    mediaDuration: z.number().min(0).max(600).optional(),
    paymentAmount: z.number().positive().max(10_000_000).optional(),
    paymentUpiId: z
      .string()
      .regex(UPI_ID_PATTERN, "Invalid UPI ID format")
      .optional(),
    paymentNote: z.string().max(200, "Payment note cannot exceed 200 characters").optional(),
    language: z.enum(["en", "hi", "kn", "te", "ta", "ml"]).optional(),
  })
  .superRefine((data, ctx) => {
    // Text messages require non-empty content
    if (data.messageType === "text" && !data.content.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Message cannot be empty",
        path: ["content"],
      })
    }
    // URL messages require a valid URL in content
    if (data.messageType === "url") {
      try {
        const u = new URL(data.content.trim())
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error()
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "A valid http/https URL is required",
          path: ["content"],
        })
      }
    }
    // Image and voice messages require an uploaded attachment
    if ((data.messageType === "image" || data.messageType === "voice") && !data.mediaUrl) {
      ctx.addIssue({
        code: "custom",
        message: "mediaUrl is required for media messages",
        path: ["mediaUrl"],
      })
    }
    // Payment requests require an amount and a UPI ID to analyze
    if (data.messageType === "payment") {
      if (data.paymentAmount == null) {
        ctx.addIssue({
          code: "custom",
          message: "Payment amount is required",
          path: ["paymentAmount"],
        })
      }
      if (!data.paymentUpiId) {
        ctx.addIssue({
          code: "custom",
          message: "UPI ID is required for payment requests",
          path: ["paymentUpiId"],
        })
      }
    }
  })

export const createConversationSchema = z.object({
  otherUserId: z.string().min(1, "User ID is required"),
})

export const searchUsersSchema = z.object({
  q: z.string().min(1, "Search query is required").max(50, "Query too long"),
})

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name is too long")
    .optional(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
    .optional(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type CreateConversationInput = z.infer<typeof createConversationSchema>
export type SearchUsersInput = z.infer<typeof searchUsersSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
