import { createCipheriv, createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const columns = {
    userId: Symbol("userId"),
    enabled: Symbol("enabled"),
    pendingStateHash: Symbol("pendingStateHash"),
    pendingStateExpiresAt: Symbol("pendingStateExpiresAt"),
  }
  const rows = new Map<string, Record<string, unknown>>()
  const fetch = vi.fn()

  function conditions(condition: any): any[] {
    return condition?.op === "and" ? condition.conditions.flatMap(conditions) : [condition]
  }

  function select() {
    return {
      from: () => ({
        where: (condition: any) => ({
          limit: async () => {
            const userId = conditions(condition).find((item) => item?.column === columns.userId)?.value
            const row = rows.get(userId)
            return row ? [row] : []
          },
        }),
      }),
    }
  }

  function update() {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (condition: any) => {
          const predicates = conditions(condition)
          const userId = predicates.find((item) => item?.column === columns.userId)?.value
          const row = rows.get(userId)
          const valid = Boolean(row) && predicates.every((predicate) => {
            if (predicate?.op === "eq") return row?.[String(predicate.column.description)] === predicate.value
            if (predicate?.op === "gt") {
              const value = row?.[String(predicate.column.description)]
              return value instanceof Date && value > predicate.value
            }
            return false
          })
          if (valid && row) Object.assign(row, values)
          return {
            returning: async () => valid && row ? [row] : [],
          }
        },
      }),
    }
  }

  const db = {
    select: vi.fn(select),
    update: vi.fn(update),
  }

  return { columns, rows, db, fetch, conditions }
})

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/db/schema", () => ({ trinetraIntegration: mocks.columns }))
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ op: "and", conditions }),
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
  gt: (column: unknown, value: unknown) => ({ op: "gt", column, value }),
}))

import {
  analyzeTrinetraContent,
  completeTrinetraAuthorization,
  getTrinetraProtectionStatus,
  normalizeTrinetraDetection,
} from "@/lib/services/trinetra-integration.service"

let diagnosticMessages: string[] = []

function stateHash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function encryptTestToken(token: string) {
  const iv = Buffer.alloc(12, 9)
  const cipher = createCipheriv("aes-256-gcm", Buffer.alloc(32, 7), iv)
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".")
}

function linkedRow(userId: string, token: string) {
  return {
    userId,
    enabled: true,
    encryptedAccessToken: token,
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
    linkedAccountId: `account-${userId}`,
    pendingStateHash: null,
    pendingStateExpiresAt: null,
  }
}

