import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate a short random ID (collision-resistant for DB primary keys).
 * Uses crypto.randomUUID() which is available in Node 18+ and all browsers.
 */
export function nanoid(): string {
  return crypto.randomUUID().replace(/-/g, "")
}

/**
 * Format a date for display in the chat UI.
 * Returns "Today", "Yesterday", or the date string.
 */
export function formatMessageDate(date: Date | string): string {
  const d = new Date(date)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (msgDate.getTime() === today.getTime()) return "Today"
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday"

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/**
 * Format a timestamp for message bubbles (e.g. "10:32 AM").
 */
export function formatMessageTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/** Treat a user as online if their last heartbeat was within this window. */
export const PRESENCE_TTL_MS = 45_000

export function isRecentlyOnline(
  isOnline: boolean,
  lastSeen: Date | string | null,
): boolean {
  if (!lastSeen) return isOnline
  const age = Date.now() - new Date(lastSeen).getTime()
  if (age < PRESENCE_TTL_MS) return true
  return false
}

/**
 * Format lastSeen into a human-readable string.
 */
export function formatLastSeen(lastSeen: Date | string | null): string {
  if (!lastSeen) return "Last seen a while ago"
  const d = new Date(lastSeen)
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000)

  if (diffMins < 5) return "Last seen recently"

  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()

  if (sameDay) return `Last seen at ${time}`
  return `Last seen at ${formatMessageDate(d)}, ${time}`
}

/**
 * Get initials from a display name (for avatar fallback).
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
