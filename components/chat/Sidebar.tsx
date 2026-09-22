"use client"

import { useState } from "react"
import { Search, Plus, LogOut, Pencil } from "lucide-react"
import type { Conversation, PublicUser } from "@/types"
import ConversationList from "@/components/chat/ConversationList"
import UserSearchModal from "@/components/chat/UserSearchModal"
import ProfileModal from "@/components/chat/ProfileModal"
import UserAvatar from "@/components/chat/UserAvatar"
import { signOut } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/localization"

interface Props {
  currentUser: PublicUser
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: (conversation: Conversation) => void
  onProfileUpdate: (updated: PublicUser) => void
  language: LanguageCode
  onLanguageChange: (language: LanguageCode) => void
  voiceAlertsEnabled: boolean
  onVoiceAlertsChange: (enabled: boolean) => void
}

export default function Sidebar({
  currentUser,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onProfileUpdate,
  language,
  onLanguageChange,
  voiceAlertsEnabled,
  onVoiceAlertsChange,
}: Props) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)

  // Filter conversations by the other user's name
  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true
    const name = c.otherUser.username ?? c.otherUser.name ?? ""
    return name.toLowerCase().includes(search.toLowerCase())
  })

  async function handleSignOut() {
    await signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <>
      <div className="flex h-full flex-col bg-sidebar">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="size-4 text-sidebar-primary-foreground"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span className="font-semibold text-sidebar-foreground text-sm tracking-tight">
              SecureChat
            </span>
          </div>

          <button
            onClick={() => setShowSearchModal(true)}
            title="New conversation"
            className="flex size-8 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Search within conversations */}
        <div className="px-3 py-3 border-b border-sidebar-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="h-8 w-full rounded-lg bg-sidebar-accent pl-8 pr-3 text-xs text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={filtered}
            activeConversationId={activeConversationId}
            currentUserId={currentUser.id}
            onSelect={onSelectConversation}
            searchActive={!!search.trim()}
          />
        </div>

        {/* Current user profile strip */}
        <div className="border-t border-sidebar-border px-3 py-3">
          <label className="mb-3 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
            <span>Detection language</span>
            <select
              value={language}
              onChange={(event) => onLanguageChange(event.target.value as LanguageCode)}
              className="h-7 rounded-md bg-sidebar-accent px-2 text-[11px] text-sidebar-foreground focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
              aria-label="Detection language"
            >
              {SUPPORTED_LANGUAGES.map((item) => (
                <option key={item.code} value={item.code}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="mb-3 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
            <span>Automatic voice alerts</span>
            <input
              type="checkbox"
              checked={voiceAlertsEnabled}
              onChange={(event) => onVoiceAlertsChange(event.target.checked)}
              className="size-3.5 accent-[--sidebar-primary]"
              aria-label="Automatic voice alerts"
            />
          </label>
          <div className="flex items-center gap-3">
            <UserAvatar user={currentUser} size="sm" showOnline />
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {currentUser.username ?? currentUser.name}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {currentUser.email}
              </p>
            </div>
            <button
              onClick={() => setShowProfileModal(true)}
              title="Edit profile"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* User search modal */}
      {showSearchModal && (
        <UserSearchModal
          currentUser={currentUser}
          onClose={() => setShowSearchModal(false)}
          onConversationStart={onNewConversation}
        />
      )}

      {/* Profile edit modal */}
      {showProfileModal && (
        <ProfileModal
          currentUser={currentUser}
          onClose={() => setShowProfileModal(false)}
          onProfileUpdate={(updated) => {
            onProfileUpdate(updated)
            setShowProfileModal(false)
          }}
        />
      )}
    </>
  )
}
