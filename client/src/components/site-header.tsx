"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { BrandWordmark } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/#features", label: "Features" },
  { href: "/platform", label: "Platform" },
  { href: "/#usage", label: "How to use" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading, isAuthenticated, logout } = useAuth();

  function close() {
    setIsOpen(false);
  }

  function handleSignOut() {
    logout();
    close();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--mkt-border)] bg-[color:var(--mkt-header)] backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-18 sm:px-6 lg:px-8">
        <Link href="/" className="min-w-0" onClick={close} aria-label="CompanyOS home">
          <BrandWordmark />
        </Link>

        <nav className="hidden items-center gap-5 md:flex lg:gap-7">
          {navItems.map((item) => {
            const active =
              item.href === pathname ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-medium transition",
                  active
                    ? "text-[color:var(--mkt-accent)]"
                    : "text-[color:var(--mkt-fg)]/75 hover:text-[color:var(--mkt-fg)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}

          <ThemeToggle />

          {!loading && isAuthenticated ? (
            <>
              <span className="max-w-[10rem] truncate text-sm text-[color:var(--mkt-muted)]">
                {me?.full_name || me?.email}
              </span>
              <Link
                href="/dashboard"
                className="rounded-xl bg-[color:var(--mkt-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--mkt-on-accent)] transition hover:bg-[color:var(--mkt-accent-bright)]"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-sm text-[color:var(--mkt-muted)] transition hover:text-[color:var(--mkt-fg)]"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(
                  "text-sm font-medium transition",
                  pathname === "/login"
                    ? "text-[color:var(--mkt-accent)]"
                    : "text-[color:var(--mkt-fg)]/75 hover:text-[color:var(--mkt-fg)]",
                )}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-[color:var(--mkt-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--mkt-on-accent)] transition hover:bg-[color:var(--mkt-accent-bright)]"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            className="grid size-10 place-items-center rounded-lg text-[color:var(--mkt-fg)]"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle navigation"
          >
            {isOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <nav className="border-t border-[color:var(--mkt-border)] bg-[color:var(--mkt-bg-elevated)] px-5 py-4 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="rounded-lg px-3 py-3 text-sm text-[color:var(--mkt-fg)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                {item.label}
              </Link>
            ))}

            {!loading && isAuthenticated ? (
              <>
                <p className="px-3 pt-2 text-xs text-[color:var(--mkt-muted)]">
                  Signed in as {me?.full_name || me?.email}
                </p>
                <Link
                  href="/dashboard"
                  onClick={close}
                  className="mt-2 rounded-xl bg-[color:var(--mkt-accent)] px-4 py-3 text-center text-sm font-semibold text-[color:var(--mkt-on-accent)]"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg px-3 py-3 text-left text-sm text-[color:var(--mkt-fg)] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={close}
                  className="rounded-lg px-3 py-3 text-sm text-[color:var(--mkt-fg)] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={close}
                  className="mt-2 rounded-xl bg-[color:var(--mkt-accent)] px-4 py-3 text-center text-sm font-semibold text-[color:var(--mkt-on-accent)]"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
