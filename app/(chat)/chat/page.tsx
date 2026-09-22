import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-utils"
import { getUserConversations } from "@/lib/services/conversation.service"
import ChatDashboard from "@/components/chat/ChatDashboard"

export default async function ChatPage() {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  const conversations = await getUserConversations(session.user.id)

  return (
    <ChatDashboard
      currentUser={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        username: (session.user as { username?: string }).username ?? null,
        image: session.user.image ?? null,
        isOnline: true,
        lastSeen: null,
      }}
      initialConversations={conversations}
    />
  )
}
