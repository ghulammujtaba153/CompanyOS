"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

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
import { authApi, type InvitePeek } from "@/lib/auth-api"

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const { applySession, me, loading: authLoading } = useAuth()
  const [peek, setPeek] = useState<InvitePeek | null>(null)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await authApi.peekInvite(params.token)
        if (!cancelled) {
          setPeek(data)
          setName(data.full_name || "")
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.detail : "Invite not found")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params.token])

  const userExists = Boolean(peek?.user_exists)
  const signedInAsInvitee =
    Boolean(me?.email) && Boolean(peek?.email) && me!.email.toLowerCase() === peek!.email.toLowerCase()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (password.length < 6) {
      setError(userExists ? "Enter your account password." : "Use at least 6 characters.")
      return
    }
    if (!userExists && password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    if (!userExists && !name.trim()) {
      setError("Enter your full name.")
      return
    }
    setBusy(true)
    try {
      const session = await authApi.acceptInvite({
        token: params.token,
        full_name: name.trim(),
        password,
      })
      if (session.me) applySession(session.me)
      setNotice("You're in. Opening dashboard…")
      router.replace("/dashboard")
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not accept invite")
    } finally {
      setBusy(false)
    }
  }

  async function joinWhileSignedIn() {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const session = await authApi.joinInvite(params.token)
      if (session.me) applySession(session.me)
      setNotice("Joined. Opening dashboard…")
      router.replace("/dashboard")
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not join")
    } finally {
      setBusy(false)
    }
  }

  const orgLabel = peek?.organization_name ?? "CompanyOS"
  const subtitle = peek
    ? `${peek.role} invite for ${peek.email}`
    : `Invite token · ${params.token}`

  return (
    <AuthShell title={`Join ${orgLabel}`} subtitle={subtitle}>
      <p className="mb-5 text-sm leading-6 text-[color:var(--mkt-muted)]">
        {userExists
          ? "You already have a CompanyOS account. Sign in with your password to join this society."
          : "Create your account to join this society."}
      </p>

      {!authLoading && signedInAsInvitee ? (
        <div className="space-y-4">
          {error ? <AuthError>{error}</AuthError> : null}
          {notice ? <AuthNotice>{notice}</AuthNotice> : null}
          <AuthPrimaryButton type="button" loading={busy} onClick={() => void joinWhileSignedIn()}>
            {busy ? "Joining…" : `Join ${orgLabel}`}
          </AuthPrimaryButton>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          {!userExists ? (
            <AuthField label="Full name" id="name">
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={authInputClassName}
              />
            </AuthField>
          ) : null}
          <AuthField label={userExists ? "Your password" : "Create password"} id="password">
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={userExists ? "current-password" : "new-password"}
              className={authInputClassName}
            />
          </AuthField>
          {!userExists ? (
            <AuthField label="Confirm password" id="confirm">
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className={authInputClassName}
              />
            </AuthField>
          ) : null}

          {error ? <AuthError>{error}</AuthError> : null}
          {notice ? <AuthNotice>{notice}</AuthNotice> : null}

          <AuthPrimaryButton type="submit" loading={busy} disabled={Boolean(error && !peek)}>
            {busy ? "Joining…" : userExists ? "Sign in & join" : "Create account & join"}
          </AuthPrimaryButton>
        </form>
      )}

      <div className="mt-5 space-y-2">
        {userExists && !signedInAsInvitee ? (
          <AuthMuted>
            Prefer the sign-in page?{" "}
            <Link
              href={`/login?next=${encodeURIComponent(`/invite/${params.token}`)}&email=${encodeURIComponent(peek?.email ?? "")}`}
              className="text-[color:var(--mkt-accent)] underline-offset-2 hover:underline"
            >
              Sign in
            </Link>
            , then return here to join.
          </AuthMuted>
        ) : null}
        {!userExists ? (
          <AuthMuted>
            Already have an account under a different email?{" "}
            <Link
              href="/login"
              className="text-[color:var(--mkt-accent)] underline-offset-2 hover:underline"
            >
              Sign in
            </Link>
          </AuthMuted>
        ) : null}
      </div>
    </AuthShell>
  )
}
