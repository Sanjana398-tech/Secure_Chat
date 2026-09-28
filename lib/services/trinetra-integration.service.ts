import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto"
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
  verdict?: unknown
  prediction?: unknown
  label?: unknown
  classification?: unknown
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
  safe_probability?: unknown
  scam_probability?: unknown
  type?: unknown
  detection_type?: unknown
  error?: unknown
}

function getConfig() {
  const baseUrl = (process.env.TRINETRA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "")
  const apiKey = process.env.TRINETRA_SECURE_CHAT_API_KEY?.trim()
  const redirectUri = process.env.TRINETRA_REDIRECT_URI?.trim()

  if (!apiKey || !redirectUri) {
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
  requestTimeoutMs: number,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
    if (!response.ok) reportDiagnostic(`TRINETRA_HTTP_ERROR status=${response.status}`)
    const text = await response.text()
    if (text.length > 64 * 1024) return { ok: response.ok, status: response.status, body: null }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return { ok: response.ok, status: response.status, body: null }
    }
    return {
      ok: response.ok,
      status: response.status,
      body: body && typeof body === "object" && !Array.isArray(body)
        ? body as Record<string, unknown>
        : null,
    }
  } catch {
    reportDiagnostic("TRINETRA_NETWORK_ERROR")
    throw new Error("TRINETRA_NETWORK_ERROR")
  } finally {
    clearTimeout(timeout)
  }
}

function requestTimeout(): number {
  const configured = Number(process.env.TRINETRA_TIMEOUT_MS ?? 10_000)
  return Number.isFinite(configured) ? Math.max(1000, Math.min(configured, 30_000)) : 10_000
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
    requestTimeout(),
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

export function normalizeTrinetraDetection(
  payload: DetectionResponse,
  requestedType: DetectionType,
): TrinetraAnalysisResult | null {
  const resultValue = payload.result ?? payload.data ?? payload
  if (!resultValue || typeof resultValue !== "object" || Array.isArray(resultValue)) return null
  const result = resultValue as DetectionResponse
  if (payload.success === false || result.success === false) return null

  const verdictValue = result.verdict ?? result.prediction ?? result.label ?? result.classification
  if (typeof verdictValue !== "string") return null
  const verdict = verdictValue.trim().toUpperCase()
  const prediction = ["FAKE", "FRAUD", "FRAUDULENT", "UNSAFE", "MALICIOUS", "PHISHING"].includes(verdict)
    ? "SCAM"
    : verdict === "LEGITIMATE"
      ? "SAFE"
      : verdict
  if (prediction !== "SAFE" && prediction !== "SUSPICIOUS" && prediction !== "SCAM") return null

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
  const explanation = typeof result.explanation === "string"
    ? result.explanation.slice(0, MAX_TEXT_LENGTH)
    : reasons.join(" ").slice(0, MAX_TEXT_LENGTH) || null
  const responseType = result.detection_type ?? result.type

  return {
    detectionType: responseType === "message" || responseType === "url" || responseType === "upi"
      ? responseType
      : requestedType,
    prediction,
    confidence,
    risk,
    safeProbability: normalizedProbability(result.safe_probability),
    scamProbability: normalizedProbability(result.scam_probability),
    explanation,
    reasons,
    tips,
    ocrText: null,
    detectedUrls: [],
    qrContent: null,
    language: null,
    speechText: null,
  }
}

function normalizedProbability(value: unknown): number | null {
  if (value == null) return null
  const probability = Number(value)
  return Number.isFinite(probability) && probability >= 0 && probability <= 100
    ? probability
    : null
}

export async function analyzeTrinetraContent(
  userId: string,
  type: DetectionType,
  content: string,
  language?: string,
): Promise<TrinetraAnalysisResult | null> {
  if (type !== "message" && type !== "url" && type !== "upi") return null
  if (!content.trim() || content.length > MAX_CONTENT_LENGTH) return null

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
  const response = await requestJson(
    `${baseUrl}/api/secure-chat/v1/detect`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Secure-Chat-Key": apiKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type, text: content, ...(language ? { language } : {}) }),
    },
    requestTimeout(),
  )
  if (!response.ok) return null
  if (!response.body) {
    reportDiagnostic("TRINETRA_INVALID_RESPONSE")
    return null
  }
  const result = normalizeTrinetraDetection(response.body as DetectionResponse, type)
  if (!result) reportDiagnostic("TRINETRA_INVALID_RESPONSE")
  return result
}

export const TRINETRA_MAX_CONTENT_LENGTH = MAX_CONTENT_LENGTH