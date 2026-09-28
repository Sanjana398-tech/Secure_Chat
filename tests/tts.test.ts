import { afterEach, describe, expect, it, vi } from "vitest"
import { speakDetectionAlert, speakResultMessage } from "@/lib/tts"

class MockSpeechSynthesisUtterance {
  lang = ""
  voice: SpeechSynthesisVoice | null = null
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null

  constructor(readonly text: string) {}
}

const supportedLanguages = [
  ["en", "en-IN"],
  ["hi", "hi-IN"],
  ["kn", "kn-IN"],
  ["te", "te-IN"],
  ["ta", "ta-IN"],
  ["ml", "ml-IN"],
] as const

function installSpeechSynthesis(voices: SpeechSynthesisVoice[]) {
  const utterances: MockSpeechSynthesisUtterance[] = []
  let voiceChangeListener: ((event: Event) => void) | undefined
  const speechSynthesis = {
    getVoices: vi.fn(() => voices),
    speak: vi.fn((utterance: MockSpeechSynthesisUtterance) => {
      utterances.push(utterance)
    }),
    addEventListener: vi.fn((_type: string, listener: (event: Event) => void) => {
      voiceChangeListener = listener
    }),
    removeEventListener: vi.fn(() => {
      voiceChangeListener = undefined
    }),
  }

  vi.stubGlobal("window", { speechSynthesis })
  vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance)

  return {
    speechSynthesis,
    utterances,
    notifyVoicesChanged: () => voiceChangeListener?.(new Event("voiceschanged")),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("browser speech synthesis", () => {
  it.each(supportedLanguages)("uses the %s BCP-47 locale", async (language, locale) => {
    const voice = { lang: locale, name: `${language}-voice` } as SpeechSynthesisVoice
    const { speechSynthesis, utterances } = installSpeechSynthesis([voice])

    const result = speakDetectionAlert("Localized alert", language)
    await Promise.resolve()

    expect(speechSynthesis.speak).toHaveBeenCalledOnce()
    expect(utterances[0].text).toBe("Localized alert")
    expect(utterances[0].lang).toBe(locale)
    expect(utterances[0].voice).toBe(voice)

    utterances[0].onend?.()
    await expect(result).resolves.toEqual({ ok: true, voiceUsed: `${language}-voice` })
  })

  it("reports an unavailable language voice without trying to speak", async () => {
    const voice = { lang: "en-IN", name: "English voice" } as SpeechSynthesisVoice
    const { speechSynthesis } = installSpeechSynthesis([voice])

    const result = await speakDetectionAlert("संदिग्ध संदेश", "hi")

    expect(speechSynthesis.speak).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: false,
      reason: "voice-unavailable",
      missingLocale: "hi-IN",
      languageName: "Hindi",
    })
    expect(speakResultMessage(result)).toContain("unavailable on this device")
  })

  it("waits for voices that load asynchronously", async () => {
    const voices: SpeechSynthesisVoice[] = []
    const { speechSynthesis, utterances, notifyVoicesChanged } = installSpeechSynthesis(voices)

    const result = speakDetectionAlert("Localized alert", "ta")
    await Promise.resolve()
    expect(speechSynthesis.speak).not.toHaveBeenCalled()

    const voice = { lang: "ta-IN", name: "Tamil voice" } as SpeechSynthesisVoice
    voices.push(voice)
    notifyVoicesChanged()
    await Promise.resolve()

    expect(speechSynthesis.speak).toHaveBeenCalledOnce()
    expect(utterances[0].lang).toBe("ta-IN")
    utterances[0].onend?.()
    await expect(result).resolves.toEqual({ ok: true, voiceUsed: "Tamil voice" })
  })

  it("reports unavailable speech synthesis without throwing", async () => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance)

    const result = await speakDetectionAlert("Hello", "en")

    expect(result).toEqual({ ok: false, reason: "no-tts" })
    expect(speakResultMessage(result)).toBe("Text-to-speech is not supported in this browser.")
  })
})