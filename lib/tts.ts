/**
 * tts.ts — Multilingual Text-to-Speech for Trinetra AI alerts
 * ============================================================
 * Rules:
 *  1. The alert text is ALWAYS the localized string — never translated to English first.
 *  2. The localized alert is sent to the TTS API in the selected language.
 *  3. If the service is unavailable, the UI shows a clear limitation message.
 *  4. Existing English voice alerts continue to work when the service is configured.
 */

import { SPEECH_LOCALES, SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/localization"

export type SpeakResult =
  | { ok: true; voiceUsed: string | null }
  | { ok: false; reason: "voice-unavailable"; missingLocale: string; languageName: string }
  | { ok: false; reason: "no-tts" }
  | { ok: false; reason: "error"; message: string }

function getLanguageName(code: LanguageCode): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase()
}

async function requestSpeechAudio(text: string, language: LanguageCode): Promise<Blob> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: "Text-to-speech request failed." }))) as {
      error?: string
    }
    throw new Error(body.error ?? "Text-to-speech request failed.")
  }

  const blob = await response.blob()
  if (blob.size === 0) {
    throw new Error("The TTS service returned empty audio.")
  }

  return blob
}

function playAudioBlob(blob: Blob, language: LanguageCode): Promise<SpeakResult> {
  return new Promise<SpeakResult>((resolve) => {
    if (typeof window === "undefined") {
      resolve({ ok: false, reason: "no-tts" })
      return
    }

    const audioUrl = URL.createObjectURL(blob)
    const audio = new Audio(audioUrl)
    audio.lang = SPEECH_LOCALES[language]
    audio.preload = "auto"

    const cleanup = () => {
      URL.revokeObjectURL(audioUrl)
      audio.onended = null
      audio.onerror = null
    }

    audio.onended = () => {
      cleanup()
      resolve({ ok: true, voiceUsed: `multilingual-${language}` })
    }

    audio.onerror = () => {
      cleanup()
      resolve({
        ok: false,
        reason: "error",
        message: `Audio playback failed for ${getLanguageName(language)}.`,
      })
    }

    audio.play().catch((err) => {
      cleanup()
      resolve({
        ok: false,
        reason: "error",
        message: err instanceof Error ? err.message : `Audio playback failed for ${getLanguageName(language)}.`,
      })
    })
  })
}

export function speakDetectionAlert(
  text: string,
  language: LanguageCode,
): Promise<SpeakResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, reason: "no-tts" })
  }

  return requestSpeechAudio(text, language)
    .then((blob) => playAudioBlob(blob, language))
    .catch((err) => {
      const message = err instanceof Error ? err.message : "TTS failed."
      const shouldReportUnavailable = /not configured|unsupported|service|invalid|credentials/i.test(message)

      if (shouldReportUnavailable) {
        return {
          ok: false,
          reason: "voice-unavailable",
          missingLocale: SPEECH_LOCALES[language],
          languageName: getLanguageName(language),
        }
      }

      return { ok: false, reason: "error", message }
    })
}

export function speakResultMessage(result: SpeakResult): string | null {
  if (result.ok) return null
  switch (result.reason) {
    case "voice-unavailable":
      return `${result.languageName} voice is currently unavailable from the Edge TTS service. The text result is still available.`
    case "no-tts":
      return "Text-to-speech is not supported in this browser."
    case "error":
      return `TTS error: ${result.message}`
  }
}
