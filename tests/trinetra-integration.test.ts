import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
  normalizeTrinetraDetection,
} from "@/lib/services/trinetra-integration.service"

function stateHash(value: string) {
  return createHash("sha256").update(value).digest("hex")
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

  it("rejects malformed detection responses instead of inventing a result", () => {
    expect(normalizeTrinetraDetection({ success: true, verdict: "UNKNOWN", confidence: 100 }, "message"))
      .toBeNull()
    expect(normalizeTrinetraDetection({ success: true, verdict: "SCAM", confidence: 101 }, "message"))
      .toBeNull()
    expect(normalizeTrinetraDetection({ success: true, verdict: "SAFE", confidence: 98 }, "message"))
      .toBeNull()
  })
})