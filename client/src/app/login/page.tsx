"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

import { GuestOnly } from "@/components/auth/guest-only"
import { useAuth } from "@/components/auth/auth-provider"
import {
  AuthError,
  AuthField,
  AuthMuted,
  AuthNotice,
  AuthPrimaryButton,
  AuthShell,
  authInputClassName,
} from "@/components/auth/auth-shell"
import { ApiError } from "@/lib/api"
import { authApi } from "@/lib/auth-api"
import { homePathForMe } from "@/lib/home-path"

export default function LoginPage() {
  return (
    <Suspense>
      <GuestOnly>
        <LoginForm />
      </GuestOnly>
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextOverride = searchParams.get("next")
  const emailPrefill = searchParams.get("email")
  const { applySession } = useAuth()
  const [email, setEmail] = useState(emailPrefill || "ghulam@acmelabs.io")
  const [password, setPassword] = useState(emailPrefill ? "" : "demo1234")
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (!email.trim()) {
      setError("Enter an email to continue.")
      return
    }
    setBusy(true)
    try {
      const session = await authApi.login(email.trim(), password)
      if (session.me) applySession(session.me)
      const home = homePathForMe(session.me)
      const next =
        nextOverride?.startsWith("/") && nextOverride !== "/dashboard"
          ? nextOverride
          : home
      setNotice(home === "/admin" ? "Signed in. Opening admin…" : "Signed in. Opening dashboard…")
      router.replace(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Sign-in failed. Is the API running?")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Access your company workspace on CompanyOS.">
      <form className="space-y-4" onSubmit={submit}>
        <AuthField label="Work email" id="email">
          <input
            id="email"
            type="email"
            autoComplete="username"
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className={authInputClassName}
          />
        </AuthField>

        {error ? <AuthError>{error}</AuthError> : null}
        {notice ? <AuthNotice>{notice}</AuthNotice> : null}

        <AuthPrimaryButton type="submit" loading={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </AuthPrimaryButton>
      </form>

      <div className="mt-5 space-y-3">
        <AuthMuted>
          Society seed: <code className="text-[color:var(--mkt-muted)]">ghulam@acmelabs.io</code> /{" "}
          <code className="text-[color:var(--mkt-muted)]">demo1234</code>
        </AuthMuted>
        <AuthMuted>
          Platform admin: use <code className="text-[color:var(--mkt-muted)]">ADMIN_EMAIL</code> /{" "}
          <code className="text-[color:var(--mkt-muted)]">ADMIN_PASSWORD</code> from{" "}
          <code className="text-[color:var(--mkt-muted)]">server/.env</code> → opens{" "}
          <code className="text-[color:var(--mkt-muted)]">/admin</code>
        </AuthMuted>
        <AuthMuted>
          No account?{" "}
          <Link
            href="/register"
            className="text-[color:var(--mkt-accent)] underline-offset-2 hover:underline"
          >
            Sign up
          </Link>
          {" · "}
          <Link
            href="/invite/demo-invite"
            className="text-[color:var(--mkt-accent)] underline-offset-2 hover:underline"
          >
            Accept invite
          </Link>
        </AuthMuted>
      </div>
    </AuthShell>
  )
}
