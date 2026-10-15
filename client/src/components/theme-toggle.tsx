"use client"

import { Moon, Sun } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme, ready } = useTheme()
  const isDark = theme === "dark"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "grid size-9 place-items-center rounded-xl border transition",
        "border-[color:var(--mkt-border)] bg-black/5 text-[color:var(--mkt-fg)] hover:bg-black/10",
        "dark:bg-white/5 dark:text-[#e8ecf0] dark:hover:bg-white/10",
        !ready && "invisible",
        className
      )}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
