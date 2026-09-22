import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-utils"

export const metadata: Metadata = {
  title: "SecureChat",
}

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-side auth guard — belt-and-suspenders alongside middleware
  const session = await getSession()
  if (!session?.user) {
    redirect("/login")
  }

  return <>{children}</>
}
