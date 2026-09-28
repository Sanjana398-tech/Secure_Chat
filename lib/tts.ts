/**
 * tts.ts — Multilingual Text-to-Speech for Trinetra AI alerts
 * ============================================================
 * Rules:
 *  1. The alert text is ALWAYS the localized string — never translated to English first.
 *  2. Speech uses the selected language and an installed browser voice.
 *  3. If that voice is unavailable, the UI shows a clear limitation message.
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

function unavailableVoice(language: LanguageCode): SpeakResult {
  return {
    ok: false,
    reason: "voice-unavailable",
    missingLocale: SPEECH_LOCALES[language],
    languageName: getLanguageName(language),
  }
}

function getSpeechVoices(synthesis: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const voices = synthesis.getVoices()
  if (voices.length > 0) return Promise.resolve(voices)

  return new Promise((resolve) => {
    const onVoicesChanged = () => {
      if (synthesis.getVoices().length > 0) finish()
    }
    const finish = () => {
      clearTimeout(timeout)
      synthesis.removeEventListener("voiceschanged", onVoicesChanged)
      resolve(synthesis.getVoices())
    }
    const timeout = setTimeout(finish, 1000)
    synthesis.addEventListener("voiceschanged", onVoicesChanged)
  })
}

export async function speakDetectionAlert(
  text: string,
  language: LanguageCode,
): Promise<SpeakResult> {
  if (
    typeof window === "undefined" ||
    !window.speechSynthesis ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return Promise.resolve({ ok: false, reason: "no-tts" })
  }

  const locale = SPEECH_LOCALES[language]
  const localeLanguage = locale.split("-")[0].toLowerCase()
  let voices: SpeechSynthesisVoice[]
  try {
    voices = await getSpeechVoices(window.speechSynthesis)
  } catch {
    return {
      ok: false,
      reason: "error",
      message: `Speech playback failed for ${getLanguageName(language)}.`,
    }
  }
  const voice =
    voices.find((candidate) => candidate.lang.toLowerCase() === locale.toLowerCase()) ??
    voices.find((candidate) => candidate.lang.toLowerCase().split("-")[0] === localeLanguage)

  if (!voice) return Promise.resolve(unavailableVoice(language))

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = locale
  utterance.voice = voice

  return new Promise<SpeakResult>((resolve) => {
    utterance.onend = () => resolve({ ok: true, voiceUsed: voice.name || locale })
    utterance.onerror = (event) => {
      if (event.error === "voice-unavailable" || event.error === "language-unavailable") {
        resolve(unavailableVoice(language))
        return
      }
      resolve({
        ok: false,
        reason: "error",
        message: `Speech playback failed for ${getLanguageName(language)}.`,
      })
    }

    try {
      window.speechSynthesis.speak(utterance)
    } catch {
      resolve({
        ok: false,
        reason: "error",
        message: `Speech playback failed for ${getLanguageName(language)}.`,
      })
    }
  })
}

export function speakResultMessage(result: SpeakResult): string | null {
  if (result.ok) return null
  switch (result.reason) {
    case "voice-unavailable":
      return `${result.languageName} speech is unavailable on this device. The text result is still available.`
    case "no-tts":
      return "Text-to-speech is not supported in this browser."
    case "error":
      return `TTS error: ${result.message}`
  }
}
