"use client"

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

import { BrandMark } from "@/components/brand-logo"
import { MarketingShell } from "@/components/marketing/marketing-shell"
import { LiquidGlass } from "@/components/landing/liquid-glass"
import { cn } from "@/lib/utils"

export function AuthShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="pointer-events-none absolute left-1/2 top-10 size-[280px] -translate-x-1/2 rounded-full bg-[#b8f34a]/15 blur-[110px] sm:size-[380px]" />
        <div className="relative mx-auto w-full max-w-md">
          <div className="mb-6 text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mkt-accent)]/30 bg-[color:var(--mkt-accent)]/10 px-3.5 py-1.5 text-xs font-medium text-[color:var(--mkt-accent)]">
              <BrandMark className="size-4" /> CompanyOS
            </p>
            <h1 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(1.75rem,5vw,2.25rem)] tracking-[-0.04em] text-[color:var(--mkt-fg)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-6 text-[color:var(--mkt-muted)]">{subtitle}</p>
            ) : null}
          </div>
          <LiquidGlass className="rounded-3xl p-6 sm:p-8">
            {children}
          </LiquidGlass>
        </div>
      </section>
    </MarketingShell>
  )
}

export function AuthField({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-[color:var(--mkt-fg)]">
        {label}
      </label>
      {children}
    </div>
  )
}

export const authInputClassName =
  "h-11 w-full rounded-xl border border-[color:var(--mkt-border)] bg-[color:var(--mkt-bg-elevated)] px-3 text-sm text-[color:var(--mkt-fg)] outline-none placeholder:text-[color:var(--mkt-subtle)] focus:border-[color:var(--mkt-accent)]/60 dark:bg-[#0d1118]"

type AuthButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
}

export function AuthPrimaryButton({
  children,
  className,
  loading = false,
  disabled,
  ...props
}: AuthButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[color:var(--mkt-accent)] px-5 py-3.5 text-sm font-semibold text-[color:var(--mkt-on-accent)] transition hover:bg-[color:var(--mkt-accent-bright)] disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  )
}

export function AuthSecondaryButton({
  children,
  className,
  loading = false,
  disabled,
  ...props
}: AuthButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[color:var(--mkt-border)] bg-black/5 px-5 py-3.5 text-sm font-medium text-[color:var(--mkt-fg)] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/5 dark:hover:bg-white/10",
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  )
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
      {children}
    </p>
  )
}

export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-[color:var(--mkt-accent)]/25 bg-[color:var(--mkt-accent)]/10 px-3 py-2 text-sm text-[color:var(--mkt-accent)]">
      {children}
    </p>
  )
}

export function AuthMuted({ children }: { children: ReactNode }) {
  return <p className="text-center text-xs leading-5 text-[color:var(--mkt-subtle)]">{children}</p>
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-[color:var(--mkt-accent)] underline-offset-2 hover:underline">
      {children}
    </a>
  )
}
