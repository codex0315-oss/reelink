import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { connectSocket } from '../lib/socket'
import {
  fetchConversations,
  fetchConversation,
  deleteConversation,
  sendMessage as sendMessageApi,
  markConversationRead,
} from '../lib/api'

export type Participant = {
  id: string
  name: string
  avatarUrl?: string | null
  lastSeenAt?: string | null
  online?: boolean
  /** Only present between the two parties of a conversation. */
  phone?: string | null
}

export type ChatMessage = {
  id: string
  content: string
  senderId: string
  createdAt: string
  deliveredAt?: string | null
  readAt?: string | null
  /**
   * Written by the auto-responder rather than by the agent, though it carries their id.
   * The thread marks these, because a buyer must never believe the agent personally
   * told them something a template did.
   */
  isAutomated?: boolean
}

export type Conversation = {
  id: string
  listingId: string
  lastMessageAt: string
  otherUser: Participant
  listing?: {
    id: string
    title: string
    price: number
    photoUrls: string[]
    status?: string
    listingType?: string
  }
  lastMessage?: ChatMessage | null
  unreadCount: number
}

export type MessageToast = {
  id: string
  conversationId: string
  name: string
  avatarUrl?: string | null
  propertyTitle?: string
  preview: string
}

type MessagesContextType = {
  conversations: Conversation[]
  messages: ChatMessage[]
  activeId: string | null
  online: Set<string>
  typingIn: Record<string, boolean>
  unreadCount: number
  loading: boolean
  toasts: MessageToast[]
  openThread: (id: string) => void
  closeThread: () => void
  /** Hides a thread from this user only; the other party keeps theirs. */
  removeThread: (id: string) => Promise<void>
  send: (text: string) => Promise<void>
  setTyping: (typing: boolean) => void
  dismissToast: (id: string) => void
}

const MessagesContext = createContext<MessagesContextType | undefined>(undefined)

const TOAST_MS = 6000

/**
 * Owns every message socket listener for the whole app.
 *
 * This deliberately does not live on the Messages screen: a message arriving while
 * the user is on Browse still has to raise a toast and, more importantly, send the
 * delivery acknowledgement. Wiring it to a screen would make "Delivered" mean "was
 * looking at Messages", which is not what it says.
 */
