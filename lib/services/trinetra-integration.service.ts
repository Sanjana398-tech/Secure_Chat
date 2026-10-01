import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto"
import { get as getBlob } from "@vercel/blob"
import { and, eq, gt } from "drizzle-orm"
import { db } from "@/lib/db"
import { trinetraIntegration } from "@/lib/db/schema"
import type { TrinetraAnalysisResult } from "@/types"

const DEFAULT_BASE_URL = "https://trinetra-ai-ua5e.onrender.com"
const STATE_TTL_MS = 10 * 60 * 1000
const MAX_TOKEN_TTL_SECONDS = 24 * 60 * 60
const MAX_CONTENT_LENGTH = 4000
const MAX_REASON_COUNT = 20
const MAX_TEXT_LENGTH = 1000

type DetectionType = TrinetraAnalysisResult["detectionType"]
type MediaDetectionType = Extract<DetectionType, "image" | "voice">

interface TrinetraCredentials {
  baseUrl: string
  apiKey: string
  token: string
  linkedAccountId: string | null
}

class TrinetraConfigurationError extends Error {}

function reportDiagnostic(message: string): void {
  console.warn(`[trinetra] ${message}`)
}

function configurationFailure(code: "TRINETRA_CONFIG_MISSING" | "TRINETRA_CONFIG_INVALID"): never {
  reportDiagnostic(code)
  throw new TrinetraConfigurationError(code)
}

interface TokenResponse {
  access_token?: unknown
  account_token?: unknown
  expires_in?: unknown
  expires_at?: unknown
  account_id?: unknown
  error?: unknown
}

interface DetectionResponse {
  success?: unknown
  result?: unknown
  data?: unknown
  detection?: unknown
  analysis?: unknown
  output?: unknown
  response?: unknown
  scan?: unknown
  scan_result?: unknown
  scanResult?: unknown
  scan_history?: unknown
  scanHistory?: unknown
  detection_result?: unknown
  detectionResult?: unknown
  verdict?: unknown
  prediction?: unknown
  label?: unknown
  classification?: unknown
  is_spam?: unknown
  isSpam?: unknown
  is_scam?: unknown
  isScam?: unknown
  confidence?: unknown
  risk?: unknown
  risk_score?: unknown
  explanation?: unknown
  reasons?: unknown
  reason?: unknown
  red_flags?: unknown
  indicators?: unknown
  signals?: unknown
  tips?: unknown
  alert?: unknown
  safe_probability?: unknown
  scam_probability?: unknown
  type?: unknown
  detection_type?: unknown
  transcription?: unknown
  ocr_text?: unknown
  extracted_text?: unknown
  text?: unknown
  detected_urls?: unknown
  urls?: unknown
  qr_content?: unknown
  qr_data?: unknown
  decoded_content?: unknown
  content?: unknown
  language?: unknown
  language_code?: unknown
  speech_text?: unknown
  speechText?: unknown
  scan_id?: unknown
  scanId?: unknown
  error?: unknown
}

interface UploadedMedia {
  buffer: Buffer
  filename: string
  contentType: string
}

const MEDIA_FILENAME_RE = /^[a-f0-9]{32}\.(png|jpe?g|webp|gif|webm|ogg|mp3|wav|m4a|mp4)$/i
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])
const AUDIO_EXTENSIONS = new Set(["webm", "ogg", "mp3", "wav", "m4a", "mp4"])
const MEDIA_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  webm: "audio/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
}

