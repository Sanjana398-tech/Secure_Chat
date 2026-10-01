"use client"

import type { Message } from "@/types"

export type DeviceAlertPermission = NotificationPermission | "unsupported"

let alertAudioContext: AudioContext | null = null

export function isProtectedIncomingMessage(
  message: Pick<Message, "senderId" | "receiverId" | "trinetraLocked">,
  currentUserId: string,
): boolean {
  return message.receiverId === currentUserId &&
    message.senderId !== currentUserId &&
    message.trinetraLocked
}

export function getDeviceAlertPermission(): DeviceAlertPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  return window.Notification.permission
}

export async function requestDeviceAlertPermission(): Promise<DeviceAlertPermission> {
  if (getDeviceAlertPermission() === "unsupported") return "unsupported"
  try {
    return await window.Notification.requestPermission()
  } catch {
    return getDeviceAlertPermission()
  }
}

export async function prepareProtectionAlertSound(): Promise<boolean> {
  if (typeof window === "undefined" || !window.AudioContext) return false

  try {
    alertAudioContext ??= new window.AudioContext()
    if (alertAudioContext.state !== "running") await alertAudioContext.resume()
    return alertAudioContext.state === "running"
  } catch {
    return false
  }
}

export function notifyProtectedMessage(
  conversationId: string,
  messageId: string,
  onClick: () => void,
): boolean {
  if (getDeviceAlertPermission() !== "granted") return false

  playProtectionAlertBeep()
  try {
    const notification = new window.Notification("Trinetra Protection Alert", {
      body: "A message was flagged as potentially harmful. Open Secure Chat to review it.",
      tag: `trinetra-${conversationId}-${messageId}`,
      requireInteraction: true,
    })
    notification.onclick = () => {
      window.focus()
      onClick()
      notification.close()
    }
    return true
  } catch {
    return false
  }
}

function playProtectionAlertBeep(): void {
  if (!alertAudioContext || alertAudioContext.state === "closed") return

  void alertAudioContext.resume().then(() => {
    if (!alertAudioContext || alertAudioContext.state !== "running") return

    const oscillator = alertAudioContext.createOscillator()
    const gain = alertAudioContext.createGain()
    const now = alertAudioContext.currentTime
    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(880, now)
    gain.gain.setValueAtTime(0.16, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
    oscillator.connect(gain)
    gain.connect(alertAudioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.2)
  }).catch(() => undefined)
}
