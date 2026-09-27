import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import {
  cancelTrinetraAuthorization,
  completeTrinetraAuthorization,
} from "@/lib/services/trinetra-integration.service"

function chatRedirect(request: NextRequest, result: "linked" | "error" | "denied") {
  const url = new URL("/chat", request.url)
  url.searchParams.set("trinetra", result)
  const response = NextResponse.redirect(url, { status: 303 })
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? ""
  const state = request.nextUrl.searchParams.get("state") ?? ""
  const providerError = request.nextUrl.searchParams.get("error")

  if (code.length > 4096 || state.length > 256) return chatRedirect(request, "error")

  try {
    const userId = await getUserId()
    if (!code || !state) return chatRedirect(request, "error")
    if (providerError) {
      await cancelTrinetraAuthorization(userId, state)
      return chatRedirect(request, "denied")
    }

    await completeTrinetraAuthorization(userId, state, code)
    return chatRedirect(request, "linked")
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.redirect(new URL("/login?next=%2Fchat", request.url), { status: 303 })
    }
    console.warn("[Trinetra callback] Authorization could not be completed")
    return chatRedirect(request, "error")
  }
}