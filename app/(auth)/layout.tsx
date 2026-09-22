import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "SecureChat — Sign in",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh bg-background flex flex-col items-center justify-center px-4 py-12">
      {/* Brand header */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="size-10 rounded-xl bg-primary flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="size-6 text-primary-foreground"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          SecureChat
        </h1>
        <p className="text-xs text-muted-foreground">
          Simple conversations. Built for safer communication.
        </p>
      </div>

      {/* Form card */}
      <div className="w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}
