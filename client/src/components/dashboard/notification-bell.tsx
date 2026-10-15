"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { Bell, CheckCheck } from "lucide-react"

import { useNotifications } from "@/components/dashboard/notifications-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const KIND_LABEL: Record<string, string> = {
  approval: "Approval",
  leave: "Leave",
  work: "Work",
  hiring: "Hiring",
  offer: "Offer",
  finance: "Finance",
  governance: "Governance",
  document: "Docs",
  system: "System",
}

function relativeTime(iso: string) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const sec = Math.round((Date.now() - t) / 1000)
  if (sec < 60) return "just now"
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}

export function NotificationBell() {
  const router = useRouter()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { items, unreadCount, markRead, markAllRead, connected, loading } = useNotifications()
  const preview = items.slice(0, 8)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--mkt-accent,#5f8f12)] px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full right-0 z-50 mt-2 w-[min(100vw-2rem,24rem)] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
            <div className="text-sm font-semibold">
              Notifications
              {connected ? (
                <span className="ml-2 text-[10px] font-normal text-emerald-600">Live</span>
              ) : (
                <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                  {loading ? "Syncing…" : "Polling"}
                </span>
              )}
            </div>
            {unreadCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => void markAllRead()}
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </Button>
            ) : null}
          </div>

          <div className="max-h-[min(70vh,22rem)] overflow-y-auto">
            {preview.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </p>
            ) : (
              <ul>
                {preview.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-accent",
                        note.unread && "bg-accent/40"
                      )}
                      onClick={() => {
                        if (note.unread) void markRead([note.id])
                        setOpen(false)
                        if (note.href) router.push(note.href)
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
                            {KIND_LABEL[note.kind] || note.kind}
                          </Badge>
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                            {relativeTime(note.createdAt)}
                          </span>
                        </div>
                        <p className={cn("mt-1 text-sm", note.unread && "font-medium")}>
                          {note.title}
                        </p>
                        {note.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {note.body}
                          </p>
                        ) : null}
                        {note.actorName ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            From {note.actorName}
                          </p>
                        ) : null}
                      </div>
                      {note.unread ? (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[color:var(--mkt-accent,#5f8f12)]" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t p-2">
            <Link
              href="/dashboard/communications/inbox"
              className="flex h-8 w-full items-center justify-center rounded-lg text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              Open inbox
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
