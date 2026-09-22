"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search, X, Loader2 } from "lucide-react"
import type { Conversation, PublicUser } from "@/types"
import UserAvatar from "@/components/chat/UserAvatar"

interface Props {
  currentUser: PublicUser
  onClose: () => void
  onConversationStart: (conversation: Conversation) => void
}

export default function UserSearchModal({
  currentUser,
  onClose,
  onConversationStart,
}: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PublicUser[]>([])
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setError("")
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(
          `/api/users?q=${encodeURIComponent(query.trim())}`
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "Search failed")
        setResults(json.data ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed")
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleStartConversation = useCallback(
    async (otherUser: PublicUser) => {
      setStarting(otherUser.id)
      setError("")
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otherUserId: otherUser.id }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "Could not start conversation")

        onConversationStart(json.data)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      } finally {
        setStarting(null)
      }
    },
    [onConversationStart, onClose]
  )

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-20 pb-8"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="size-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username or email…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {loading && (
            <Loader2 className="size-4 text-muted-foreground animate-spin flex-shrink-0" />
          )}
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {error && (
            <p className="px-4 py-3 text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && query.trim() && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No users found for &quot;{query}&quot;
            </div>
          )}

          {!query.trim() && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type a name or email to search
            </div>
          )}

          {results.map((user) => (
            <button
              key={user.id}
              onClick={() => handleStartConversation(user)}
              disabled={starting === user.id}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors disabled:opacity-50"
            >
              <UserAvatar user={user} size="md" showOnline />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {user.username ?? user.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              {starting === user.id ? (
                <Loader2 className="size-4 text-muted-foreground animate-spin flex-shrink-0" />
              ) : (
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  Message
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