describe("Trinetra integration client", () => {
  beforeEach(() => {
    mocks.rows.clear()
    mocks.fetch.mockReset()
    vi.stubGlobal("fetch", mocks.fetch)
    process.env.TRINETRA_BASE_URL = "https://trinetra-ai-ua5e.onrender.com"
    process.env.TRINETRA_SECURE_CHAT_API_KEY = "test-server-secret"
    process.env.TRINETRA_REDIRECT_URI = "https://secure-chat.test/api/integrations/trinetra/callback"
    process.env.TRINETRA_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
    vi.stubEnv("NODE_ENV", "test")
    diagnosticMessages = []
    vi.spyOn(console, "warn").mockImplementation((message?: unknown) => {
      if (typeof message === "string") diagnosticMessages.push(message)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("stores a successfully exchanged token and confirms the link update", async () => {
    const state = "f".repeat(43)
    const row = {
      ...linkedRow("account-a", "unused"),
      pendingStateHash: stateHash(state),
      pendingStateExpiresAt: new Date(Date.now() + 60_000),
    }
    mocks.rows.set("account-a", row)
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      access_token: "account-token-for-test",
      expires_in: 600,
      account_id: "trinetra-account-a",
    }), { status: 200 }))

    await completeTrinetraAuthorization("account-a", state, "one-time-code")

    expect(row.encryptedAccessToken).not.toBe("unused")
    expect(row.encryptedAccessToken).not.toContain("account-token-for-test")
    expect(row.linkedAccountId).toBe("trinetra-account-a")
    expect(row.accessTokenExpiresAt?.getTime()).toBeGreaterThan(Date.now())
  })

  it("fails authorization when the final link update affects zero rows", async () => {
    const state = "g".repeat(43)
    const row = {
      ...linkedRow("account-a", "unused"),
      pendingStateHash: stateHash(state),
      pendingStateExpiresAt: new Date(Date.now() + 60_000),
    }
    mocks.rows.set("account-a", row)
    mocks.fetch.mockImplementation(async () => {
      row.enabled = false
      return new Response(JSON.stringify({
        access_token: "account-token-for-test",
        expires_in: 600,
      }), { status: 200 })
    })

    await expect(completeTrinetraAuthorization("account-a", state, "one-time-code"))
      .rejects.toThrow("Trinetra authorization link update failed")
    expect(diagnosticMessages).toContain("[trinetra] TRINETRA_LINK_UPDATE_FAILED")
  })

  it("rejects state from another account before exchanging the code", async () => {
    const accountAState = "a".repeat(43)
    const accountBState = "b".repeat(43)
    mocks.rows.set("account-a", {
      ...linkedRow("account-a", "unused"),
      pendingStateHash: stateHash(accountAState),
      pendingStateExpiresAt: new Date(Date.now() + 60_000),
    })

    await expect(completeTrinetraAuthorization("account-a", accountBState, "code-from-b"))
      .rejects.toThrow("Authorization state mismatch")
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("rejects a replayed authorization state", async () => {
    const state = "c".repeat(43)
    mocks.rows.set("account-a", {
      ...linkedRow("account-a", "unused"),
      pendingStateHash: stateHash(state),
      pendingStateExpiresAt: new Date(Date.now() + 60_000),
    })
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      access_token: "short-lived-account-token",
      expires_in: 600,
      account_id: "trinetra-account-a",
    }), { status: 200 }))

    await completeTrinetraAuthorization("account-a", state, "one-time-code")
    await expect(completeTrinetraAuthorization("account-a", state, "one-time-code"))
      .rejects.toThrow("Authorization state mismatch")
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it("rejects an invalid or already expired account token returned by exchange", async () => {
    const state = "d".repeat(43)
    const row = {
      ...linkedRow("account-a", "unused"),
      pendingStateHash: stateHash(state),
      pendingStateExpiresAt: new Date(Date.now() + 60_000),
    }
    mocks.rows.set("account-a", row)
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      account_token: "short-lived-account-token",
      expires_in: 0,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }), { status: 200 }))

    await expect(completeTrinetraAuthorization("account-a", state, "expired-code"))
      .rejects.toThrow("invalid token expiry")
    expect(row.encryptedAccessToken).toBe("unused")
  })

  it("rejects expired account tokens without calling detect", async () => {
    mocks.rows.set("account-a", {
      ...linkedRow("account-a", "encrypted-token"),
      accessTokenExpiresAt: new Date(Date.now() - 1000),
    })

    await expect(analyzeTrinetraContent("account-a", "message", "hello"))
      .resolves.toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ["missing row", undefined, "TRINETRA_LINK_MISSING"],
    ["disabled row", { ...linkedRow("account-a", "unused"), enabled: false }, "TRINETRA_LINK_DISABLED"],
    ["missing token", { ...linkedRow("account-a", "unused"), encryptedAccessToken: null }, "TRINETRA_TOKEN_MISSING"],
    ["expired token", { ...linkedRow("account-a", "unused"), accessTokenExpiresAt: new Date(Date.now() - 1000) }, "TRINETRA_TOKEN_EXPIRED"],
  ])("diagnoses a %s without making a provider request", async (_name, row, code) => {
    if (row) mocks.rows.set("account-a", row)

    await expect(analyzeTrinetraContent("account-a", "message", "hello")).resolves.toBeNull()

    expect(diagnosticMessages).toContain(`[trinetra] ${code}`)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("diagnoses token decryption failure without exposing token data", async () => {
    mocks.rows.set("account-a", linkedRow("account-a", "not-a-valid-encrypted-token"))

    await expect(analyzeTrinetraContent("account-a", "message", "hello")).resolves.toBeNull()

    expect(diagnosticMessages).toContain("[trinetra] TRINETRA_TOKEN_DECRYPT_FAILED")
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("diagnoses an enabled but unlinked status when requested by a message send", async () => {
    mocks.rows.set("account-a", {
      ...linkedRow("account-a", "unused"),
      encryptedAccessToken: null,
    })

    await expect(getTrinetraProtectionStatus("account-a", true)).resolves.toMatchObject({
      enabled: true,
      linked: false,
    })

    expect(diagnosticMessages).toContain("[trinetra] TRINETRA_TOKEN_MISSING")
  })

  it("diagnoses missing environment configuration without exposing its values", async () => {
    mocks.rows.set("account-a", linkedRow("account-a", encryptTestToken("test-account-token")))
    delete process.env.TRINETRA_SECURE_CHAT_API_KEY

    await expect(analyzeTrinetraContent("account-a", "message", "hello"))
      .rejects.toThrow("TRINETRA_CONFIG_MISSING")

    expect(diagnosticMessages).toContain("[trinetra] TRINETRA_CONFIG_MISSING")
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("reports only the HTTP status for Trinetra failures", async () => {
    mocks.rows.set("account-a", linkedRow("account-a", encryptTestToken("test-account-token")))
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: "sensitive provider detail" }), { status: 401 }))

    await expect(analyzeTrinetraContent("account-a", "message", "hello")).resolves.toBeNull()

    expect(diagnosticMessages).toContain("[trinetra] TRINETRA_HTTP_ERROR status=401")
    expect(diagnosticMessages.join(" ")).not.toContain("sensitive provider detail")
    expect(diagnosticMessages.join(" ")).not.toContain("test-account-token")
  })

  it("diagnoses transport failures without logging the thrown error", async () => {
    mocks.rows.set("account-a", linkedRow("account-a", encryptTestToken("test-account-token")))
    mocks.fetch.mockRejectedValue(new Error("secret-bearing transport detail"))

    await expect(analyzeTrinetraContent("account-a", "message", "hello"))
      .rejects.toThrow("TRINETRA_NETWORK_ERROR")

    expect(diagnosticMessages).toContain("[trinetra] TRINETRA_NETWORK_ERROR")
    expect(diagnosticMessages.join(" ")).not.toContain("secret-bearing transport detail")
  })

  it("diagnoses malformed provider JSON", async () => {
    mocks.rows.set("account-a", linkedRow("account-a", encryptTestToken("test-account-token")))
    mocks.fetch.mockResolvedValue(new Response("not-json", { status: 200 }))

    await expect(analyzeTrinetraContent("account-a", "message", "hello")).resolves.toBeNull()

    expect(diagnosticMessages).toContain("[trinetra] TRINETRA_INVALID_RESPONSE")
  })

  it("returns a successful detection result", async () => {
    mocks.rows.set("account-a", linkedRow("account-a", encryptTestToken("test-account-token")))
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: { verdict: "SAFE", confidence: 98, risk: 2 },
    }), { status: 200 }))

    await expect(analyzeTrinetraContent("account-a", "message", "hello"))
      .resolves.toMatchObject({ prediction: "SAFE", confidence: 98, risk: 2 })

    const requestBody = JSON.parse(mocks.fetch.mock.calls[0][1].body as string)
    expect(requestBody).toMatchObject({ type: "message", text: "hello" })
    expect(requestBody).not.toHaveProperty("content")
  })

  it("reads a detection nested inside the provider response envelope", async () => {
    mocks.rows.set("account-a", linkedRow("account-a", encryptTestToken("test-account-token")))
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        result: {
          verdict: "SCAM",
          confidence: 94,
          explanation: "The message resembles a scam.",
        },
      },
    }), { status: 200 }))

    await expect(analyzeTrinetraContent("account-a", "message", "test scam text"))
      .resolves.toMatchObject({
        prediction: "SCAM",
        confidence: 94,
        explanation: "The message resembles a scam.",
      })
    expect(diagnosticMessages).not.toContain("[trinetra] TRINETRA_INVALID_RESPONSE")
  })

  it("reads a scam verdict nested in the provider scan-history envelope", () => {
    expect(normalizeTrinetraDetection({
      success: true,
      scan_history: [{
        result: {
          prediction: "SCAM",
          confidence: 94,
          explanation: "The message resembles a scam.",
        },
      }],
    }, "message")).toMatchObject({
      prediction: "SCAM",
      confidence: 94,
      explanation: "The message resembles a scam.",
    })
  })

  it("keeps a saved scam verdict when optional post-analysis work fails", async () => {
    mocks.rows.set("account-a", linkedRow("account-a", encryptTestToken("test-account-token")))
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: "Optional explanation generation failed",
      result: {
        prediction: "SCAM",
        confidence: 96.4,
        scam_probability: 91.2,
        safe_probability: 8.8,
      },
    }), { status: 500 }))

    await expect(analyzeTrinetraContent("account-a", "message", "test scam text"))
      .resolves.toMatchObject({
        prediction: "SCAM",
        confidence: 96.4,
        risk: 91.2,
        scamProbability: 91.2,
      })
    expect(diagnosticMessages).toContain("[trinetra] TRINETRA_HTTP_ERROR status=500")
  })

  it("cannot use another Secure Chat user's account token", async () => {
    const state = "e".repeat(43)
    const row = {
      ...linkedRow("account-b", "unused"),
      pendingStateHash: stateHash(state),
      pendingStateExpiresAt: new Date(Date.now() + 60_000),
    }
    mocks.rows.set("account-b", row)
    mocks.fetch.mockImplementation(async (input: string | URL | Request) => {
      const isTokenExchange = String(input).endsWith("/api/secure-chat/v1/token")
      return new Response(JSON.stringify(isTokenExchange
        ? { account_token: "private-token-for-b", expires_in: 600, account_id: "trinetra-b" }
        : { success: true, result: { verdict: "SAFE", confidence: 98, risk: 2 } }), { status: 200 })
    })
    await completeTrinetraAuthorization("account-b", state, "code-b")
    expect(row.encryptedAccessToken).not.toContain("private-token-for-b")
    mocks.fetch.mockClear()

    await expect(analyzeTrinetraContent("account-a", "message", "private A"))
      .resolves.toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()

    await expect(analyzeTrinetraContent("account-b", "message", "private B"))
      .resolves.toMatchObject({ prediction: "SAFE" })
    expect(mocks.fetch).toHaveBeenCalledOnce()
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer private-token-for-b")
  })

  it.each(["SAFE", "SUSPICIOUS", "SCAM"] as const)(
    "normalizes a real %s result with its explanation, score, and tips",
    (verdict) => {
      const result = normalizeTrinetraDetection({
        success: true,
        result: {
          type: "upi",
          verdict,
          confidence: 96.4,
          risk_score: 83.2,
          explanation: "Provider explanation",
          reasons: ["Provider reason"],
          tips: ["Provider tip"],
        },
      }, "message")

      expect(result).toMatchObject({
        prediction: verdict,
        detectionType: "upi",
        confidence: 96.4,
        risk: 83.2,
        explanation: "Provider explanation",
        reasons: ["Provider reason"],
        tips: ["Provider tip"],
      })
    },
  )

  it.each(["FAKE", "FRAUD", "UNSAFE", "SPAM"])("maps the provider's %s verdict to SCAM", (verdict) => {
    expect(normalizeTrinetraDetection({
      success: true,
      prediction: verdict,
      confidence: 91,
    }, "message")).toMatchObject({
      prediction: "SCAM",
      confidence: 91,
      risk: null,
    })
  })

  it.each(["NOT_SPAM", "NOT SPAM", "HAM"])("maps the provider's %s verdict to SAFE", (verdict) => {
    expect(normalizeTrinetraDetection({ success: true, verdict }, "message"))
      .toMatchObject({ prediction: "SAFE" })
  })

  it("maps the provider's boolean is_spam flag to a scam verdict", () => {
    expect(normalizeTrinetraDetection({
      success: true,
      result: { is_spam: true, confidence: 93 },
    }, "message")).toMatchObject({
      prediction: "SCAM",
      confidence: 93,
    })
  })

  it("accepts a scalar detection field as the provider verdict", () => {
    expect(normalizeTrinetraDetection({
      success: true,
      detection: "SPAM",
      confidence: 93,
    }, "message")).toMatchObject({
      prediction: "SCAM",
      confidence: 93,
    })
  })

  it("maps the provider's WARNING verdict to a visible suspicious result", () => {
    expect(normalizeTrinetraDetection({
      success: true,
      verdict: "WARNING",
      confidence: 84,
      explanation: "The message contains suspicious payment language.",
    }, "message")).toMatchObject({
      prediction: "SUSPICIOUS",
      confidence: 84,
      explanation: "The message contains suspicious payment language.",
    })
  })

  it("keeps valid provider detections when the optional risk score is omitted", () => {
    expect(normalizeTrinetraDetection({
      success: true,
      result: { verdict: "SAFE", confidence: 98 },
    }, "message")).toMatchObject({
      prediction: "SAFE",
      confidence: 98,
      risk: null,
    })
  })

  it("normalizes legacy confidence, probability, and explanation fields", () => {
    expect(normalizeTrinetraDetection({
      success: true,
      prediction: "SCAM",
      scam_probability: 87,
      safe_probability: 13,
      reasons: [{ description: "Unexpected payment request" }],
      tips: "Verify the recipient before paying",
    }, "message")).toMatchObject({
      prediction: "SCAM",
      confidence: 0,
      risk: 87,
      safeProbability: 13,
      scamProbability: 87,
      reasons: ["Unexpected payment request"],
      tips: ["Verify the recipient before paying"],
    })
  })

  it("preserves a scam verdict when optional provider details are oversized or invalid", () => {
    const result = normalizeTrinetraDetection({
      success: true,
      label: "fraudulent",
      confidence: "unknown",
      risk_score: "not-a-score",
      reasons: Array.from({ length: 25 }, () => ({ description: "x".repeat(1100) })),
      tips: ["Verify the recipient"],
      scam_probability: "unknown",
    }, "message")

    expect(result).toMatchObject({
      prediction: "SCAM",
      confidence: 0,
      risk: null,
      scamProbability: null,
      tips: ["Verify the recipient"],
    })
    expect(result?.reasons).toHaveLength(20)
    expect(result?.reasons[0]).toHaveLength(1000)
  })

  it("rejects unknown verdicts but preserves verdicts with malformed optional scores", () => {
    expect(normalizeTrinetraDetection({ success: true, verdict: "UNKNOWN", confidence: 100 }, "message"))
      .toBeNull()
    expect(normalizeTrinetraDetection({ success: true, verdict: "SCAM", confidence: 101 }, "message"))
      .toMatchObject({ prediction: "SCAM", confidence: 0 })
    expect(normalizeTrinetraDetection({ success: true, verdict: "SAFE", confidence: "unknown" }, "message"))
      .toMatchObject({ prediction: "SAFE", confidence: 0 })
  })
})