export function MessagesProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [typingIn, setTypingIn] = useState<Record<string, boolean>>({})
  const [toasts, setToasts] = useState<MessageToast[]>([])
  const [loading, setLoading] = useState(true)

  // Socket handlers are bound once, so anything they read must come from a ref.
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId
  const wasTyping = useRef(false)

  const unreadCount = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations],
  )

  /* ------------------------------------------------------------- loading */

  useEffect(() => {
    if (!token) {
      setConversations([])
      setMessages([])
      setActiveId(null)
      setLoading(false)
      return
    }
    setLoading(true)
    fetchConversations(token)
      .then((list: Conversation[]) => {
        setConversations(list)

        // Catch-up: anything that arrived while this user was offline was never
        // acknowledged, and would otherwise sit on "Sent" forever. Their app has
        // the messages now, which is exactly what Delivered claims.
        const socket = connectSocket(token)
        list
          .filter((c) => c.unreadCount > 0)
          .forEach((c) => socket.emit('message:delivered', { conversationId: c.id }))
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [token])

  const openThread = useCallback(
    (id: string) => {
      setActiveId(id)
      if (!token) return
      fetchConversation(token, id)
        .then((data) => {
          setMessages(data.messages ?? [])

          // Add it to the inbox if it is not there yet.
          //
          // The list is fetched once when the session starts, so a conversation
          // created after that — which is every conversation started from a property
          // page — was missing from it. Opening the thread loaded its messages but
          // left the list empty, and the inbox rendered "No conversations yet" over
          // the thread the user had just opened. A new account hit this on their
          // first ever message, which is the worst possible moment for it.
          //
          // The response is the same decorated shape the list uses, so it can simply
          // be inserted rather than triggering a second round trip.
          setConversations((prev) => {
            if (prev.some((c) => c.id === id)) return prev
            const { messages: threadMessages, ...conversation } = data
            const entry = {
              ...conversation,
              lastMessage: threadMessages?.[threadMessages.length - 1] ?? null,
              unreadCount: 0,
            } as Conversation
            // Newest first, matching the order the server sends.
            return [entry, ...prev]
          })
        })
        .catch(() => setMessages([]))

      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
      )
      void markConversationRead(token, id).catch(() => undefined)
      // A thread you just opened should not also be shouting at you from a toast.
      setToasts((prev) => prev.filter((t) => t.conversationId !== id))
    },
    [token],
  )

  const closeThread = useCallback(() => {
    setActiveId(null)
    setMessages([])
  }, [])

  /**
   * Removes a thread from this user's inbox.
   *
   * The list is updated before the request settles so the row disappears on tap; if the
   * server refuses, it is put back rather than leaving the UI lying about what happened.
   */
  const removeThread = useCallback(
    async (id: string) => {
      if (!token) return
      const previous = conversations
      setConversations((prev) => prev.filter((c) => c.id !== id))
      setActiveId((current) => (current === id ? null : current))

      try {
        await deleteConversation(token, id)
      } catch (err) {
        setConversations(previous)
        throw err
      }
    },
    [token, conversations],
  )

  /* ----------------------------------------------------------- real time */

  useEffect(() => {
    if (!token || !user?.id) return
    const socket = connectSocket(token)

    const onMessage = (payload: {
      conversationId: string
      message: ChatMessage
      from?: Participant
      listing?: { title: string }
    }) => {
      const { conversationId, message } = payload

      // Acknowledge receipt immediately — this is what "Delivered" actually means.
      socket.emit('message:delivered', { conversationId })

      const isOpen = activeIdRef.current === conversationId
      if (isOpen) {
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message],
        )
        void markConversationRead(token, conversationId).catch(() => undefined)
      } else if (payload.from) {
        // Quiet only for the thread on screen; anywhere else it pops.
        const toast: MessageToast = {
          id: message.id,
          conversationId,
          name: payload.from.name,
          avatarUrl: payload.from.avatarUrl,
          propertyTitle: payload.listing?.title,
          preview: message.content,
        }
        setToasts((prev) => [...prev.filter((t) => t.id !== toast.id), toast])
        window.setTimeout(
          () => setToasts((prev) => prev.filter((t) => t.id !== toast.id)),
          TOAST_MS,
        )
      }

      setConversations((prev) => {
        if (!prev.some((c) => c.id === conversationId)) {
          // First contact from someone new — the row does not exist yet.
          void fetchConversations(token).then(setConversations).catch(() => undefined)
          return prev
        }
        return [...prev]
          .map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  lastMessage: message,
                  lastMessageAt: message.createdAt,
                  unreadCount: isOpen ? 0 : c.unreadCount + 1,
                }
              : c,
          )
          .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt))
      })
    }

    const onDelivered = ({
      conversationId,
      deliveredAt,
    }: {
      conversationId: string
      deliveredAt: string
    }) => {
      if (activeIdRef.current !== conversationId) return
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === user.id && !m.deliveredAt ? { ...m, deliveredAt } : m,
        ),
      )
    }

    const onRead = ({
      conversationId,
      readAt,
    }: {
      conversationId: string
      readAt: string
    }) => {
      if (activeIdRef.current !== conversationId) return
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === user.id && !m.readAt
            ? // Reading implies delivery, so backfill it rather than showing Seen
              // above a message that never turned Delivered.
              { ...m, readAt, deliveredAt: m.deliveredAt ?? readAt }
            : m,
        ),
      )
    }

    const onTyping = ({
      conversationId,
      typing,
    }: {
      conversationId: string
      typing: boolean
    }) => setTypingIn((prev) => ({ ...prev, [conversationId]: typing }))

    const onPresence = ({ userId, online: isOnline }: { userId: string; online: boolean }) =>
      setOnline((prev) => {
        const next = new Set(prev)
        if (isOnline) next.add(userId)
        else next.delete(userId)
        return next
      })

    const onSnapshot = (ids: string[]) => setOnline(new Set(ids))

    socket.on('message', onMessage)
    socket.on('message:delivered', onDelivered)
    socket.on('message:read', onRead)
    socket.on('typing', onTyping)
    socket.on('presence', onPresence)
    socket.on('presence:snapshot', onSnapshot)

    return () => {
      socket.off('message', onMessage)
      socket.off('message:delivered', onDelivered)
      socket.off('message:read', onRead)
      socket.off('typing', onTyping)
      socket.off('presence', onPresence)
      socket.off('presence:snapshot', onSnapshot)
    }
  }, [token, user?.id])

  /* ---------------------------------------------------------------- send */

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || !token || !activeIdRef.current) return
      const id = activeIdRef.current

      const message: ChatMessage = await sendMessageApi(token, id, content)
      setMessages((prev) => [...prev, message])
      setConversations((prev) =>
        [...prev]
          .map((c) =>
            c.id === id
              ? { ...c, lastMessage: message, lastMessageAt: message.createdAt }
              : c,
          )
          .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)),
      )
    },
    [token],
  )

  const setTyping = useCallback(
    (typing: boolean) => {
      if (!token || !activeIdRef.current) return
      if (wasTyping.current === typing) return
      wasTyping.current = typing
      connectSocket(token).emit('typing', {
        conversationId: activeIdRef.current,
        typing,
      })
    },
    [token],
  )

  const dismissToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  )

  return (
    <MessagesContext.Provider
      value={{
        conversations,
        messages,
        activeId,
        online,
        typingIn,
        unreadCount,
        loading,
        toasts,
        openThread,
        closeThread,
        removeThread,
        send,
        setTyping,
        dismissToast,
      }}
    >
      {children}
    </MessagesContext.Provider>
  )
}

export function useMessages() {
  const ctx = useContext(MessagesContext)
  if (!ctx) throw new Error('useMessages must be used inside MessagesProvider')
  return ctx
}
