import { useEffect, useRef, useState } from "react"
import type { Message } from "@/types"
import { formatMessageTime } from "@/lib/utils"
import {
  getDetectionCopy,
  getSpeechAlert,
  type LanguageCode,
} from "@/lib/localization"
import { getFlaggedExplanation } from "@/lib/xai"
import { speakDetectionAlert, speakResultMessage } from "@/lib/tts"
import {
  Check,
  CheckCheck,
  ShieldAlert,
  ShieldCheck,
  IndianRupee,
  Mic,
  ExternalLink,
} from "lucide-react"

interface Props {
  message: Message
  isOwn: boolean
  isLastInRun: boolean
  language: LanguageCode
  voiceAlertsEnabled: boolean
}

// ─── URL detection ──────────────────────────────────────────────────────────
const URL_RE = /(https?:\/\/[^\s<>"']+)/g

function renderTextWithLinks(text: string) {
  const parts = text.split(URL_RE)
  return parts.map((part, i) =>
    URL_RE.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 opacity-90 hover:opacity-100 break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

// ─── Duration formatter ──────────────────────────────────────────────────────
function formatDur(sec: number | null) {
  if (!sec) return "0:00"
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MessageBubble({
  message,
  isOwn,
  isLastInRun,
  language,
  voiceAlertsEnabled,
}: Props) {
  const isTemp = message.id.startsWith("temp-")
  const time = formatMessageTime(message.createdAt)

  // Trinetra AI
  const prediction = message.trinetraPrediction
  const isScam = prediction === "SCAM"
  const isSuspicious = prediction === "SUSPICIOUS"
  const isSafe = prediction === "SAFE"
  const localizedPrediction =
    prediction === "SAFE" || prediction === "SUSPICIOUS" || prediction === "SCAM"
      ? prediction
      : null
  const alertLanguage = language
  const copy = getDetectionCopy(alertLanguage)
  const whyCopy = getDetectionCopy(language)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [showWhy, setShowWhy] = useState(false)
  const lastSpokenDetection = useRef<string | null>(null)
  const confidence = message.trinetraConfidence
  const isAnalyzed = !isTemp && (prediction != null || message.analyzedAt != null)
  const hasScreenshotDetails =
    message.messageType === "image" &&
    (message.trinetraOcrText ||
      message.trinetraDetectedUrls.length > 0 ||
      message.trinetraQrContent ||
      message.trinetraReasons.length > 0)

  const speechText = localizedPrediction
    ? getSpeechAlert(alertLanguage, localizedPrediction)
    : null
  const flaggedPrediction =
    localizedPrediction === "SCAM" || localizedPrediction === "SUSPICIOUS"
      ? localizedPrediction
      : null
  const flaggedExplanation = flaggedPrediction
    ? getFlaggedExplanation(message, language, flaggedPrediction)
    : null

  function speakText(text: string, voiceLanguage: LanguageCode) {
    setIsSpeaking(true)
    setTtsError(null)
    speakDetectionAlert(text, voiceLanguage).then((result) => {
      setIsSpeaking(false)
      const msg = speakResultMessage(result)
      if (msg) setTtsError(msg)
    })
  }

  function replayAlert() {
    if (!speechText) return
    speakText(speechText, alertLanguage)
  }

  function speakExplanation() {
    if (!flaggedExplanation) return
    speakText(flaggedExplanation.speechText, language)
  }

  // Clear any stale TTS error when the user changes language
  useEffect(() => {
    setTtsError(null)
  }, [language])

  useEffect(() => {
    if (!voiceAlertsEnabled || !speechText || !message.analyzedAt) return
    const analyzedAt = new Date(message.analyzedAt).getTime()
    const isRecentAnalysis = Number.isFinite(analyzedAt) && Date.now() - analyzedAt < 15_000
    if (!isRecentAnalysis) return
    const detectionKey = `${message.id}:${message.analyzedAt}:${prediction}`
    if (lastSpokenDetection.current === detectionKey) return
    lastSpokenDetection.current = detectionKey
    replayAlert()
  }, [message.id, message.analyzedAt, prediction, speechText, voiceAlertsEnabled, alertLanguage])

  const bubbleBase = `
    group relative px-3.5 py-2 text-sm leading-relaxed
    ${isOwn
      ? "rounded-[1.1rem] rounded-br-sm bg-[--bubble-out-bg,oklch(0.55_0.16_210)] text-[--bubble-out-fg,oklch(0.985_0_0)]"
      : "rounded-[1.1rem] rounded-bl-sm bg-[--bubble-in-bg,oklch(0.24_0_0)] text-[--bubble-in-fg,oklch(0.985_0_0)]"
    }
    ${isTemp ? "opacity-70" : ""}
    ${isScam && isAnalyzed ? "ring-1 ring-red-500/40" : ""}
    ${isSuspicious && isAnalyzed ? "ring-1 ring-amber-500/40" : ""}
  `

  // ─── Timestamp + status row ──────────────────────────────────────────────
  function MetaRow() {
    return (
      <div className="flex flex-col gap-0.5">
        <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
          {isSafe && isAnalyzed && (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 select-none">
              <ShieldCheck className="size-3" />
              {localizedPrediction && copy.result[localizedPrediction]}
              {confidence != null && ` · ${copy.riskScore}: ${confidence.toFixed(2)}%`}
              <button
                type="button"
                onClick={replayAlert}
                disabled={isSpeaking}
                className="ml-1 inline-flex size-4 items-center justify-center rounded text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-40"
                aria-label={isSpeaking ? "Speaking…" : "Replay voice alert"}
                title="Replay voice alert"
              >
                <span aria-hidden="true">{isSpeaking ? "⏳" : "🔊"}</span>
              </button>
            </span>
          )}
          {isSuspicious && isAnalyzed && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-300 select-none">
              <ShieldAlert className="size-3" />
              {localizedPrediction && copy.result[localizedPrediction]}
              {confidence != null && ` · ${copy.riskScore}: ${confidence.toFixed(2)}%`}
              <button
                type="button"
                onClick={replayAlert}
                disabled={isSpeaking}
                className="ml-1 inline-flex size-4 items-center justify-center rounded text-amber-300 hover:bg-amber-400/20 disabled:opacity-40"
                aria-label={isSpeaking ? "Speaking…" : "Replay voice alert"}
                title="Replay voice alert"
              >
                <span aria-hidden="true">{isSpeaking ? "⏳" : "🔊"}</span>
              </button>
            </span>
          )}
          {isScam && isAnalyzed && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-300 select-none">
              <ShieldAlert className="size-3" />
              {localizedPrediction && copy.result[localizedPrediction]}
              {confidence != null && ` · ${copy.riskScore}: ${confidence.toFixed(2)}%`}
              <button
                type="button"
                onClick={replayAlert}
                disabled={isSpeaking}
                className="ml-1 inline-flex size-4 items-center justify-center rounded text-red-300 hover:bg-red-400/20 disabled:opacity-40"
                aria-label={isSpeaking ? "Speaking…" : "Replay voice alert"}
                title="Replay voice alert"
              >
                <span aria-hidden="true">{isSpeaking ? "⏳" : "🔊"}</span>
              </button>
            </span>
          )}
          <span className="text-[10px] opacity-60 select-none">{time}</span>
          {isOwn && (
            <span className="opacity-60">
              {isTemp ? (
                <Check className="size-3" />
              ) : message.isRead ? (
                <CheckCheck className="size-3 text-sky-300" />
              ) : (
                <Check className="size-3" />
              )}
            </span>
          )}
        </div>
        {/* TTS language-unavailable notice shown for all message states so users
            know why a selected-language read-aloud did not start. */}
        {ttsError && (
          <p className="text-[10px] text-amber-400/90 leading-snug max-w-[220px]" role="alert">
            ⚠️ {ttsError}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={`flex items-end gap-1.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      {!isOwn && <div className="size-6 flex-shrink-0" />}

      <div
        className={`flex flex-col gap-0.5 max-w-[72%] sm:max-w-[60%] ${
          isOwn ? "items-end" : "items-start"
        }`}
      >
        {/* ── Fraud alert + Why? ─────────────────────────────────────── */}
        {(isScam || isSuspicious) && isAnalyzed && flaggedPrediction && (
          <div
            className={`w-full rounded-lg px-3 py-2 ${
              isScam
                ? "bg-red-950/80 border border-red-500/40 text-red-200"
                : "bg-amber-950/80 border border-amber-500/40 text-amber-100"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <ShieldAlert
                className={`size-3.5 flex-shrink-0 ${
                  isScam ? "text-red-400" : "text-amber-400"
                }`}
              />
              <span
                className={`text-[11px] font-bold uppercase tracking-wide ${
                  isScam ? "text-red-400" : "text-amber-400"
                }`}
              >
                {isScam ? "🔴 " : "🟠 "}
                {whyCopy.detectedTitle[flaggedPrediction]}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowWhy((open) => !open)}
              className={`mb-1 inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-bold ${
                isScam
                  ? "bg-red-500/25 text-red-100 hover:bg-red-500/40"
                  : "bg-amber-500/25 text-amber-50 hover:bg-amber-500/40"
              }`}
              aria-expanded={showWhy}
            >
              {whyCopy.whyButton}
            </button>
            {showWhy && flaggedExplanation && (
              <div className={`mt-2 space-y-2 ${isScam ? "text-red-200" : "text-amber-100"}`}>
                <ul className="list-disc space-y-1 pl-4 text-[11px] leading-snug">
                  {flaggedExplanation.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={speakExplanation}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                    isScam
                      ? "bg-red-500/20 text-red-100 hover:bg-red-500/35"
                      : "bg-amber-500/20 text-amber-50 hover:bg-amber-500/35"
                  }`}
                  aria-label={whyCopy.speakExplanation}
                >
                  <span aria-hidden="true">🔊</span>
                  {whyCopy.speakExplanation}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── IMAGE bubble ────────────────────────────────────────────── */}
        {message.messageType === "image" && message.mediaUrl && (
          <div className={`${bubbleBase} p-1.5`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.mediaUrl}
              alt="Shared image"
              className="rounded-[0.85rem] max-w-full max-h-64 object-cover block"
              loading="lazy"
            />
            {message.content && (
              <p className="mt-1.5 px-1 whitespace-pre-wrap break-words text-sm">
                {message.content}
              </p>
            )}
            {isAnalyzed && (hasScreenshotDetails || prediction) && (
              <div className="mt-2 border-t border-white/10 pt-2 px-1 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold uppercase tracking-wide opacity-70">
                    Screenshot analysis
                  </span>
                  {prediction && (
                    <span
                      className={
                        isScam
                          ? "font-bold text-red-300"
                          : isSuspicious
                            ? "font-bold text-amber-300"
                            : "font-bold text-emerald-300"
                      }
                    >
                      {localizedPrediction ? copy.result[localizedPrediction] : prediction}
                      {confidence != null && ` (${confidence.toFixed(2)}%)`}
                    </span>
                  )}
                </div>
                {message.trinetraQrContent && (
                  <div>
                    <p className="font-semibold text-amber-300">QR code detected</p>
                    <p className="mt-0.5 break-all font-mono opacity-80">
                      {message.trinetraQrContent}
                    </p>
                  </div>
                )}
                {message.trinetraDetectedUrls.length > 0 && (
                  <div>
                    <p className="font-semibold opacity-70">URLs found</p>
                    <div className="mt-0.5 space-y-0.5">
                      {message.trinetraDetectedUrls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block break-all underline underline-offset-2 opacity-90"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {message.trinetraOcrText && (
                  <div>
                    <p className="font-semibold opacity-70">Text found</p>
                    <p className="mt-0.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-words opacity-80">
                      {message.trinetraOcrText}
                    </p>
                  </div>
                )}
                {message.trinetraReasons.length > 0 && (
                  <div>
                    <p className="font-semibold opacity-70">Why</p>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 opacity-80">
                      {message.trinetraReasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <MetaRow />
          </div>
        )}

        {/* ── VOICE bubble ────────────────────────────────────────────── */}
        {message.messageType === "voice" && message.mediaUrl && (
          <div className={`${bubbleBase} min-w-[200px]`}>
            <div className="flex items-center gap-2">
              <Mic className="size-4 flex-shrink-0 opacity-70" />
              <audio
                src={message.mediaUrl}
                controls
                preload="metadata"
                className="h-8 flex-1"
                style={{ minWidth: "140px" }}
              />
            </div>
            {message.mediaDuration != null && (
              <p className="text-[10px] opacity-50 mt-0.5 pl-6">
                {formatDur(message.mediaDuration)}
              </p>
            )}
            {/* Whisper transcript */}
            {message.trinetraTranscription && (
              <p className="mt-1.5 text-xs opacity-70 italic border-t border-white/10 pt-1.5">
                &ldquo;{message.trinetraTranscription}&rdquo;
              </p>
            )}
            <MetaRow />
          </div>
        )}

        {/* ── PAYMENT bubble ──────────────────────────────────────────── */}
        {message.messageType === "payment" && (
          <div className={`${bubbleBase} min-w-[220px]`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center size-8 rounded-full bg-emerald-500/20 flex-shrink-0">
                <IndianRupee className="size-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-[11px] opacity-60 uppercase tracking-wide font-semibold">
                  UPI Payment Request
                </p>
                {message.paymentAmount != null && (
                  <p className="text-xl font-bold leading-tight">
                    ₹{message.paymentAmount.toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            </div>
            {message.paymentUpiId && (
              <div className="text-xs opacity-70 flex items-center gap-1">
                <span className="font-medium">To:</span>
                <span className="font-mono break-all">{message.paymentUpiId}</span>
              </div>
            )}
            {message.paymentNote && (
              <p className="mt-1 text-xs opacity-70 italic">{message.paymentNote}</p>
            )}
            <MetaRow />
          </div>
        )}

        {/* ── URL bubble (dedicated link card, Trinetra /api/analyze-url) ─ */}
        {message.messageType === "url" && message.content && (
          <div className={bubbleBase}>
            <a
              href={message.content.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 underline underline-offset-2 break-all hover:opacity-80"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3.5 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{message.content.trim()}</span>
            </a>
            <MetaRow />
          </div>
        )}

        {/* ── TEXT bubble (plain text; inline URLs become hyperlinks) ─────── */}
        {(message.messageType === "text" || (!message.messageType && message.content)) &&
          message.content && (
            <div className={bubbleBase}>
              <p className="whitespace-pre-wrap break-words">
                {renderTextWithLinks(message.content)}
              </p>
              <MetaRow />
            </div>
          )}

        {/* ── SAFE verification sub-line ──────────────────────────────── */}
        {isSafe && isAnalyzed && (
          <span className="text-[10px] text-emerald-500/70 px-1 select-none">
            {copy.verified}
          </span>
        )}
      </div>
    </div>
  )
}

// ── URL helper (client-safe) ──────────────────────────────────────────────────
function isValidUrl(str: string) {
  try {
    const url = new URL(str)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
