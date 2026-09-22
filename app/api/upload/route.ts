import { NextRequest, NextResponse } from "next/server"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { getUserId } from "@/lib/auth-utils"
import { nanoid } from "@/lib/utils"

/**
 * POST /api/upload
 * Upload a media attachment (image or voice note) for a chat message.
 *
 * Accepts multipart/form-data:
 *   file — the attachment (image or audio)
 *   kind — "image" | "voice"
 *
 * Returns { data: { url, filename } } where url points at /api/files/<filename>.
 * Files are stored on local disk in <project>/uploads and are only served
 * to authenticated users.
 */

const UPLOADS_DIR = path.join(process.cwd(), "uploads")

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB
// Keep under Trinetra AI's Flask MAX_CONTENT_LENGTH (default 10 MB) so the
// audio can also be forwarded to /api/analyze-voice without a 413.
const MAX_AUDIO_BYTES = 9 * 1024 * 1024 // 9 MB

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"])
const AUDIO_EXT = new Set(["webm", "ogg", "mp3", "wav", "m4a", "mp4"])

export async function POST(request: NextRequest) {
  try {
    await getUserId()

    const form = await request.formData()
    const kind = form.get("kind")
    const file = form.get("file")

    if (kind !== "image" && kind !== "voice") {
      return NextResponse.json({ error: "kind must be 'image' or 'voice'" }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate extension
    const ext = (file.name.split(".").pop() ?? "").toLowerCase()
    const allowed = kind === "image" ? IMAGE_EXT : AUDIO_EXT
    if (!allowed.has(ext)) {
      const list = [...allowed].join(", ")
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${list}` },
        { status: 400 },
      )
    }

    // Validate content-type prefix (defense in depth against renamed files)
    const expectedPrefix = kind === "image" ? "image/" : "audio/"
    if (file.type && !file.type.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: `File content does not match kind '${kind}'` },
        { status: 400 },
      )
    }

    // Validate size
    const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(maxBytes / (1024 * 1024))} MB)` },
        { status: 413 },
      )
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 })
    }

    // Save with a generated, unguessable filename (never the user's original name)
    await mkdir(UPLOADS_DIR, { recursive: true })
    const filename = `${nanoid()}.${ext}`
    await writeFile(
      path.join(UPLOADS_DIR, filename),
      Buffer.from(await file.arrayBuffer()),
    )

    return NextResponse.json(
      { data: { url: `/api/files/${filename}`, filename } },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[POST /api/upload]", err)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
