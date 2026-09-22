"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  Send,
  Paperclip,
  Mic,
  MicOff,
  IndianRupee,
  X,
  Image as ImageIcon,
  Link,
  Loader2,
} from "lucide-react"
import { MAX_MESSAGE_LENGTH } from "@/lib/validations/message"
import type { OutgoingMessagePayload } from "@/types"

interface Props {
  onSend: (payload: OutgoingMessagePayload) => Promise<boolean>
  conversationId: string
}

type ComposerMode = "text" | "payment" | "url"

const TYPING_DEBOUNCE_MS = 2000
const MAX_RECORDING_SEC = 120 // 2 minutes

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function isValidUrl(str: string) {
  try {
    const url = new URL(str.trim())
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MessageInput({ onSend, conversationId }: Props) {
  // ── Text state ──────────────────────────────────────────────────────────
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Composer mode ──────────────────────────────────────────────────────
  const [mode, setMode] = useState<ComposerMode>("text")

  // ── Image state ────────────────────────────────────────────────────────
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageCaption, setImageCaption] = useState("")
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Voice state ────────────────────────────────────────────────────────
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [voiceMediaUrl, setVoiceMediaUrl] = useState<string | null>(null)
  const [voiceDuration, setVoiceDuration] = useState<number>(0)
  const [uploadingVoice, setUploadingVoice] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Payment state ──────────────────────────────────────────────────────
  const [payAmount, setPayAmount] = useState("")
  const [payUpiId, setPayUpiId] = useState("")
  const [payNote, setPayNote] = useState("")

  // ── URL state ──────────────────────────────────────────────────────────
  const [urlInput, setUrlInput] = useState("")

  // ── Typing indicator ──────────────────────────────────────────────────
  const typingRef = useRef(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmed = text.trim()
  const canSendText =
    mode === "text" &&
    trimmed.length > 0 &&
    trimmed.length <= MAX_MESSAGE_LENGTH &&
    !sending
  const canSendImage = mode === "text" && !!imageUrl && !sending && !uploadingImage
  const canSendVoice =
    mode === "text" && !!voiceMediaUrl && !sending && !uploadingVoice && !recording
  const canSendPayment =
    mode === "payment" &&
    !!payAmount &&
    Number(payAmount) > 0 &&
    !!payUpiId &&
    !sending
  const canSendUrl =
    mode === "url" && isValidUrl(urlInput) && !sending

  // ── Auto-resize textarea ───────────────────────────────────────────────
  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }

  // ── Typing indicator helpers ───────────────────────────────────────────
  const sendTypingState = useCallback(
    async (typing: boolean) => {
      try {
        await fetch(`/api/conversations/${conversationId}/typing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typing }),
        })
      } catch {
        /* ignore */
      }
    },
    [conversationId],
  )

  useEffect(() => {
    return () => {
      if (typingRef.current) sendTypingState(false)
    }
  }, [sendTypingState])

  function handleTyping() {
    if (!typingRef.current) {
      typingRef.current = true
      sendTypingState(true)
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      typingRef.current = false
      sendTypingState(false)
    }, TYPING_DEBOUNCE_MS)
  }

  function stopTyping() {
    if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null }
    if (typingRef.current) { typingRef.current = false; sendTypingState(false) }
  }

  // ── Image upload ───────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    // local preview
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    setUploadingImage(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("kind", "image")
      const res = await fetch("/api/upload", { method: "POST", body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Upload failed")
      setImageUrl(json.data.url)
    } catch (err) {
      setSendError((err as Error).message ?? "Image upload failed")
      setImagePreview(null)
    } finally {
      setUploadingImage(false)
    }
  }

  function clearImage() {
    setImagePreview(null)
    setImageUrl(null)
    setImageCaption("")
  }

  // ── Voice recording ────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      setRecordingSeconds(0)
      setAudioPreviewUrl(null)
      setVoiceMediaUrl(null)

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        const localUrl = URL.createObjectURL(blob)
        setAudioPreviewUrl(localUrl)

        // Upload
        setUploadingVoice(true)
        try {
          const form = new FormData()
          form.append("file", blob, "voice.webm")
          form.append("kind", "voice")
          const res = await fetch("/api/upload", { method: "POST", body: form })
          const json = await res.json()
          if (!res.ok) throw new Error(json.error ?? "Upload failed")
          setVoiceMediaUrl(json.data.url)
          setVoiceDuration(recordingSeconds)
        } catch (err) {
          setSendError((err as Error).message ?? "Voice upload failed")
          setAudioPreviewUrl(null)
        } finally {
          setUploadingVoice(false)
        }
      }

      recorder.start()
      setRecording(true)

      // Timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s + 1 >= MAX_RECORDING_SEC) stopRecording()
          return s + 1
        })
      }, 1000)
    } catch {
      setSendError("Microphone access denied")
    }
  }

  function stopRecording() {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function clearVoice() {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    setAudioPreviewUrl(null)
    setVoiceMediaUrl(null)
    setVoiceDuration(0)
    setRecordingSeconds(0)
  }

  // ── Send ───────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    setSendError("")

    // ── Image ──
    if (imageUrl) {
      setSending(true)
      const ok = await onSend({
        messageType: "image",
        content: imageCaption.trim(),
        mediaUrl: imageUrl,
      })
      setSending(false)
      if (ok) { clearImage(); setText(""); autoResize() }
      else setSendError("Failed to send image. Try again.")
      return
    }

    // ── Voice ──
    if (voiceMediaUrl) {
      setSending(true)
      const ok = await onSend({
        messageType: "voice",
        content: "",
        mediaUrl: voiceMediaUrl,
        mediaDuration: voiceDuration,
      })
      setSending(false)
      if (ok) clearVoice()
      else setSendError("Failed to send voice note. Try again.")
      return
    }

    // ── Payment ──
    if (mode === "payment") {
      if (!canSendPayment) return
      setSending(true)
      const ok = await onSend({
        messageType: "payment",
        content: "",
        paymentAmount: Number(payAmount),
        paymentUpiId: payUpiId.trim(),
        paymentNote: payNote.trim(),
      })
      setSending(false)
      if (ok) { setPayAmount(""); setPayUpiId(""); setPayNote(""); setMode("text") }
      else setSendError("Failed to send payment request. Try again.")
      return
    }

    // ── URL ──
    if (mode === "url") {
      if (!canSendUrl) return
      setSending(true)
      const ok = await onSend({
        messageType: "url",
        content: urlInput.trim(),
      })
      setSending(false)
      if (ok) { setUrlInput(""); setMode("text") }
      else setSendError("Failed to send link. Try again.")
      return
    }

    // ── Text ──
    if (!canSendText) return
    setSending(true)
    const content = trimmed
    setText("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    stopTyping()

    const ok = await onSend({ messageType: "text", content })
    if (!ok) {
      setSendError("Failed to send. Try again.")
      setText(content)
    }
    setSending(false)
    textareaRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, imageCaption, voiceMediaUrl, voiceDuration, mode, payAmount, payUpiId, payNote, urlInput, canSendText, canSendPayment, canSendUrl, trimmed, onSend])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const remaining = MAX_MESSAGE_LENGTH - text.length
  const showCounter = text.length > MAX_MESSAGE_LENGTH - 200
  const anySending = sending || uploadingImage || uploadingVoice
  const canSendAny = canSendText || canSendImage || canSendVoice || canSendPayment || canSendUrl

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="border-t border-border bg-card px-3 py-3 flex-shrink-0">
      {sendError && (
        <p className="mb-2 text-xs text-destructive px-1">{sendError}</p>
      )}

      {/* ── Image preview ─────────────────────────────────────────────── */}
      {imagePreview && (
        <div className="mb-2 relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt="Preview"
            className="max-h-40 max-w-[240px] rounded-xl object-cover border border-border"
          />
          {uploadingImage && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
              <Loader2 className="size-5 text-white animate-spin" />
            </div>
          )}
          <button
            onClick={clearImage}
            className="absolute -top-1.5 -right-1.5 size-5 flex items-center justify-center rounded-full bg-destructive text-white"
            aria-label="Remove image"
          >
            <X className="size-3" />
          </button>
          {/* Caption field */}
          {!uploadingImage && imageUrl && (
            <input
              type="text"
              value={imageCaption}
              onChange={(e) => setImageCaption(e.target.value)}
              placeholder="Add a caption…"
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          )}
        </div>
      )}

      {/* ── Voice preview ─────────────────────────────────────────────── */}
      {(recording || audioPreviewUrl) && !imagePreview && (
        <div className="mb-2 flex items-center gap-3 px-3 py-2 rounded-xl bg-accent/30 border border-border">
          {recording ? (
            <>
              <span className="size-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-sm text-foreground font-mono">
                {formatDuration(recordingSeconds)}
              </span>
              <span className="text-xs text-muted-foreground">Recording…</span>
              <button
                onClick={stopRecording}
                className="ml-auto text-xs text-destructive hover:text-destructive/80 font-medium"
              >
                Stop
              </button>
            </>
          ) : (
            <>
              {uploadingVoice ? (
                <Loader2 className="size-4 text-muted-foreground animate-spin" />
              ) : (
                <audio
                  src={audioPreviewUrl ?? undefined}
                  controls
                  className="h-8 flex-1 min-w-0"
                  style={{ maxWidth: "200px" }}
                />
              )}
              <span className="text-xs text-muted-foreground ml-1">
                {uploadingVoice ? "Uploading…" : formatDuration(voiceDuration)}
              </span>
              <button
                onClick={clearVoice}
                className="ml-auto text-muted-foreground hover:text-foreground"
                aria-label="Discard voice note"
              >
                <X className="size-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Payment composer ──────────────────────────────────────────── */}
      {mode === "payment" && (
        <div className="mb-2 p-3 rounded-xl bg-accent/20 border border-border space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1">
              <IndianRupee className="size-3.5 text-emerald-400" />
              UPI Payment Request
            </span>
            <button
              onClick={() => setMode("text")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close payment form"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="Amount"
                min="1"
                max="10000000"
                className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <input
              type="text"
              value={payUpiId}
              onChange={(e) => setPayUpiId(e.target.value)}
              placeholder="UPI ID (e.g. name@upi)"
              className="flex-[2] px-3 py-1.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <input
            type="text"
            value={payNote}
            onChange={(e) => setPayNote(e.target.value)}
            placeholder="Note (optional)"
            maxLength={200}
            className="w-full px-3 py-1.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* ── URL composer ──────────────────────────────────────────────── */}
      {mode === "url" && (
        <div className="mb-2 flex items-center gap-2">
          <Link className="size-4 text-muted-foreground flex-shrink-0" />
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste a link… (https://…)"
            className="flex-1 px-3 py-1.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => { if (e.key === "Enter") handleSend() }}
            autoFocus
          />
          <button
            onClick={() => { setUrlInput(""); setMode("text") }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cancel link"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* ── Main input row ────────────────────────────────────────────── */}
      {mode === "text" && !imagePreview && !audioPreviewUrl && !recording && (
        <div className="flex items-end gap-2">
          {/* Attachment toolbar */}
          <div className="flex items-end gap-0.5 flex-shrink-0">
            {/* Image picker */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={anySending}
              aria-label="Attach image"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
            >
              <ImageIcon className="size-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Mic */}
            <button
              onClick={startRecording}
              disabled={anySending || recording}
              aria-label="Record voice message"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
            >
              <Mic className="size-4" />
            </button>

            {/* Payment */}
            <button
              onClick={() => setMode("payment")}
              disabled={anySending}
              aria-label="Send payment request"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
            >
              <IndianRupee className="size-4" />
            </button>

            {/* Link */}
            <button
              onClick={() => setMode("url")}
              disabled={anySending}
              aria-label="Share a link"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
            >
              <Link className="size-4" />
            </button>
          </div>

          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                autoResize()
                handleTyping()
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH + 1}
              disabled={anySending}
              aria-label="Message input"
              className="
                w-full resize-none rounded-2xl border border-input bg-background
                px-4 py-2 text-sm text-foreground leading-relaxed
                placeholder:text-muted-foreground
                focus:outline-none focus:ring-1 focus:ring-ring
                disabled:opacity-50
                max-h-40 overflow-y-auto
              "
              style={{ height: "auto" }}
            />
            {showCounter && (
              <span
                className={`absolute bottom-2 right-3 text-[10px] select-none pointer-events-none ${
                  remaining < 0 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {remaining}
              </span>
            )}
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSendAny || anySending}
            aria-label="Send message"
            className="
              flex size-9 flex-shrink-0 items-center justify-center rounded-full
              bg-primary text-primary-foreground
              transition-all
              hover:opacity-90 active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {anySending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>
      )}

      {/* Send button when an attachment / special mode is active */}
      {(imagePreview || audioPreviewUrl || recording || mode === "payment" || mode === "url") && (
        <div className="flex justify-end mt-2">
          <button
            onClick={handleSend}
            disabled={!canSendAny || anySending}
            aria-label="Send"
            className="
              flex items-center gap-2 px-4 py-2 rounded-full
              bg-primary text-primary-foreground text-sm font-medium
              transition-all hover:opacity-90 active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {anySending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send
          </button>
        </div>
      )}

      {/* Hint */}
      {mode === "text" && !imagePreview && !audioPreviewUrl && !recording && (
        <p className="mt-1.5 text-[10px] text-muted-foreground px-1">
          Enter to send &nbsp;·&nbsp; Shift + Enter for new line
        </p>
      )}
    </div>
  )
}
