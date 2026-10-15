"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  AtSign,
  CheckCheck,
  CircleDot,
  ClipboardList,
  FileText,
  Receipt,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  Bell,
} from "lucide-react"

import { useCommunications, type Notification } from "@/components/dashboard/communications/store"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { useNotifications } from "@/components/dashboard/notifications-store"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type InboxItem = {
  id: string
  title: string
  kind: string
  href: string
  createdAt: string
  read: boolean
  source: "notification" | "mention"
}

const kindIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  Mention: AtSign,
  Approval: ShieldCheck,
  approval: ShieldCheck,
  Issue: ClipboardList,
  work: ClipboardList,
  Request: UserRoundCheck,
  leave: UserRoundCheck,
  Offer: UsersRound,
  offer: UsersRound,
  Document: FileText,
  document: FileText,
  Invoice: Receipt,
  finance: Receipt,
  Hiring: UsersRound,
  hiring: UsersRound,
  governance: ShieldCheck,
  system: Bell,
}

function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

type Filter = "all" | "unread" | "mentions"

function mapMention(item: Notification): InboxItem {
  return {
    id: `mention-${item.id}`,
    title: item.title,
    kind: "Mention",
    href: item.href,
    createdAt: item.createdAt,
    read: item.read,
    source: "mention",
  }
}

export default function CommunicationsInboxPage() {
  const { inbox, setInboxRead } = useCommunications()
  const { items: notifications, markRead, markAllRead, unreadCount } = useNotifications()
  const [filter, setFilter] = useState<Filter>("unread")

  const merged = useMemo(() => {
    const fromApi: InboxItem[] = notifications.map((n) => ({
      id: n.id,
      title: n.body ? `${n.title} — ${n.body}` : n.title,
      kind: n.kind,
      href: n.href || "/dashboard",
      createdAt: n.createdAt,
      read: !n.unread,
      source: "notification" as const,
    }))
    const mentions = inbox.filter((i) => i.kind === "Mention").map(mapMention)
    return [...fromApi, ...mentions].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    )
  }, [notifications, inbox])

  const unread = merged.filter((item) => !item.read)
  const items = merged.filter((item) =>
    filter === "unread" ? !item.read : filter === "mentions" ? item.kind === "Mention" : true
  )

  async function markItemsRead(selected: InboxItem[]) {
    const notifIds = selected.filter((i) => i.source === "notification").map((i) => i.id)
    const mentionIds = selected
      .filter((i) => i.source === "mention")
      .map((i) => i.id.replace(/^mention-/, ""))
    if (notifIds.length) await markRead(notifIds)
    if (mentionIds.length) setInboxRead(mentionIds, true)
  }

  return (
    <>
      <DashboardHeader title="Inbox" parent="Communications" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <p className="text-sm text-muted-foreground">
              Role-targeted alerts and mentions · {unreadCount} unread notification
              {unreadCount === 1 ? "" : "s"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!unread.length}
            onClick={() => {
              void markAllRead()
              const mentionUnread = inbox.filter((i) => i.kind === "Mention" && !i.read)
              if (mentionUnread.length) setInboxRead(mentionUnread.map((i) => i.id), true)
            }}
          >
            <CheckCheck data-icon="inline-start" />
            Mark all read
          </Button>
        </div>

        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList variant="line">
            <TabsTrigger value="unread">Unread ({unread.length})</TabsTrigger>
            <TabsTrigger value="mentions">Mentions</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <ul className="divide-y rounded-lg border">
          {items.map((item) => {
            const Icon = kindIcon[item.kind] || Bell
            return (
              <li
                key={`${item.source}-${item.id}`}
                className={cn("flex items-center gap-3 px-4 py-3", !item.read && "bg-primary/5")}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-4 text-muted-foreground" />
                </span>
                <Link
                  href={item.href}
                  onClick={() => void markItemsRead([item])}
                  className="min-w-0 flex-1"
                >
                  <p className={cn("truncate text-sm hover:underline", !item.read && "font-semibold")}>
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.kind} · {relativeTime(item.createdAt)}
                  </p>
                </Link>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={item.read ? "Mark as unread" : "Mark as read"}
                  title={item.read ? "Mark as unread" : "Mark as read"}
                  onClick={() => {
                    if (!item.read) void markItemsRead([item])
                  }}
                >
                  {item.read ? <CircleDot className="text-muted-foreground" /> : <CheckCheck />}
                </Button>
              </li>
            )
          })}
          {!items.length ? (
            <li className="px-4 py-12 text-center text-sm text-muted-foreground">
              {filter === "unread" ? "You're all caught up." : "Nothing here yet."}
            </li>
          ) : null}
        </ul>
      </div>
    </>
  )
}
