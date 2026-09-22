"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signUp } from "@/lib/auth-client"
import { registerSchema } from "@/lib/validations/auth"
import { Loader2 } from "lucide-react"

export default function RegisterForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState("")
  const [loading, setLoading] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    // Clear individual field error on change
    if (errors[e.target.name]) {
      setErrors((prev) => ({ ...prev, [e.target.name]: "" }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError("")
    setErrors({})

    // Client-side validation
    const result = registerSchema.safeParse(form)
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[String(issue.path[0])] = issue.message
      })
      setErrors(fieldErrors)
      return
    }

    setLoading(true)
    try {
      const res = await signUp.email({
        email: form.email,
        password: form.password,
        name: form.username,         // Better Auth uses `name` as the display name
        username: form.username,     // additionalField
        callbackURL: "/chat",
      } as Parameters<typeof signUp.email>[0])

      if (res.error) {
        // Map common Better Auth error codes to user-friendly messages
        const msg = res.error.message ?? ""
        if (msg.toLowerCase().includes("email")) {
          setServerError("An account with that email already exists.")
        } else if (msg.toLowerCase().includes("username")) {
          setServerError("That username is already taken.")
        } else {
          setServerError(msg || "Registration failed. Please try again.")
        }
        return
      }

      router.push("/chat")
      router.refresh()
    } catch {
      setServerError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    {
      id: "username",
      label: "Username",
      type: "text",
      autoComplete: "username",
      placeholder: "yourhandle",
    },
    {
      id: "email",
      label: "Email",
      type: "email",
      autoComplete: "email",
      placeholder: "you@example.com",
    },
    {
      id: "password",
      label: "Password",
      type: "password",
      autoComplete: "new-password",
      placeholder: "Min. 8 characters",
    },
    {
      id: "confirmPassword",
      label: "Confirm password",
      type: "password",
      autoComplete: "new-password",
      placeholder: "Repeat password",
    },
  ] as const

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* Server error */}
      {serverError && (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      {fields.map(({ id, label, type, autoComplete, placeholder }) => (
        <div key={id} className="flex flex-col gap-1.5">
          <label
            htmlFor={id}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
          <input
            id={id}
            name={id}
            type={type}
            autoComplete={autoComplete}
            value={form[id]}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={loading}
            aria-invalid={!!errors[id]}
            aria-describedby={errors[id] ? `${id}-error` : undefined}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
          />
          {errors[id] && (
            <p id={`${id}-error`} className="text-xs text-destructive">
              {errors[id]}
            </p>
          )}
        </div>
      ))}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {loading ? "Creating account…" : "Create account"}
      </button>
    </form>
  )
}
