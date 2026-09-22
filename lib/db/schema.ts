import { pgTable, text, timestamp, boolean, real, unique } from "drizzle-orm/pg-core"

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.
// SecureChat adds `username` as an additionalField (see lib/auth.ts), so it
// lives directly on the `user` table.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  // Presence fields — updated by the presence API route
  isOnline: boolean("isOnline").notNull().default(false),
  lastSeen: timestamp("lastSeen"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  issuer: text("issuer"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// --- Conversations ---------------------------------------------------------
// A conversation groups messages between two participants. It is reused
// between the same pair of users (looked up before creating a new one).

export const conversation = pgTable("conversation", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Join table linking users to conversations. Plain userId columns for scoping;
// no FK constraints per the Neon stack default (easier schema iteration).
// The (conversationId, userId) pair is unique to prevent duplicate members.
export const conversationParticipant = pgTable(
  "conversation_participant",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversationId").notNull(),
    userId: text("userId").notNull(),
    typingAt: timestamp("typingAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniquePair: unique().on(t.conversationId, t.userId),
  }),
)

// --- Messages --------------------------------------------------------------

export const message = pgTable("message", {
  id: text("id").primaryKey(),
  conversationId: text("conversationId").notNull(),
  senderId: text("senderId").notNull(),
  receiverId: text("receiverId").notNull(),
  content: text("content").notNull(),
  // ─── Message type ────────────────────────────────────────────────────────
  // "text" (default) | "image" | "voice" | "payment"
  messageType: text("messageType").notNull().default("text"),
  // Media attachment for image/voice messages (served via /api/files/<filename>)
  mediaUrl: text("mediaUrl"),
  // Voice note duration in seconds
  mediaDuration: real("mediaDuration"),
  // ─── Payment request fields ──────────────────────────────────────────────
  paymentAmount: real("paymentAmount"),
  paymentUpiId: text("paymentUpiId"),
  paymentNote: text("paymentNote"),
  isRead: boolean("isRead").notNull().default(false),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  // ─── Trinetra AI Analysis Fields ─────────────────────────────────────────
  // Populated server-side by the Trinetra AI models before delivery.
  // NULL values indicate the message has not been analyzed yet.
  trinetraPrediction: text("trinetraPrediction"),         // "SAFE" | "SUSPICIOUS" | "SCAM" | null
  trinetraConfidence: real("trinetraConfidence"),         // e.g. 99.93
  safeProbability: real("safeProbability"),               // e.g. 99.93
  scamProbability: real("scamProbability"),              // e.g. 0.07
  isFlagged: boolean("isFlagged").default(false),         // true if prediction = SCAM
  analyzedAt: timestamp("analyzedAt"),                    // when analysis was performed
  // Whisper transcript for voice messages (null for other types)
  trinetraTranscription: text("trinetraTranscription"),
  // Screenshot detection history. Arrays are stored as JSON text.
  trinetraOcrText: text("trinetraOcrText"),
  trinetraDetectedUrls: text("trinetraDetectedUrls"),
  trinetraQrContent: text("trinetraQrContent"),
  trinetraReasons: text("trinetraReasons"),
  trinetraLanguage: text("trinetraLanguage"),
  trinetraSpeechText: text("trinetraSpeechText"),
})
