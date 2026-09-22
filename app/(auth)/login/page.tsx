import { Metadata } from "next"
import Link from "next/link"
import LoginForm from "@/components/auth/LoginForm"

export const metadata: Metadata = {
  title: "SecureChat — Sign in",
}

export default function LoginPage() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-card-foreground">Sign in</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back. Enter your credentials to continue.
        </p>
      </div>

      <LoginForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}
