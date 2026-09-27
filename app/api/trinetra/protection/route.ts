import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import {
  beginTrinetraAuthorization,
  disableTrinetraProtection,
  getTrinetraProtectionStatus,
} from "@/lib/services/trinetra-integration.service"

export async function GET() {
  try {
    const userId = await getUserId()
    return NextResponse.json({ data: await getTrinetraProtectionStatus(userId) })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[GET /api/trinetra/protection]", error)
    return NextResponse.json({ error: "Protection status unavailable" }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId()
    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody, "utf8") > 2048) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 })
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    if (!body || typeof body !== "object" || !("enabled" in body) || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 })
    }

    if (!body.enabled) {
      await disableTrinetraProtection(userId)
      return NextResponse.json({ data: { enabled: false, linked: false, pending: false } })
    }

    const authorization = await beginTrinetraAuthorization(userId)
    if (authorization.linked) {
      return NextResponse.json({ data: { enabled: true, linked: true, pending: false } })
    }
    return NextResponse.json({
      data: {
        enabled: true,
        linked: false,
        pending: true,
        authorizationUrl: authorization.authorizationUrl,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[POST /api/trinetra/protection]", error)
    return NextResponse.json({ error: "Unable to update Trinetra protection" }, { status: 503 })
  }
}