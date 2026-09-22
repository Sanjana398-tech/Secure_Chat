import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/auth-utils"
import { searchUsers, updateProfile } from "@/lib/services/user.service"
import { searchUsersSchema, updateProfileSchema } from "@/lib/validations/message"

export async function GET(request: NextRequest) {
  try {
    const currentUserId = await getUserId()

    const q = request.nextUrl.searchParams.get("q") ?? ""
    const parsed = searchUsersSchema.safeParse({ q })
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 },
      )
    }

    const users = await searchUsers(parsed.data.q, currentUserId)
    return NextResponse.json({ data: users })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[GET /api/users]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/users
 * Update the current user's profile (name and/or username).
 */
export async function PATCH(request: NextRequest) {
  try {
    const currentUserId = await getUserId()

    const body = await request.json()
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return NextResponse.json(
        { error: issue?.message ?? "Invalid request" },
        { status: 400 },
      )
    }

    const updated = await updateProfile(currentUserId, parsed.data)
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[PATCH /api/users]", err)
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
  }
}
