"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { useAuth } from "@/components/auth/auth-provider"
import { useOrganization } from "@/components/dashboard/organization-store"
import { ApiError } from "@/lib/api"
import { getAccessToken, getApiBase } from "@/lib/api"
import {
  commsApi,
  type ApiCommChannel,
  type ApiCommMessage,
} from "@/lib/auth-api"
import { canManagePeople, type Employee } from "@/lib/organization"

export type Channel = {
  id: string
  kind: "channel" | "dm"
  /** Lowercase slug for channels; empty for DMs (named after the other person). */
  name: string
  description: string
  visibility: "Public" | "Private"
  memberIds: string[]
  createdBy: string
  createdAt: string
}

export type Message = {
  id: string
  channelId: string
  /** Employee id, or an "agent:*" id for AI agents. */
  authorId: string
  body: string
  createdAt: string
  editedAt?: string
  /** emoji → ids of people who reacted */
  reactions: Record<string, string[]>
}

export type Notification = {
  id: string
  kind: "Mention" | "Approval" | "Issue" | "Request" | "Offer" | "Document" | "Invoice" | "Hiring"
  title: string
  href: string
  createdAt: string
}

type Result = { ok: true; id?: string } | { ok: false; message: string }

const agents: Record<string, string> = {
  "agent:recruiting": "Recruiting Agent",
  "agent:finance": "Finance Agent",
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const seedChannels: Channel[] = [
  {
    id: "ch-general",
    kind: "channel",
    name: "general",
    description: "Company-wide updates and announcements",
    visibility: "Public",
    memberIds: ["emp-ghulam", "emp-maya", "emp-olivia", "emp-samuel", "emp-daniel", "emp-lena"],
    createdBy: "emp-ghulam",
    createdAt: ago(60 * 24 * 200),
  },
]

const seedMessages: Message[] = []
const seedNotifications: Notification[] = [
  {
    id: "n1",
    kind: "Approval",
    title: "Approval needed: Figma renewal payment",
    href: "/dashboard/approvals",
    createdAt: ago(12),
  },
]

/** Messages that @mention a person by full name. */
export function mentions(body: string, name: string) {
  return body.toLowerCase().includes(`@${name.toLowerCase()}`)
}

type CommunicationsValue = {
  me: Employee | undefined
  loading: boolean
  /** Channels and DMs the signed-in user belongs to. */
  myChannels: Channel[]
  /** Public channels the user can join. */
  joinableChannels: Channel[]
  getChannel: (id: string) => Channel | undefined
  channelTitle: (channel: Channel) => string
  authorName: (authorId: string) => string
  messagesFor: (channelId: string) => Message[]
  unreadCount: (channelId: string) => number
  markRead: (channelId: string) => void
  createChannel: (
    input: Pick<Channel, "name" | "description" | "visibility" | "memberIds">
  ) => Promise<Result>
  updateChannel: (id: string, input: Pick<Channel, "name" | "description">) => Promise<Result>
  deleteChannel: (id: string) => Promise<Result>
  joinChannel: (id: string) => Promise<void>
  leaveChannel: (id: string) => Promise<void>
  addMembers: (id: string, memberIds: string[]) => Promise<void>
  openDirectMessage: (employeeId: string) => Promise<string>
  sendMessage: (channelId: string, body: string) => Promise<void>
  editMessage: (id: string, body: string) => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  toggleReaction: (id: string, emoji: string) => Promise<void>
  canModerate: (channel: Channel) => boolean
  /** Mentions of me + system notifications, newest first. */
  inbox: (Notification & { read: boolean })[]
  setInboxRead: (ids: string[], read: boolean) => void
}

const CommunicationsContext = createContext<CommunicationsValue | null>(null)

const SLUG = /^[a-z0-9][a-z0-9-]{1,30}$/

function mapChannel(row: ApiCommChannel): Channel {
  return {
    id: row.id,
    kind: row.kind === "dm" ? "dm" : "channel",
    name: row.name || "",
    description: row.description || "",
    visibility: row.visibility === "Private" ? "Private" : "Public",
    memberIds: row.member_ids || [],
    createdBy: row.created_by || "",
    createdAt: row.created_at,
  }
}

function mapMessage(row: ApiCommMessage): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at || undefined,
    reactions: row.reactions || {},
  }
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}

function wsUrl(organizationId: string, token: string) {
  const base = getApiBase().replace(/^http/, "ws")
  return `${base}/api/v1/ws/communications?organization_id=${encodeURIComponent(organizationId)}&token=${encodeURIComponent(token)}`
}

