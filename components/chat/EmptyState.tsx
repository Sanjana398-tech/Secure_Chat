import { MessageSquare } from "lucide-react"

export default function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center bg-background">
      <div className="flex size-16 items-center justify-center rounded-3xl bg-card border border-border">
        <MessageSquare className="size-7 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Welcome to SecureChat
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
          Select a conversation to start messaging, or tap&nbsp;
          <span className="font-medium text-foreground">+</span> to find someone new.
        </p>
      </div>
    </div>
  )
}
