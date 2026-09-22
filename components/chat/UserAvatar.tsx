import Image from "next/image"
import type { PublicUser } from "@/types"
import { getInitials } from "@/lib/utils"

interface Props {
  user: Pick<PublicUser, "name" | "username" | "image" | "isOnline">
  size?: "sm" | "md" | "lg"
  showOnline?: boolean
  /** Tailwind border class for the online-dot ring. Defaults to "border-sidebar". */
  dotBorder?: string
}

const sizeMap = {
  sm: { container: "size-8", text: "text-xs", dot: "size-2" },
  md: { container: "size-9", text: "text-sm", dot: "size-2.5" },
  lg: { container: "size-12", text: "text-base", dot: "size-3" },
}

export default function UserAvatar({ user, size = "md", showOnline = false, dotBorder = "border-sidebar" }: Props) {
  const { container, text, dot } = sizeMap[size]
  const initials = getInitials(user.username ?? user.name ?? "?")

  return (
    <div className="relative flex-shrink-0">
      {user.image ? (
        <div className={`${container} rounded-full overflow-hidden`}>
          <Image
            src={user.image}
            alt={user.username ?? user.name ?? "User"}
            width={48}
            height={48}
            className="object-cover w-full h-full"
          />
        </div>
      ) : (
        <div
          className={`${container} rounded-full bg-sidebar-primary flex items-center justify-center select-none`}
        >
          <span className={`${text} font-semibold text-sidebar-primary-foreground`}>
            {initials}
          </span>
        </div>
      )}

      {showOnline && (
        <span
          className={`
            absolute bottom-0 right-0 ${dot} rounded-full border-2 ${dotBorder}
            ${user.isOnline ? "bg-emerald-500" : "bg-zinc-500"}
          `}
          aria-label={user.isOnline ? "Online" : "Offline"}
        />
      )}
    </div>
  )
}