export function CommunicationsProvider({ children }: { children: ReactNode }) {
  const { me, employees } = useOrganization()
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [channels, setChannels] = useState<Channel[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [lastRead, setLastRead] = useState<Record<string, string>>({})
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const loadedChannelsRef = useRef<Set<string>>(new Set())

  const upsertChannel = useCallback((channel: Channel, lastReadAt?: string | null) => {
    setChannels((current) => {
      const idx = current.findIndex((item) => item.id === channel.id)
      if (idx === -1) return [...current, channel]
      const next = [...current]
      next[idx] = channel
      return next
    })
    if (lastReadAt) {
      setLastRead((current) => ({ ...current, [channel.id]: lastReadAt }))
    }
  }, [])

  const upsertMessage = useCallback((message: Message) => {
    setMessages((current) => {
      const idx = current.findIndex((item) => item.id === message.id)
      if (idx === -1) return [...current, message]
      const next = [...current]
      next[idx] = message
      return next
    })
  }, [])

  const loadMessagesFor = useCallback(async (channelId: string) => {
    if (loadedChannelsRef.current.has(channelId)) return
    try {
      const rows = await commsApi.listMessages(channelId)
      loadedChannelsRef.current.add(channelId)
      setMessages((current) => {
        const others = current.filter((item) => item.channelId !== channelId)
        return [...others, ...rows.map(mapMessage)]
      })
    } catch {
      /* ignore */
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setChannels(seedChannels)
      setMessages(seedMessages)
      setLastRead(Object.fromEntries(seedChannels.map((channel) => [channel.id, ago(30)])))
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await commsApi.listChannels(activeOrgId)
      const mapped = rows.map(mapChannel)
      setChannels(mapped)
      setLastRead(
        Object.fromEntries(
          rows.map((row) => [row.id, row.last_read_at || new Date(0).toISOString()])
        )
      )
      loadedChannelsRef.current = new Set()
      const mine = mapped.filter((channel) => me?.id && channel.memberIds.includes(me.id))
      await Promise.all(mine.slice(0, 8).map((channel) => loadMessagesFor(channel.id)))
    } catch {
      setChannels([])
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId, me?.id, loadMessagesFor])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!useApi || !activeOrgId) return
    const token = getAccessToken()
    if (!token) return

    let closed = false
    let socket: WebSocket | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return
      socket = new WebSocket(wsUrl(activeOrgId, token))
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type?: string; payload?: Record<string, unknown> }
          if (!data.type || !data.payload) return
          if (data.type === "channel.upserted") {
            const channel = mapChannel(data.payload as unknown as ApiCommChannel)
            upsertChannel(channel, (data.payload as ApiCommChannel).last_read_at)
          } else if (data.type === "channel.deleted") {
            const id = String(data.payload.id || "")
            setChannels((current) => current.filter((item) => item.id !== id))
            setMessages((current) => current.filter((item) => item.channelId !== id))
          } else if (data.type === "message.created" || data.type === "message.updated") {
            upsertMessage(mapMessage(data.payload as unknown as ApiCommMessage))
          } else if (data.type === "message.deleted") {
            const id = String(data.payload.id || "")
            setMessages((current) => current.filter((item) => item.id !== id))
          }
        } catch {
          /* ignore malformed */
        }
      }
      socket.onopen = () => {
        pingTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping")
        }, 25000)
      }
      socket.onclose = () => {
        if (pingTimer) clearInterval(pingTimer)
        if (!closed) retryTimer = setTimeout(connect, 2000)
      }
    }

    connect()
    return () => {
      closed = true
      if (pingTimer) clearInterval(pingTimer)
      if (retryTimer) clearTimeout(retryTimer)
      socket?.close()
    }
  }, [useApi, activeOrgId, upsertChannel, upsertMessage])

  const value = useMemo<CommunicationsValue>(() => {
    const meId = me?.id ?? ""
    const isAdmin = canManagePeople(me?.accessRole)
    const personName = (id: string) => employees.find((employee) => employee.id === id)?.name

    const mentionNotifications: Notification[] = me
      ? messages
          .filter((message) => message.authorId !== meId && mentions(message.body, me.name))
          .filter((message) =>
            channels.some((c) => c.id === message.channelId && c.memberIds.includes(meId))
          )
          .map((message) => {
            const channel = channels.find((c) => c.id === message.channelId)!
            const where = channel.kind === "dm" ? "a direct message" : `#${channel.name}`
            return {
              id: `mention-${message.id}`,
              kind: "Mention" as const,
              title: `${personName(message.authorId) ?? agents[message.authorId] ?? "Someone"} mentioned you in ${where}`,
              href: `/dashboard/communications/channels?c=${channel.id}`,
              createdAt: message.createdAt,
            }
          })
      : []

    return {
      me,
      loading,
      myChannels: channels.filter((channel) => channel.memberIds.includes(meId)),
      joinableChannels: channels.filter(
        (channel) =>
          channel.kind === "channel" &&
          channel.visibility === "Public" &&
          !channel.memberIds.includes(meId)
      ),
      getChannel: (id) => channels.find((channel) => channel.id === id),
      channelTitle(channel) {
        if (channel.kind === "channel") return channel.name
        const other = channel.memberIds.find((id) => id !== meId) ?? meId
        return personName(other) ?? "Former member"
      },
      authorName: (authorId) => personName(authorId) ?? agents[authorId] ?? "Former member",
      messagesFor(channelId) {
        if (useApi) void loadMessagesFor(channelId)
        return messages
          .filter((message) => message.channelId === channelId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      },
      unreadCount(channelId) {
        const since = lastRead[channelId] ?? ""
        return messages.filter(
          (message) =>
            message.channelId === channelId && message.authorId !== meId && message.createdAt > since
        ).length
      },
      markRead(channelId) {
        const now = new Date().toISOString()
        setLastRead((current) => ({ ...current, [channelId]: now }))
        if (useApi) void commsApi.markRead(channelId).catch(() => undefined)
      },

      async createChannel(input) {
        const name = input.name.trim().toLowerCase().replace(/\s+/g, "-")
        if (!SLUG.test(name)) {
          return { ok: false, message: "Use 2–31 lowercase letters, numbers, or dashes." }
        }
        if (useApi && activeOrgId) {
          try {
            const row = await commsApi.createChannel(activeOrgId, {
              name,
              description: input.description.trim(),
              visibility: input.visibility,
              member_ids: input.memberIds,
            })
            upsertChannel(mapChannel(row), row.last_read_at)
            return { ok: true, id: row.id }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not create channel.") }
          }
        }
        if (channels.some((channel) => channel.kind === "channel" && channel.name === name)) {
          return { ok: false, message: `#${name} already exists.` }
        }
        const id = `ch-${name}-${Date.now()}`
        setChannels((current) => [
          ...current,
          {
            id,
            kind: "channel",
            name,
            description: input.description.trim(),
            visibility: input.visibility,
            memberIds: Array.from(new Set([meId, ...input.memberIds])),
            createdBy: meId,
            createdAt: new Date().toISOString(),
          },
        ])
        return { ok: true, id }
      },

      async updateChannel(id, input) {
        const name = input.name.trim().toLowerCase().replace(/\s+/g, "-")
        if (!SLUG.test(name)) {
          return { ok: false, message: "Use 2–31 lowercase letters, numbers, or dashes." }
        }
        if (useApi) {
          try {
            const row = await commsApi.updateChannel(id, {
              name,
              description: input.description.trim(),
            })
            upsertChannel(mapChannel(row), row.last_read_at)
            return { ok: true }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not update channel.") }
          }
        }
        setChannels((current) =>
          current.map((channel) =>
            channel.id === id ? { ...channel, name, description: input.description.trim() } : channel
          )
        )
        return { ok: true }
      },

      async deleteChannel(id) {
        const channel = channels.find((item) => item.id === id)
        if (!channel) return { ok: false, message: "Channel not found." }
        if (channel.name === "general") return { ok: false, message: "#general can't be deleted." }
        if (useApi) {
          try {
            await commsApi.deleteChannel(id)
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not delete channel.") }
          }
        }
        setChannels((current) => current.filter((item) => item.id !== id))
        setMessages((current) => current.filter((message) => message.channelId !== id))
        return { ok: true }
      },

      async joinChannel(id) {
        if (useApi) {
          try {
            const row = await commsApi.joinChannel(id)
            upsertChannel(mapChannel(row), row.last_read_at || new Date().toISOString())
            await loadMessagesFor(id)
          } catch {
            /* ignore */
          }
          return
        }
        setChannels((current) =>
          current.map((channel) =>
            channel.id === id && channel.visibility === "Public" && !channel.memberIds.includes(meId)
              ? { ...channel, memberIds: [...channel.memberIds, meId] }
              : channel
          )
        )
        setLastRead((current) => ({ ...current, [id]: new Date().toISOString() }))
      },

      async leaveChannel(id) {
        if (useApi) {
          try {
            const row = await commsApi.leaveChannel(id)
            upsertChannel(mapChannel(row), row.last_read_at)
          } catch {
            /* ignore */
          }
          return
        }
        setChannels((current) =>
          current.map((channel) =>
            channel.id === id
              ? { ...channel, memberIds: channel.memberIds.filter((memberId) => memberId !== meId) }
              : channel
          )
        )
      },

      async addMembers(id, memberIds) {
        if (useApi) {
          try {
            const row = await commsApi.addMembers(id, memberIds)
            upsertChannel(mapChannel(row), row.last_read_at)
          } catch {
            /* ignore */
          }
          return
        }
        setChannels((current) =>
          current.map((channel) =>
            channel.id === id
              ? { ...channel, memberIds: Array.from(new Set([...channel.memberIds, ...memberIds])) }
              : channel
          )
        )
      },

      async openDirectMessage(employeeId) {
        if (useApi && activeOrgId) {
          const row = await commsApi.openDm(activeOrgId, employeeId)
          upsertChannel(mapChannel(row), row.last_read_at)
          await loadMessagesFor(row.id)
          return row.id
        }
        const existing = channels.find(
          (channel) =>
            channel.kind === "dm" &&
            channel.memberIds.includes(meId) &&
            channel.memberIds.includes(employeeId) &&
            channel.memberIds.length === (employeeId === meId ? 1 : 2)
        )
        if (existing) return existing.id
        const id = `dm-${Date.now()}`
        setChannels((current) => [
          ...current,
          {
            id,
            kind: "dm",
            name: "",
            description: "",
            visibility: "Private",
            memberIds: Array.from(new Set([meId, employeeId])),
            createdBy: meId,
            createdAt: new Date().toISOString(),
          },
        ])
        return id
      },

      async sendMessage(channelId, body) {
        const text = body.trim()
        if (!text || !meId) return
        if (useApi) {
          try {
            const row = await commsApi.sendMessage(channelId, text)
            upsertMessage(mapMessage(row))
            setLastRead((current) => ({ ...current, [channelId]: row.created_at }))
          } catch {
            /* ignore */
          }
          return
        }
        const now = new Date().toISOString()
        setMessages((current) => [
          ...current,
          {
            id: `m-${Date.now()}`,
            channelId,
            authorId: meId,
            body: text,
            createdAt: now,
            reactions: {},
          },
        ])
        setLastRead((current) => ({ ...current, [channelId]: now }))
      },

      async editMessage(id, body) {
        const text = body.trim()
        if (!text) return
        if (useApi) {
          try {
            const row = await commsApi.editMessage(id, text)
            upsertMessage(mapMessage(row))
          } catch {
            /* ignore */
          }
          return
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === id && message.authorId === meId
              ? { ...message, body: text, editedAt: new Date().toISOString() }
              : message
          )
        )
      },

      async deleteMessage(id) {
        if (useApi) {
          try {
            await commsApi.deleteMessage(id)
            setMessages((current) => current.filter((message) => message.id !== id))
          } catch {
            /* ignore */
          }
          return
        }
        setMessages((current) =>
          current.filter((message) => message.id !== id || (message.authorId !== meId && !isAdmin))
        )
      },

      async toggleReaction(id, emoji) {
        if (useApi) {
          try {
            const row = await commsApi.toggleReaction(id, emoji)
            upsertMessage(mapMessage(row))
          } catch {
            /* ignore */
          }
          return
        }
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== id) return message
            const users = message.reactions[emoji] ?? []
            const next = users.includes(meId) ? users.filter((user) => user !== meId) : [...users, meId]
            const reactions = { ...message.reactions, [emoji]: next }
            if (!next.length) delete reactions[emoji]
            return { ...message, reactions }
          })
        )
      },

      canModerate: (channel) => channel.kind === "channel" && (channel.createdBy === meId || isAdmin),

      inbox: [...mentionNotifications, ...(useApi ? [] : seedNotifications)]
        .map((item) => ({ ...item, read: readNotifications.has(item.id) }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

      setInboxRead(ids, read) {
        setReadNotifications((current) => {
          const next = new Set(current)
          for (const id of ids) {
            if (read) next.add(id)
            else next.delete(id)
          }
          return next
        })
      },
    }
  }, [
    me,
    employees,
    channels,
    messages,
    lastRead,
    readNotifications,
    loading,
    useApi,
    activeOrgId,
    loadMessagesFor,
    upsertChannel,
    upsertMessage,
  ])

  return <CommunicationsContext.Provider value={value}>{children}</CommunicationsContext.Provider>
}

export function useCommunications() {
  const context = useContext(CommunicationsContext)
  if (!context) throw new Error("useCommunications must be used within CommunicationsProvider")
  return context
}