function getConfig() {
  const baseUrl = (process.env.TRINETRA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "")
  const apiKey = process.env.TRINETRA_SECURE_CHAT_API_KEY?.trim()
  const redirectUri = process.env.TRINETRA_REDIRECT_URI?.trim()

  const missingVariables = [
    !apiKey && "TRINETRA_SECURE_CHAT_API_KEY",
    !redirectUri && "TRINETRA_REDIRECT_URI",
  ].filter((name): name is string => Boolean(name))
  if (!apiKey || !redirectUri) {
    reportDiagnostic(`TRINETRA_CONFIG_MISSING variables=${missingVariables.join(",")}`)
    configurationFailure("TRINETRA_CONFIG_MISSING")
  }

  let base: URL
  let callback: URL
  try {
    base = new URL(baseUrl)
    callback = new URL(redirectUri)
  } catch {
    configurationFailure("TRINETRA_CONFIG_INVALID")
  }
  if (base.protocol !== "https:" && process.env.NODE_ENV === "production") {
    configurationFailure("TRINETRA_CONFIG_INVALID")
  }

  if (callback.protocol !== "https:" && process.env.NODE_ENV === "production") {
    configurationFailure("TRINETRA_CONFIG_INVALID")
  }

  return { baseUrl, apiKey, redirectUri }
}

function getEncryptionKey(): Buffer {
  const encoded = process.env.TRINETRA_TOKEN_ENCRYPTION_KEY?.trim()
  if (!encoded) configurationFailure("TRINETRA_CONFIG_MISSING")

  let key: Buffer
  try {
    key = /^[a-f0-9]{64}$/i.test(encoded)
      ? Buffer.from(encoded, "hex")
      : Buffer.from(encoded, "base64")
  } catch {
    configurationFailure("TRINETRA_CONFIG_INVALID")
  }
  if (key.length !== 32) {
    configurationFailure("TRINETRA_CONFIG_INVALID")
  }
  return key
}

function encryptToken(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".")
}

