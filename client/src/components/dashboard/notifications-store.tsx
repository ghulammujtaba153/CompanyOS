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
import { getAccessToken, getApiBase } from "@/lib/api"
import {
  notificationsApi,
  type ApiNotification,
} from "@/lib/auth-api"

type NotificationsValue = {
  items: ApiNotification[]
  unreadCount: number
  loading: boolean
  refresh: () => Promise<void>
  markRead: (ids: string[]) => Promise<void>
  markAllRead: () => Promise<void>
  connected: boolean
}

const NotificationsContext = createContext<NotificationsValue | null>(null)

function wsUrl(organizationId: string, token: string) {
  const base = getApiBase().replace(/^http/, "ws")
  return `${base}/api/v1/notifications/ws?organization_id=${encodeURIComponent(organizationId)}&token=${encodeURIComponent(token)}`
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { activeOrgId, me, isAuthenticated } = useAuth()
  const [items, setItems] = useState<ApiNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const meId = me?.id ?? ""
  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    if (!activeOrgId || !isAuthenticated) {
      setItems([])
      setUnreadCount(0)
      return
    }
    setLoading(true)
    try {
      const res = await notificationsApi.list(activeOrgId)
      setItems(res.items)
      setUnreadCount(res.unreadCount)
    } catch {
      /* keep last good state */
    } finally {
      setLoading(false)
    }
  }, [activeOrgId, isAuthenticated])

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!activeOrgId || !ids.length) return
      setItems((prev) =>
        prev.map((n) =>
          ids.includes(n.id) ? { ...n, unread: false, readAt: new Date().toISOString() } : n
        )
      )
      setUnreadCount((c) => Math.max(0, c - ids.length))
      try {
        await notificationsApi.markRead(activeOrgId, ids)
        await refresh()
      } catch {
        await refresh()
      }
    },
    [activeOrgId, refresh]
  )

  const markAllRead = useCallback(async () => {
    if (!activeOrgId) return
    setItems((prev) =>
      prev.map((n) => ({ ...n, unread: false, readAt: n.readAt || new Date().toISOString() }))
    )
    setUnreadCount(0)
    try {
      await notificationsApi.markAllRead(activeOrgId)
    } catch {
      await refresh()
    }
  }, [activeOrgId, refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Realtime WS + polling fallback
  useEffect(() => {
    if (!activeOrgId || !isAuthenticated || !meId) {
      setConnected(false)
      return
    }
    const token = getAccessToken()
    if (!token) return

    let cancelled = false
    let retryMs = 1500

    const connect = () => {
      if (cancelled) return
      try {
        const ws = new WebSocket(wsUrl(activeOrgId, token))
        wsRef.current = ws
        ws.onopen = () => {
          setConnected(true)
          retryMs = 1500
        }
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data)) as {
              type?: string
              payload?: ApiNotification
            }
            if (msg.type !== "notification.created" || !msg.payload) return
            const note = msg.payload
            if (note.recipientUserId && note.recipientUserId !== meId) return
            setItems((prev) => {
              if (prev.some((n) => n.id === note.id)) return prev
              return [note, ...prev].slice(0, 60)
            })
            if (note.unread !== false) {
              setUnreadCount((c) => c + 1)
            }
          } catch {
            /* ignore malformed */
          }
        }
        ws.onclose = () => {
          setConnected(false)
          wsRef.current = null
          if (cancelled) return
          window.setTimeout(connect, retryMs)
          retryMs = Math.min(15000, retryMs * 1.6)
        }
        ws.onerror = () => {
          ws.close()
        }
      } catch {
        setConnected(false)
      }
    }

    connect()
    pollRef.current = setInterval(() => {
      void refresh()
    }, 45000)

    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      wsRef.current?.close()
      wsRef.current = null
      setConnected(false)
    }
  }, [activeOrgId, isAuthenticated, meId, refresh])

  const value = useMemo(
    () => ({
      items,
      unreadCount,
      loading,
      refresh,
      markRead,
      markAllRead,
      connected,
    }),
    [items, unreadCount, loading, refresh, markRead, markAllRead, connected]
  )

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider")
  }
  return ctx
}
