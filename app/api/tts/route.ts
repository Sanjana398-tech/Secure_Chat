import { NextResponse } from "next/server"
import * as fs from "node:fs/promises"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { type LanguageCode } from "@/lib/localization"

const VOICE_MAP: Record<LanguageCode, string> = {
  en: "en-IN-NeerjaNeural",
  hi: "hi-IN-SwaraNeural",
  kn: "kn-IN-GaganNeural",
  te: "te-IN-ShrutiNeural",
  ta: "ta-IN-ValluvarNeural",
  ml: "ml-IN-SobhanaNeural",
}

function getVoiceName(language: LanguageCode): string | null {
  return VOICE_MAP[language] ?? null
}

function getPythonCommand(): string {
  const configuredCommand = process.env.EDGE_TTS_PYTHON?.trim()
  if (configuredCommand) return configuredCommand

  const projectVenvPython = path.join(
    process.cwd(),
    process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python",
  )

  return existsSync(projectVenvPython) ? projectVenvPython : "python"
}

function synthesizeWithEdgeTts(text: string, voiceName: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(getPythonCommand(), [
      "-m",
      "edge_tts",
      "--voice",
      voiceName,
      "--text",
      text,
      "--write-media",
      outputPath,
    ])
    let errorOutput = ""

    process.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString()
    })
    process.on("error", reject)
    process.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(errorOutput.trim() || `Edge TTS exited with code ${code ?? "unknown"}.`))
    })
  })
}

export async function POST(request: Request) {
  let outputPath: string | undefined
  try {
    const body = (await request.json()) as { text?: string; language?: LanguageCode }
    const language = body.language ?? "en"
    const text = body.text?.trim()

    if (!text) {
      return NextResponse.json({ error: "No text was provided for speech synthesis." }, { status: 400 })
    }

    const voiceName = getVoiceName(language)
    if (!voiceName) {
      return NextResponse.json(
        { error: `Unsupported language for speech synthesis: ${language}` },
        { status: 400 },
      )
    }

    const tempDir = path.join(process.cwd(), "tmp")
    await fs.mkdir(tempDir, { recursive: true })
    outputPath = path.join(
      tempDir,
      `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
    )

    await synthesizeWithEdgeTts(text, voiceName, outputPath)

    const audioBytes = await fs.readFile(outputPath)

    if (audioBytes.length === 0) {
      return NextResponse.json({ error: "The TTS service returned no audio." }, { status: 500 })
    }

    return new NextResponse(audioBytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Edge TTS request failed." },
      { status: 502 },
    )
  } finally {
    if (outputPath) await fs.unlink(outputPath).catch(() => undefined)
  }
}
