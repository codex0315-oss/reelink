import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { connectSocket, disconnectSocket } from '../lib/socket'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/api'

export type Notification = {
  id: string
  /** 'message' | 'listing' | 'reel' — decides where tapping it goes. */
  type: string
  title: string
  body?: string
  read: boolean
  createdAt: string
  /**
   * The conversation, listing or reel this is about. Null on rows created before this
   * existed, and on anything whose target has since been deleted — the tap then falls
   * back to the relevant tab rather than a dead end.
   */
  entityId?: string | null
}

type NotificationContextType = {
  notifications: Notification[]
  unreadCount: number
  markRead: (id: string) => void
  markAllRead: () => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    if (!token) {
      disconnectSocket()
      setNotifications([])
      return
    }

    fetchNotifications(token).then(setNotifications).catch(() => {})

    const socket = connectSocket(token)
    socket.on('notification', (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev])
    })

    return () => {
      socket.off('notification')
    }
  }, [token])

  function markRead(id: string) {
    if (!token) return
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    markNotificationRead(token, id).catch(() => {})
  }

  function markAllRead() {
    if (!token) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    markAllNotificationsRead(token).catch(() => {})
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used within NotificationProvider')
  return context
}