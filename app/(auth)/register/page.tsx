import { Metadata } from "next"
import Link from "next/link"
import RegisterForm from "@/components/auth/RegisterForm"

export const metadata: Metadata = {
  title: "SecureChat — Create account",
}

export default function RegisterPage() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-card-foreground">
          Create account
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Join SecureChat. It only takes a moment.
        </p>
      </div>

      <RegisterForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