function decryptToken(encrypted: string): string {
  const [ivText, tagText, ciphertextText, extra] = encrypted.split(".")
  if (!ivText || !tagText || !ciphertextText || extra) throw new Error("Stored Trinetra token is invalid")

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivText, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(tagText, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex")
}

function constantTimeHexEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex")
  const rightBuffer = Buffer.from(right, "hex")
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function isUsableLink(row: typeof trinetraIntegration.$inferSelect | undefined): boolean {
  return Boolean(
    row?.enabled &&
      row.encryptedAccessToken &&
      row.accessTokenExpiresAt &&
      row.accessTokenExpiresAt.getTime() > Date.now(),
  )
}

export async function getTrinetraProtectionStatus(userId: string, diagnoseLinkFailure = false) {
  const [row] = await db
    .select()
    .from(trinetraIntegration)
    .where(eq(trinetraIntegration.userId, userId))
    .limit(1)

  if (diagnoseLinkFailure && row?.enabled && !isUsableLink(row)) {
    if (!row.encryptedAccessToken) {
      reportDiagnostic("TRINETRA_TOKEN_MISSING")
    } else {
      reportDiagnostic("TRINETRA_TOKEN_EXPIRED")
    }
  }

  return {
    enabled: row?.enabled ?? false,
    linked: isUsableLink(row),
    pending: Boolean(row?.enabled && row.pendingStateExpiresAt && row.pendingStateExpiresAt > new Date()),
  }
}

export async function beginTrinetraAuthorization(userId: string) {
  const { baseUrl, redirectUri } = getConfig()
  const [existing] = await db
    .select()
    .from(trinetraIntegration)
    .where(eq(trinetraIntegration.userId, userId))
    .limit(1)

  if (isUsableLink(existing)) return { linked: true as const, authorizationUrl: null }

  const state = randomBytes(32).toString("base64url")
  const pendingStateExpiresAt = new Date(Date.now() + STATE_TTL_MS)
  await db
    .insert(trinetraIntegration)
    .values({
      userId,
      enabled: true,
      encryptedAccessToken: null,
      accessTokenExpiresAt: null,
      linkedAccountId: null,
      pendingStateHash: hashState(state),
      pendingStateExpiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: trinetraIntegration.userId,
      set: {
        enabled: true,
        encryptedAccessToken: null,
        accessTokenExpiresAt: null,
        linkedAccountId: null,
        pendingStateHash: hashState(state),
        pendingStateExpiresAt,
        updatedAt: new Date(),
      },
    })

  const authorizationUrl = new URL(`${baseUrl}/integrations/secure-chat/authorize`)
  authorizationUrl.searchParams.set("response_type", "code")
  authorizationUrl.searchParams.set("redirect_uri", redirectUri)
  authorizationUrl.searchParams.set("state", state)
  return { linked: false as const, authorizationUrl: authorizationUrl.toString() }
}

export async function disableTrinetraProtection(userId: string): Promise<void> {
  await db
    .insert(trinetraIntegration)
    .values({ userId, enabled: false, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: trinetraIntegration.userId,
      set: {
        enabled: false,
        encryptedAccessToken: null,
        accessTokenExpiresAt: null,
        linkedAccountId: null,
        pendingStateHash: null,
        pendingStateExpiresAt: null,
        updatedAt: new Date(),
      },
    })
}

export async function cancelTrinetraAuthorization(userId: string, state: string): Promise<void> {
  if (state.length < 32 || state.length > 256) throw new Error("Invalid authorization state")
  const stateHash = hashState(state)
  const now = new Date()
  const [cancelled] = await db
    .update(trinetraIntegration)
    .set({ pendingStateHash: null, pendingStateExpiresAt: null, updatedAt: now })
    .where(and(
      eq(trinetraIntegration.userId, userId),
      eq(trinetraIntegration.enabled, true),
      eq(trinetraIntegration.pendingStateHash, stateHash),
      gt(trinetraIntegration.pendingStateExpiresAt, now),
    ))
    .returning({ userId: trinetraIntegration.userId })
  if (!cancelled) throw new Error("Authorization state mismatch")
}

async function requestJson(
  url: string,
  init: RequestInit,
  requestKind: "TOKEN" | "DETECT",
  detectionType?: "TEXT" | "URL" | "UPI" | "IMAGE" | "VOICE" | "QR",
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  const startedAt = Date.now()
  const endpoint = new URL(url)
  const typeTag = detectionType ? ` detection_type=${detectionType}` : ""
  reportDiagnostic(
    `${requestKind}_REQUEST_STARTED endpoint=${endpoint.origin}${endpoint.pathname}${typeTag}`,
  )
  try {
    const response = await fetch(url, { ...init, cache: "no-store" })
    const text = await response.text()
    const elapsedMs = Date.now() - startedAt
    if (!response.ok) {
      reportDiagnostic(`TRINETRA_HTTP_ERROR status=${response.status}`)
      reportDiagnostic(`${requestKind}_REQUEST_HTTP_ERROR${typeTag} status=${response.status} elapsed_ms=${elapsedMs}`)
    } else {
      reportDiagnostic(`${requestKind}_REQUEST_SUCCESS${typeTag} status=${response.status} elapsed_ms=${elapsedMs}`)
    }
    if (text.length > 64 * 1024) {
      reportDiagnostic(`${requestKind}_REQUEST_RESPONSE_TOO_LARGE${typeTag} status=${response.status} elapsed_ms=${elapsedMs}`)
      return { ok: response.ok, status: response.status, body: null }
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      reportDiagnostic(`${requestKind}_REQUEST_INVALID_JSON${typeTag} status=${response.status} elapsed_ms=${elapsedMs}`)
      return { ok: response.ok, status: response.status, body: null }
    }
    return {
      ok: response.ok,
      status: response.status,
      body: body && typeof body === "object" && !Array.isArray(body)
        ? body as Record<string, unknown>
        : null,
    }
  } catch (error) {
    reportDiagnostic(`${requestKind}_REQUEST_NETWORK_ERROR${typeTag} elapsed_ms=${Date.now() - startedAt}`)
    reportDiagnostic("TRINETRA_NETWORK_ERROR")
    throw new Error("TRINETRA_NETWORK_ERROR")
  }
}

export async function completeTrinetraAuthorization(
  userId: string,
  state: string,
  code: string,
): Promise<void> {
  if (state.length < 32 || state.length > 256) throw new Error("Invalid authorization state")
  if (!code.trim() || code.length > 4096) throw new Error("Invalid authorization code")

  const stateHash = hashState(state)
  const [pending] = await db
    .select({ pendingStateHash: trinetraIntegration.pendingStateHash })
    .from(trinetraIntegration)
    .where(eq(trinetraIntegration.userId, userId))
    .limit(1)
  if (!pending?.pendingStateHash || !constantTimeHexEqual(pending.pendingStateHash, stateHash)) {
    throw new Error("Authorization state mismatch")
  }

  const now = new Date()
  const [consumed] = await db
    .update(trinetraIntegration)
    .set({ pendingStateHash: null, pendingStateExpiresAt: null, updatedAt: now })
    .where(and(
      eq(trinetraIntegration.userId, userId),
      eq(trinetraIntegration.enabled, true),
      eq(trinetraIntegration.pendingStateHash, stateHash),
      gt(trinetraIntegration.pendingStateExpiresAt, now),
    ))
    .returning({ userId: trinetraIntegration.userId })
  if (!consumed) throw new Error("Authorization state expired or already used")

  const { baseUrl, apiKey, redirectUri } = getConfig()
  const response = await requestJson(
    `${baseUrl}/api/secure-chat/v1/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Secure-Chat-Key": apiKey,
      },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    },
    "TOKEN",
  )
  const tokenResponse = response.body as TokenResponse | null
  const token = tokenResponse?.access_token ?? tokenResponse?.account_token
  const expiresIn = Number(tokenResponse?.expires_in)
  if (!response.ok) {
    throw new Error("Trinetra authorization exchange failed")
  }
  if (!tokenResponse || typeof token !== "string" || token.length < 16 || token.length > 8192) {
    reportDiagnostic("TRINETRA_INVALID_RESPONSE")
    throw new Error("Trinetra authorization exchange failed")
  }
  const expiresAt = typeof tokenResponse.expires_at === "string"
    ? new Date(tokenResponse.expires_at)
    : null
  const tokenExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000)
    : expiresAt
  const tokenLifetime = tokenExpiresAt ? tokenExpiresAt.getTime() - Date.now() : 0
  if (
    !tokenExpiresAt ||
    !Number.isFinite(tokenLifetime) ||
    tokenLifetime <= 0 ||
    tokenLifetime > MAX_TOKEN_TTL_SECONDS * 1000
  ) {
    reportDiagnostic("TRINETRA_INVALID_RESPONSE")
    throw new Error("Trinetra returned an invalid token expiry")
  }

  const encryptedAccessToken = encryptToken(token)
  const accountId = typeof tokenResponse.account_id === "string"
    ? tokenResponse.account_id.slice(0, 255)
    : null

  const [linked] = await db
    .update(trinetraIntegration)
    .set({
      encryptedAccessToken,
      accessTokenExpiresAt: tokenExpiresAt,
      linkedAccountId: accountId,
      updatedAt: new Date(),
    })
    .where(and(
      eq(trinetraIntegration.userId, userId),
      eq(trinetraIntegration.enabled, true),
    ))
    .returning({ userId: trinetraIntegration.userId })
  if (!linked) {
    reportDiagnostic("TRINETRA_LINK_UPDATE_FAILED")
    throw new Error("Trinetra authorization link update failed")
  }
}

function textArray(value: unknown): string[] | null {
  if (value == null) return []
  const items = Array.isArray(value) ? value.flat(Infinity) : [value]

  const texts: string[] = []
  for (const item of items) {
    if (texts.length >= MAX_REASON_COUNT) break
    if (typeof item === "string") {
      if (item.trim()) texts.push(item.trim().slice(0, MAX_TEXT_LENGTH))
      continue
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>
      const text = record.description ?? record.reason ?? record.label ?? record.message
      if (typeof text === "string") {
        if (text.trim()) texts.push(text.trim().slice(0, MAX_TEXT_LENGTH))
      }
    }
  }
  return texts
}

function findDetectionResult(
  value: unknown,
  depth = 0,
): DetectionResponse | null {
  if (!value || typeof value !== "object") return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findDetectionResult(item, depth + 1)
      if (result) return result
    }
    return null
  }
  if (depth >= 5) return null

  const record = value as DetectionResponse
  const verdict = record.verdict ?? record.prediction ?? record.label ?? record.classification ??
    (typeof record.detection === "string" ? record.detection : undefined)
  if (typeof verdict === "string") return record
  const spamFlag = record.is_spam ?? record.isSpam ?? record.is_scam ?? record.isScam
  if (typeof spamFlag === "boolean") {
    return { ...record, verdict: spamFlag ? "SPAM" : "SAFE" }
  }

  const envelopeKeys = [
    "result",
    "data",
    "detection",
    "analysis",
    "output",
    "response",
    "scan",
    "scan_result",
    "scanResult",
    "scan_history",
    "scanHistory",
    "detection_result",
    "detectionResult",
  ] as const

  for (const key of envelopeKeys) {
    const nested = record[key]
    if (typeof nested === "string" && key === "result") {
      return { ...record, verdict: nested }
    }
    const result = findDetectionResult(nested, depth + 1)
    if (result) return { ...record, ...result }
  }

  for (const [key, nested] of Object.entries(record)) {
    if (envelopeKeys.includes(key as (typeof envelopeKeys)[number])) continue
    const result = findDetectionResult(nested, depth + 1)
    if (result) return { ...record, ...result }
  }

  return null
}

export function normalizeTrinetraDetection(
  payload: DetectionResponse,
  requestedType: DetectionType,
): TrinetraAnalysisResult | null {
  const result = findDetectionResult(payload)
  if (!result) return null

  const verdictValue = result.verdict ?? result.prediction ?? result.label ?? result.classification ??
    (typeof result.detection === "string" ? result.detection : undefined)
  if (typeof verdictValue !== "string") return null
  const verdict = verdictValue.trim().toUpperCase().replace(/[\s-]+/g, "_")
  const prediction = ["FAKE", "FRAUD", "FRAUDULENT", "UNSAFE", "MALICIOUS", "PHISHING"].includes(verdict)
    ? "SCAM"
    : verdict === "SPAM"
      ? "SPAM"
    : ["NOT_SPAM", "NON_SPAM", "HAM", "BENIGN", "CLEAN", "LEGITIMATE"].includes(verdict)
      ? "SAFE"
      : verdict === "WARNING"
      ? "SUSPICIOUS"
      : verdict
  if (prediction !== "SAFE" && prediction !== "SPAM" && prediction !== "SUSPICIOUS" && prediction !== "SCAM") return null

  const rawConfidence = result.confidence == null ? Number.NaN : Number(result.confidence)
  const confidence = Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 100
    ? rawConfidence
    : 0

  const rawRisk = result.risk_score ?? result.risk ?? result.scam_probability
  const parsedRisk = rawRisk == null ? Number.NaN : Number(rawRisk)
  const risk = Number.isFinite(parsedRisk) && parsedRisk >= 0 && parsedRisk <= 100
    ? parsedRisk
    : null

  const reasons = textArray([
    result.reasons,
    result.reason,
    result.red_flags,
    result.indicators,
    result.signals,
  ].filter((value) => value != null))
  const tips = textArray(result.tips)
  if (!reasons || !tips) return null
  const alert = typeof result.alert === "string" && result.alert.trim()
    ? result.alert.trim().slice(0, MAX_TEXT_LENGTH)
    : null
  const explanation = typeof result.explanation === "string"
    ? result.explanation.slice(0, MAX_TEXT_LENGTH)
    : reasons.join(" ").slice(0, MAX_TEXT_LENGTH) || null
  const responseType = String(result.detection_type ?? result.type ?? "").toLowerCase()
  const detectedUrls = textArray(result.detected_urls ?? result.urls) ?? []
  const ocrText = [result.ocr_text, result.extracted_text, result.text]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null
  const qrContent = [result.qr_content, result.qr_data, result.decoded_content, result.content]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null
  const language = [result.language, result.language_code]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null
  const speechText = [result.speech_text, result.speechText]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null
  const rawScanId = [result.scan_id, result.scanId]
    .find((value) =>
      (typeof value === "string" && value.trim().length > 0) ||
      (typeof value === "number" && Number.isSafeInteger(value) && value >= 0),
    )
  const scanId = typeof rawScanId === "number"
    ? String(rawScanId)
    : typeof rawScanId === "string"
      ? rawScanId.trim() || null
      : null

  return {
    detectionType: responseType === "message" || responseType === "url" || responseType === "upi" ||
      responseType === "image" || responseType === "voice" || responseType === "qr"
      ? responseType as DetectionType
      : requestedType,
    prediction,
    confidence,
    risk,
    alert,
    safeProbability: normalizedProbability(result.safe_probability),
    scamProbability: normalizedProbability(result.scam_probability),
    explanation,
    reasons,
    tips,
    ocrText,
    detectedUrls,
    qrContent,
    language: typeof language === "string" ? language : null,
    speechText,
    scanId,
  }
}

function normalizedProbability(value: unknown): number | null {
  if (value == null) return null
  const probability = Number(value)
  return Number.isFinite(probability) && probability >= 0 && probability <= 100
    ? probability
    : null
}

async function getTrinetraCredentials(userId: string): Promise<TrinetraCredentials | null> {
  const [row] = await db
    .select()
    .from(trinetraIntegration)
    .where(eq(trinetraIntegration.userId, userId))
    .limit(1)

  if (!row) {
    reportDiagnostic("TRINETRA_LINK_MISSING")
    return null
  }
  if (!row.enabled) {
    reportDiagnostic("TRINETRA_LINK_DISABLED")
    return null
  }
  if (!row.encryptedAccessToken) {
    reportDiagnostic("TRINETRA_TOKEN_MISSING")
    return null
  }
  if (!row.accessTokenExpiresAt || row.accessTokenExpiresAt.getTime() <= Date.now()) {
    reportDiagnostic("TRINETRA_TOKEN_EXPIRED")
    return null
  }

  let token: string
  try {
    token = decryptToken(row.encryptedAccessToken)
  } catch (error) {
    if (!(error instanceof TrinetraConfigurationError)) {
      reportDiagnostic("TRINETRA_TOKEN_DECRYPT_FAILED")
    }
    return null
  }

  const { baseUrl, apiKey } = getConfig()
  return { baseUrl, apiKey, token, linkedAccountId: row.linkedAccountId }
}

async function readUploadedMedia(
  mediaUrl: string,
  type: MediaDetectionType,
): Promise<UploadedMedia | null> {
  const match = /^\/api\/files\/([^/]+)$/.exec(mediaUrl)
  const filename = match?.[1]
  if (!filename || !MEDIA_FILENAME_RE.test(filename)) {
    reportDiagnostic(`TRINETRA_MEDIA_INVALID_URL type=${type.toUpperCase()}`)
    return null
  }

  const extension = filename.split(".").pop()?.toLowerCase() ?? ""
  const allowedExtensions = type === "image" ? IMAGE_EXTENSIONS : AUDIO_EXTENSIONS
  if (!allowedExtensions.has(extension)) {
    reportDiagnostic(`TRINETRA_MEDIA_TYPE_MISMATCH type=${type.toUpperCase()}`)
    return null
  }

  try {
    const blob = await getBlob(filename, { access: "private" })
    if (!blob) {
      reportDiagnostic(`TRINETRA_MEDIA_NOT_FOUND type=${type.toUpperCase()}`)
      return null
    }
    const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer())
    if (buffer.length === 0) {
      reportDiagnostic(`TRINETRA_MEDIA_EMPTY type=${type.toUpperCase()}`)
      return null
    }
    return {
      buffer,
      filename,
      contentType: blob.blob.contentType || MEDIA_MIME_BY_EXT[extension] || "application/octet-stream",
    }
  } catch {
    reportDiagnostic(`TRINETRA_MEDIA_READ_FAILED type=${type.toUpperCase()}`)
    return null
  }
}

function moreRiskyResult(
  first: TrinetraAnalysisResult | null,
  second: TrinetraAnalysisResult | null,
): TrinetraAnalysisResult | null {
  if (!first) return second
  if (!second) return first
  const riskRank = { SAFE: 0, SUSPICIOUS: 1, SPAM: 2, SCAM: 3 }
  return riskRank[second.prediction] > riskRank[first.prediction] ? second : first
}

function findStringField(value: unknown, fields: readonly string[], depth = 0): string | null {
  if (!value || typeof value !== "object" || depth > 5) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, fields, depth + 1)
      if (found) return found
    }
    return null
  }

  const record = value as Record<string, unknown>
  for (const field of fields) {
    const candidate = record[field]
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
  }
  for (const nested of Object.values(record)) {
    const found = findStringField(nested, fields, depth + 1)
    if (found) return found
  }
  return null
}

export async function analyzeTrinetraContent(
  userId: string,
  type: DetectionType,
  content: string,
  language?: string,
): Promise<TrinetraAnalysisResult | null> {
  if (type !== "message" && type !== "url" && type !== "upi" && type !== "qr") return null
  if (!content.trim() || content.length > MAX_CONTENT_LENGTH) return null

  const credentials = await getTrinetraCredentials(userId)
  if (!credentials) return null
  const requestType = ({ message: "TEXT", url: "URL", upi: "UPI", qr: "QR" } as const)[type]
  let typePayload: Record<string, string | number> = {}
  if (type === "url") {
    typePayload = { url: content }
  } else if (type === "upi") {
    const payment = new URL(content)
    const amount = payment.searchParams.get("am")
    typePayload = {
      upi_id: payment.searchParams.get("pa") ?? "",
      ...(amount ? { amount: Number(amount) } : {}),
      ...(payment.searchParams.has("tn") ? { note: payment.searchParams.get("tn") ?? "" } : {}),
    }
  } else {
    typePayload = { text: content }
  }
  const response = await requestJson(
    `${credentials.baseUrl}/api/secure-chat/v1/detect`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Secure-Chat-Key": credentials.apiKey,
        Authorization: `Bearer ${credentials.token}`,
      },
      body: JSON.stringify({
        type: requestType,
        ...typePayload,
        ...(credentials.linkedAccountId ? { user_id: credentials.linkedAccountId } : {}),
        ...(language ? { language } : {}),
      }),
    },
    "DETECT",
    requestType,
  )
  if (!response.body) {
    reportDiagnostic("TRINETRA_INVALID_RESPONSE")
    return null
  }
  const result = normalizeTrinetraDetection(response.body as DetectionResponse, type)
  reportDiagnostic(
    `DETECT_RESPONSE type=${type === "message" ? "TEXT" : type.toUpperCase()} status=${response.status} classification=${result?.prediction ?? "UNPARSED"} scan_id_present=${Boolean(result?.scanId)} error_present=${Object.hasOwn(response.body, "error")}`,
  )
  if (!result) {
    reportDiagnostic("TRINETRA_INVALID_RESPONSE")
    reportDiagnostic(
      `TRINETRA_RESPONSE_SHAPE status=${response.status} keys=${Object.keys(response.body).sort().slice(0, 20).join(",") || "none"}`,
    )
  }
  return result
}

export async function analyzeTrinetraMedia(
  userId: string,
  type: MediaDetectionType,
  mediaUrl: string,
  language?: string,
): Promise<{ result: TrinetraAnalysisResult | null; transcription: string | null }> {
  const media = await readUploadedMedia(mediaUrl, type)
  if (!media) return { result: null, transcription: null }

  const credentials = await getTrinetraCredentials(userId)
  if (!credentials) return { result: null, transcription: null }

  const form = new FormData()
  const mediaField = type === "image" ? "image" : "audio"
  form.append(mediaField, new Blob([new Uint8Array(media.buffer)], { type: media.contentType }), media.filename)
  if (credentials.linkedAccountId) form.append("user_id", credentials.linkedAccountId)
  if (language) form.append("language", language)

  form.append("type", type === "image" ? "IMAGE" : "VOICE")
  const response = await requestJson(
    `${credentials.baseUrl}/api/secure-chat/v1/detect`,
    {
      method: "POST",
      headers: {
        "X-Secure-Chat-Key": credentials.apiKey,
        Authorization: `Bearer ${credentials.token}`,
      },
      body: form,
    },
    "DETECT",
    type === "image" ? "IMAGE" : "VOICE",
  )

  if (!response.body) {
    reportDiagnostic("TRINETRA_INVALID_MEDIA_RESPONSE")
    return { result: null, transcription: null }
  }

  const transcription = findStringField(response.body, ["transcription"])
  let result = normalizeTrinetraDetection(response.body as DetectionResponse, type)
  reportDiagnostic(
    `DETECT_RESPONSE type=${type.toUpperCase()} status=${response.status} classification=${result?.prediction ?? "UNPARSED"} scan_id_present=${Boolean(result?.scanId)} error_present=${Object.hasOwn(response.body, "error")}`,
  )

  const responseOcrText = type === "image"
    ? findStringField(response.body, ["ocr_text", "extracted_text", "text"])
    : null
  const responseDetectedUrls = type === "image"
    ? textArray(findDetectionResult(response.body)?.detected_urls ?? findDetectionResult(response.body)?.urls) ?? []
    : []
  const responseQrContent = type === "image"
    ? findStringField(response.body, ["qr_content", "qr_data", "decoded_content"])
    : null

  if (type === "image" && (result?.ocrText?.trim() || responseOcrText)) {
    const imageResult = result
    const ocrText = imageResult?.ocrText ?? responseOcrText
    let ocrResult: TrinetraAnalysisResult | null = null
    try {
      if (ocrText) ocrResult = await analyzeTrinetraContent(userId, "message", ocrText, language)
    } catch {
      reportDiagnostic("TRINETRA_OCR_TEXT_SCAN_FAILED")
    }
    const combinedResult = moreRiskyResult(result, ocrResult)
    result = combinedResult
      ? {
          ...(imageResult ?? combinedResult),
          ...combinedResult,
          detectionType: "image",
          ocrText,
          detectedUrls: imageResult?.detectedUrls.length ? imageResult.detectedUrls : responseDetectedUrls,
          qrContent: imageResult?.qrContent ?? responseQrContent,
        }
      : null
  }

  if (type === "image" && result?.qrContent) {
    const imageResult = result
    let qrResult: TrinetraAnalysisResult | null = null
    try {
      qrResult = await analyzeTrinetraContent(userId, "qr", result.qrContent, language)
    } catch {
      reportDiagnostic("TRINETRA_QR_SCAN_FAILED")
    }
    const combinedResult = moreRiskyResult(result, qrResult)
    if (combinedResult) {
      result = {
        ...imageResult,
        ...combinedResult,
        qrContent: imageResult.qrContent,
        ocrText: imageResult.ocrText,
        detectedUrls: imageResult.detectedUrls,
      }
    }
  }

  if (type === "voice" && transcription) {
    let transcriptResult: TrinetraAnalysisResult | null = null
    try {
      transcriptResult = await analyzeTrinetraContent(userId, "message", transcription, language)
    } catch {
      reportDiagnostic("TRINETRA_TRANSCRIPT_SCAN_FAILED")
    }
    const combinedResult = moreRiskyResult(result, transcriptResult)
    result = combinedResult ? { ...combinedResult, detectionType: "voice" } : null
  }

  return { result, transcription }
}

export const TRINETRA_MAX_CONTENT_LENGTH = MAX_CONTENT_LENGTH