"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Suspense, useState } from "react"

import { GuestOnly } from "@/components/auth/guest-only"
import { useAuth } from "@/components/auth/auth-provider"
import {
  AuthError,
  AuthField,
  AuthMuted,
  AuthPrimaryButton,
  AuthShell,
  authInputClassName,
} from "@/components/auth/auth-shell"
import { ApiError } from "@/lib/api"
import { authApi } from "@/lib/auth-api"

export default function RegisterOwnerPage() {
  return (
    <Suspense>
      <GuestOnly>
        <RegisterForm />
      </GuestOnly>
    </Suspense>
  )
}




function RegisterForm() {
  const router = useRouter()
  const { applySession } = useAuth()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [orgName, setOrgName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const session = await authApi.registerOwner({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        organization_name: orgName.trim(),
      })
      if (session.me) applySession(session.me)
      router.replace("/dashboard")
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Registration failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Sign up"
      subtitle="Create your society. You become the owner and can invite members next."
    >
      <form className="space-y-4" onSubmit={submit}>
        <AuthField label="Society / company name" id="org">
          <input
            id="org"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            className={authInputClassName}
          />
        </AuthField>
        <AuthField label="Your full name" id="name">
          <input
            id="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className={authInputClassName}
          />
        </AuthField>
        <AuthField label="Work email" id="email">
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={authInputClassName}
          />
        </AuthField>
        <AuthField label="Password" id="password">
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            className={authInputClassName}
          />
        </AuthField>

        {error ? <AuthError>{error}</AuthError> : null}

        <AuthPrimaryButton type="submit" loading={busy}>
          {busy ? "Creating…" : "Create society"}
        </AuthPrimaryButton>
      </form>

      <div className="mt-5">
        <AuthMuted>
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-[color:var(--mkt-accent)] underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </AuthMuted>
      </div>
    </AuthShell>
  )
}
