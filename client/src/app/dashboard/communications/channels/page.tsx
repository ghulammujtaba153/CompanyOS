"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Fragment, Suspense, useEffect, useRef, useState } from "react"
import {
  Hash,
  Lock,
  MessageSquarePlus,
  Pencil,
  Plus,
  Search,
  SmilePlus,
  Trash2,
  Users,
} from "lucide-react"

import {
  BrowseChannelsDialog,
  ChannelDetailsDialog,
  CreateChannelDialog,
  NewMessageDialog,
} from "@/components/dashboard/communications/channel-dialogs"
import {
  useCommunications,
  type Channel,
  type Message,
} from "@/components/dashboard/communications/store"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { KeyedSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useOrganization } from "@/components/dashboard/organization-store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "cn"
import { initials } from "@/lib/work-utils"

const QUICK_REACTIONS = ["👍", "✅", "👀", "🎉"]
const GROUP_WINDOW_MS = 5 * 60_000

type Dialogs = "create" | "browse" | "dm" | "details" | null

export default function CommunicationsChannelsPage() {
  return (
    <>
      <DashboardHeader title="Channels" parent="Communications" />
      <Suspense>
        <ChannelsWorkspace />
      </Suspense>
    </>
  )
}

function ChannelsWorkspace() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { loading, myChannels, getChannel, channelTitle } = useCommunications()
  const [dialog, setDialog] = useState<Dialogs>(null)

  if (loading) {
    return <PageLoadingState label="Loading channels…" variant="detail" className="p-0" />
  }

  const requested = params.get("c")
  const active =
    (requested && myChannels.find((channel) => channel.id === requested)) ||
    myChannels.find((channel) => channel.name === "general") ||
    myChannels[0]

  function select(id: string) {
    setDialog(null)
    router.replace(`${pathname}?c=${id}`, { scroll: false })
  }

  // A private channel or one the user left can't be opened by URL.
  const blocked =
    requested && !myChannels.some((channel) => channel.id === requested) && getChannel(requested)

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      {/* Mobile: the channel list is hidden, so offer a compact switcher. */}
      <div className="flex gap-2 border-b p-2 md:hidden">
        <KeyedSelect
          className="flex-1"
          value={active?.id ?? ""}
          onChange={select}
          options={myChannels.map(
            (channel) =>
              [
                channel.id,
                channel.kind === "dm" ? channelTitle(channel) : `# ${channel.name}`,
              ] as const,
          )}
        />
        <Button
          size="icon"
          variant="outline"
          aria-label="New direct message"
          onClick={() => setDialog("dm")}
        >
          <MessageSquarePlus />
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[16rem_1fr]">
        <ChannelSidebar activeId={active?.id} onSelect={select} onDialog={setDialog} />
        {active && !blocked ? (
          <ChannelView key={active.id} channel={active} onDetails={() => setDialog("details")} />
        ) : (
          <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
            {blocked
              ? "You're not a member of this channel."
              : "Join or create a channel to start talking."}
          </div>
        )}

        {dialog === "create" ? (
          <CreateChannelDialog onClose={() => setDialog(null)} onCreated={select} />
        ) : null}
        {dialog === "browse" ? (
          <BrowseChannelsDialog onClose={() => setDialog(null)} onJoined={select} />
        ) : null}
        {dialog === "dm" ? (
          <NewMessageDialog onClose={() => setDialog(null)} onOpen={select} />
        ) : null}
        {dialog === "details" && active ? (
          <ChannelDetailsDialog
            channel={active}
            onClose={() => setDialog(null)}
            onLeft={() => {
              setDialog(null)
              router.replace(pathname, { scroll: false })
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function ChannelSidebar({
  activeId,
  onSelect,
  onDialog,
}: {
  activeId?: string
  onSelect: (id: string) => void
  onDialog: (dialog: Dialogs) => void
}) {
  const { myChannels, joinableChannels, channelTitle, unreadCount } = useCommunications()
  const [query, setQuery] = useState("")
  const match = (channel: Channel) =>
    channelTitle(channel).toLowerCase().includes(query.trim().toLowerCase())
  const channels = myChannels
    .filter((c) => c.kind === "channel" && match(c))
    .sort((a, b) => a.name.localeCompare(b.name))
  const dms = myChannels.filter((c) => c.kind === "dm" && match(c))

  const item = (channel: Channel) => {
    const unread = channel.id === activeId ? 0 : unreadCount(channel.id)
    const title = channelTitle(channel)
    return (
      <li key={channel.id}>
        <button
          type="button"
          onClick={() => onSelect(channel.id)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            channel.id === activeId
              ? "bg-accent font-medium text-accent-foreground"
              : "hover:bg-muted",
            unread > 0 && "font-semibold",
          )}
        >
          {channel.kind === "dm" ? (
            <Avatar size="sm" className="size-5">
              <AvatarFallback className="text-[9px]">{initials(title)}</AvatarFallback>
            </Avatar>
          ) : channel.visibility === "Private" ? (
            <Lock className="size-3.5 text-muted-foreground" />
          ) : (
            <Hash className="size-3.5 text-muted-foreground" />
          )}
          <span className="flex-1 truncate">{title}</span>
          {unread ? (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
              {unread}
            </span>
          ) : null}
        </button>
      </li>
    )
  }

  return (
    <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-r p-3 md:flex">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jump to…"
          className="pl-8"
        />
      </div>

      <section>
        <div className="flex items-center justify-between px-2 pb-1">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Channels
          </h2>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="New channel"
            onClick={() => onDialog("create")}
          >
            <Plus />
          </Button>
        </div>
        <ul className="space-y-0.5">{channels.map(item)}</ul>
        {joinableChannels.length ? (
          <button
            type="button"
            onClick={() => onDialog("browse")}
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
          >
            Browse {joinableChannels.length} more…
          </button>
        ) : null}
      </section>

      <section>
        <div className="flex items-center justify-between px-2 pb-1">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Direct messages
          </h2>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="New direct message"
            onClick={() => onDialog("dm")}
          >
            <MessageSquarePlus />
          </Button>
        </div>
        <ul className="space-y-0.5">{dms.map(item)}</ul>
      </section>
    </aside>
  )
}

function ChannelView({ channel, onDetails }: { channel: Channel; onDetails: () => void }) {
  const { channelTitle, messagesFor, markRead, sendMessage } = useCommunications()
  const messages = messagesFor(channel.id)
  const scrollRef = useRef<HTMLDivElement>(null)
  const title = channelTitle(channel)

  // Keep the newest message in view and the channel marked read while open.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    markRead(channel.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markRead identity changes every render
  }, [channel.id, messages.length])

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 font-semibold">
            {channel.kind === "dm" ? null : channel.visibility === "Private" ? (
              <Lock className="size-4" />
            ) : (
              <Hash className="size-4" />
            )}
            {title}
          </h1>
          {channel.description ? (
            <p className="truncate text-xs text-muted-foreground">{channel.description}</p>
          ) : null}
        </div>
        {channel.kind === "channel" ? (
          <Button size="sm" variant="ghost" onClick={onDetails}>
            <Users data-icon="inline-start" />
            {channel.memberIds.length}
          </Button>
        ) : null}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length ? (
          <MessageList messages={messages} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {channel.kind === "dm"
                ? `This is the start of your conversation with ${title}.`
                : `Welcome to #${title}`}
            </p>
            <p>Send the first message.</p>
          </div>
        )}
      </div>

      <Composer
        channel={channel}
        placeholder={channel.kind === "dm" ? `Message ${title}` : `Message #${title}`}
        onSend={(body) => void sendMessage(channel.id, body)}
      />
    </section>
  )
}

function dayLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function MessageList({ messages }: { messages: Message[] }) {
  return (
    <ol>
      {messages.map((message, index) => {
        const previous = messages[index - 1]
        const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt)
        const grouped =
          !newDay &&
          previous.authorId === message.authorId &&
          Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_WINDOW_MS
        return (
          <Fragment key={message.id}>
            {newDay ? (
              <li className="my-3 flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {dayLabel(message.createdAt)}
                <span className="h-px flex-1 bg-border" />
              </li>
            ) : null}
            <MessageItem message={message} grouped={grouped} />
          </Fragment>
        )
      })}
    </ol>
  )
}

function MessageItem({ message, grouped }: { message: Message; grouped: boolean }) {
  const { me, authorName, editMessage, deleteMessage, toggleReaction } = useCommunications()
  const { employees } = useOrganization()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [picking, setPicking] = useState(false)
  const name = authorName(message.authorId)
  const mine = message.authorId === me?.id
  const canDelete = mine || me?.accessRole === "Owner" || me?.accessRole === "Admin"
  const isAgent = message.authorId.startsWith("agent:")

  return (
    <li
      className={cn(
        "group relative -mx-2 flex gap-3 rounded-md px-2 hover:bg-muted/40",
        grouped ? "py-0.5" : "mt-2 pt-1.5 pb-0.5",
      )}
    >
      <div className="w-8 shrink-0">
        {grouped ? (
          <span className="invisible block pt-0.5 text-[10px] text-muted-foreground group-hover:visible">
            {timeLabel(message.createdAt)}
          </span>
        ) : (
          <Avatar size="sm">
            <AvatarFallback className={cn(isAgent && "bg-primary/10 text-primary")}>
              {initials(name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped ? (
          <p className="text-sm">
            <span className="font-semibold">{name}</span>
            {isAgent ? (
              <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground uppercase">
                Agent
              </span>
            ) : null}
            <span className="ml-2 text-xs text-muted-foreground">
              {timeLabel(message.createdAt)}
            </span>
          </p>
        ) : null}

        {editing ? (
          <div className="mt-1 space-y-1.5">
            <Textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void editMessage(message.id, draft)
                  setEditing(false)
                }
                if (event.key === "Escape") {
                  setDraft(message.body)
                  setEditing(false)
                }
              }}
              className="min-h-16"
            />
            <p className="text-xs text-muted-foreground">Enter to save · Esc to cancel</p>
          </div>
        ) : (
          <p className="text-sm leading-6 break-words whitespace-pre-wrap">
            <MessageBody
              body={message.body}
              names={employees.map((employee) => employee.name)}
              myName={me?.name}
            />
            {message.editedAt ? (
              <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
            ) : null}
          </p>
        )}

        {Object.keys(message.reactions).length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                title={users
                  .map((id) => employees.find((e) => e.id === id)?.name ?? "Someone")
                  .join(", ")}
                onClick={() => void toggleReaction(message.id, emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  me && users.includes(me.id)
                    ? "border-primary/40 bg-primary/10"
                    : "hover:bg-muted",
                )}
              >
                {emoji} <span className="tabular-nums">{users.length}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!editing ? (
        <div
          className={cn(
            "absolute -top-3 right-2 flex items-center rounded-md border bg-background shadow-sm",
            picking ? "flex" : "hidden group-hover:flex",
          )}
        >
          {picking ? (
            QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="px-1.5 py-1 hover:bg-muted"
                onClick={() => {
                  void toggleReaction(message.id, emoji)
                  setPicking(false)
                }}
              >
                {emoji}
              </button>
            ))
          ) : (
            <>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Add reaction"
                onClick={() => setPicking(true)}
              >
                <SmilePlus />
              </Button>
              {mine ? (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Edit message"
                  onClick={() => setEditing(true)}
                >
                  <Pencil />
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Delete message"
                  onClick={() => {
                    if (window.confirm("Delete this message?")) void deleteMessage(message.id)
                  }}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  )
}

/** Highlights @Full Name mentions of known people. */
function MessageBody({ body, names, myName }: { body: string; names: string[]; myName?: string }) {
  if (!names.length) return body
  const escaped = [...names]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const parts = body.split(new RegExp(`(@(?:${escaped.join("|")}))`, "gi"))
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span
        key={index}
        className={cn(
          "rounded px-0.5 font-medium",
          myName && part.toLowerCase() === `@${myName.toLowerCase()}`
            ? "bg-amber-200/60 dark:bg-amber-500/30"
            : "bg-primary/10 text-primary",
        )}
      >
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  )
}

function Composer({
  channel,
  placeholder,
  onSend,
}: {
  channel: Channel
  placeholder: string
  onSend: (body: string) => void
}) {
  const { employees } = useOrganization()
  const [draft, setDraft] = useState("")
  const [highlight, setHighlight] = useState(0)

  // @mention autocomplete: suggest channel members matching the text after the last "@".
  const mentionQuery = /(?:^|\s)@([\w ]{0,30})$/.exec(draft)?.[1]
  const suggestions =
    mentionQuery !== undefined
      ? employees
          .filter(
            (e) =>
              channel.memberIds.includes(e.id) &&
              e.name.toLowerCase().startsWith(mentionQuery.toLowerCase()),
          )
          .slice(0, 5)
      : []

  function insertMention(name: string) {
    setDraft((current) => current.replace(/@([\w ]{0,30})$/, `@${name} `))
    setHighlight(0)
  }

  function send() {
    if (!draft.trim()) return
    onSend(draft)
    setDraft("")
  }

  return (
    <div className="relative border-t p-3">
      {suggestions.length ? (
        <ul className="absolute bottom-full left-3 mb-1 w-64 overflow-hidden rounded-md border bg-popover shadow-md">
          {suggestions.map((person, index) => (
            <li key={person.id}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  insertMention(person.name)
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                  index === highlight && "bg-accent",
                )}
              >
                <Avatar size="sm" className="size-5">
                  <AvatarFallback className="text-[9px]">{initials(person.name)}</AvatarFallback>
                </Avatar>
                {person.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-end gap-2 rounded-lg border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring/50">
        <Textarea
          value={draft}
          rows={1}
          onChange={(event) => {
            setDraft(event.target.value)
            setHighlight(0)
          }}
          onKeyDown={(event) => {
            if (suggestions.length) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                const step = event.key === "ArrowDown" ? 1 : -1
                setHighlight(
                  (current) => (current + step + suggestions.length) % suggestions.length,
                )
                return
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault()
                insertMention(suggestions[highlight].name)
                return
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder={placeholder}
          className="max-h-40 min-h-9 resize-none border-0 shadow-none focus-visible:ring-0"
        />
        <Button size="sm" onClick={send} disabled={!draft.trim()}>
          Send
        </Button>
      </div>
      <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">
        Enter to send · Shift+Enter for a new line · @ to mention
      </p>
    </div>
  )
}
