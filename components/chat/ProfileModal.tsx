"use client"

import { useState, useEffect, useRef } from "react"
import { X, Loader2 } from "lucide-react"
import type { PublicUser } from "@/types"
import UserAvatar from "@/components/chat/UserAvatar"

interface Props {
  currentUser: PublicUser
  onClose: () => void
  onProfileUpdate: (updated: PublicUser) => void
}

export default function ProfileModal({ currentUser, onClose, onProfileUpdate }: Props) {
  const [name, setName] = useState(currentUser.name ?? "")
  const [username, setUsername] = useState(currentUser.username ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Focus the name input on open
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  async function handleSave() {
    setError("")
    setSuccess(false)
    setSaving(true)

    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to update profile")

      onProfileUpdate(json.data)
      setSuccess(true)
      setTimeout(() => onClose(), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Edit Profile</h2>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-4 py-5 space-y-4">
          {/* Avatar + info */}
          <div className="flex flex-col items-center gap-2">
            <UserAvatar user={currentUser} size="lg" showOnline />
            <p className="text-xs text-muted-foreground">{currentUser.email}</p>
          </div>

          {/* Name field */}
          <div>
            <label htmlFor="profile-name" className="block text-xs font-medium text-foreground mb-1">
              Display Name
            </label>
            <input
              ref={nameRef}
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Your display name"
              maxLength={50}
              className="
                w-full rounded-lg border border-input bg-background
                px-3 py-2 text-sm text-foreground
                placeholder:text-muted-foreground
                focus:outline-none focus:ring-1 focus:ring-ring
              "
            />
          </div>

          {/* Username field */}
          <div>
            <label htmlFor="profile-username" className="block text-xs font-medium text-foreground mb-1">
              Username
            </label>
            <input
              id="profile-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="your_username"
              maxLength={30}
              className="
                w-full rounded-lg border border-input bg-background
                px-3 py-2 text-sm text-foreground
                placeholder:text-muted-foreground
                focus:outline-none focus:ring-1 focus:ring-ring
              "
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Letters, numbers, and underscores only
            </p>
          </div>

          {/* Status messages */}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {success && (
            <p className="text-xs text-emerald-400">Profile updated!</p>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="
              w-full flex items-center justify-center gap-2 rounded-lg
              bg-primary text-primary-foreground text-sm font-medium
              py-2.5 transition-all
              hover:opacity-90 active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
