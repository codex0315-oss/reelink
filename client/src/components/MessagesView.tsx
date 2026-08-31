import { useEffect, useRef, useState } from 'react'
import {
  Send,
  ArrowLeft,
  MessageSquare,
  Home,
  Check,
  CheckCheck,
  PanelRight,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMessages, type Participant } from '../context/MessagesContext'
import { assetUrl } from '../lib/config'
import ConversationDetails from './ConversationDetails'
import ConfirmDialog from './ConfirmDialog'


/** Matches the server's typing backstop, with room to spare. */
const TYPING_IDLE_MS = 2500

type Props = {
  /** Set when arriving from a property's Message button. */
  openConversationId?: string | null
  onOpenedConversation?: () => void
  onOpenListing?: (listingId: string) => void
}

export default function MessagesView({
  openConversationId,
  onOpenedConversation,
  onOpenListing,
}: Props) {
  const { user } = useAuth()
  const {
    conversations,
    messages,
    activeId,
    online,
    typingIn,
    loading,
    openThread,
    closeThread,
    removeThread,
    send,
    setTyping,
  } = useMessages()

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // The thread awaiting confirmation, held whole so the dialog can name the person.
  const [deleting, setDeleting] = useState<(typeof conversations)[number] | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  // Docked open on large screens the way the layout intends; on phones it is a sheet,
  // so it starts closed and the thread keeps the full width until asked for.
  const [detailsOpen, setDetailsOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<number | null>(null)

  const active = conversations.find((c) => c.id === activeId) ?? null

  // Arriving from a property page: select the thread it just opened.
  useEffect(() => {
    if (!openConversationId) return
    openThread(openConversationId)
    onOpenedConversation?.()
  }, [openConversationId, openThread, onOpenedConversation])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typingIn])

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
    }
  }, [])

  // Switching conversations dismisses the mobile sheet — it covers the thread, so
  // leaving it up would hide the messages the user just asked to read. On large screens
  // the panel is a column, not an overlay, so it stays where it is.
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) setDetailsOpen(false)
  }, [activeId])

  function handleDraft(value: string) {
    setDraft(value)
    setTyping(value.trim().length > 0)
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => setTyping(false), TYPING_IDLE_MS)
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || sending) return

    setSending(true)
    setDraft('')
    setTyping(false)
    try {
      await send(text)
    } catch {
      setDraft(text) // put it back rather than losing it silently
    } finally {
      setSending(false)
    }
  }

  const otherOnline = active ? online.has(active.otherUser.id) : false
  const otherTyping = activeId ? !!typingIn[activeId] : false

  if (loading) {
    return <p className="text-sm text-ink/40 py-16 text-center">Loading conversations…</p>
  }

  if (conversations.length === 0) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 mx-auto mb-5 flex items-center justify-center">
          <MessageSquare size={22} className="text-gold-dark" />
        </div>
        <h2 className="font-bold text-ink text-lg mb-2">No conversations yet</h2>
        <p className="text-sm text-ink/50 leading-relaxed">
          When you message an agent from a property page — or a buyer messages you about
          one of yours — the conversation appears here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100svh-11rem)] rounded-2xl border border-ink/10 bg-card overflow-hidden">
      {/* ------------------------------------------------------------ inbox */}
      <aside
        className={`w-full sm:w-72 lg:w-80 shrink-0 border-r border-ink/10 overflow-y-auto ${
          activeId ? 'hidden sm:block' : 'block'
        }`}
      >
        {conversations.map((c) => (
          // A row rather than one big button: the delete control is itself a button, and
          // nesting one inside another is invalid and unreachable by keyboard.
          <div
            key={c.id}
            className={`group relative flex items-center border-b border-ink/5 transition-colors ${
              c.id === activeId ? 'bg-gold/10' : 'hover:bg-ink/[0.03]'
            }`}
          >
            <button
              onClick={() => openThread(c.id)}
              className="min-w-0 flex-1 text-left flex gap-3 px-4 py-3.5"
            >
              <Avatar user={c.otherUser} online={online.has(c.otherUser.id)} />
              <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-ink text-sm truncate">{c.otherUser.name}</span>
                <span className="text-[10px] text-ink/35 shrink-0">
                  {shortTime(c.lastMessageAt)}
                </span>
              </div>
              {c.listing && (
                <div className="text-[11px] text-gold-dark truncate">{c.listing.title}</div>
              )}
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-xs text-ink/45 truncate">
                  {typingIn[c.id] ? 'typing…' : (c.lastMessage?.content ?? 'Say hello')}
                </span>
                {c.unreadCount > 0 && (
                  <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-navy-dark text-[10px] font-extrabold flex items-center justify-center">
                    {c.unreadCount}
                  </span>
                )}
                </div>
              </div>
            </button>

            {/* Always present on touch, revealed on hover with a pointer — a control
                that only appears on :hover is unreachable on a phone. */}
            <button
              onClick={() => setDeleting(c)}
              aria-label={`Delete conversation with ${c.otherUser.name}`}
              className="shrink-0 mr-2 w-8 h-8 rounded-lg flex items-center justify-center text-ink/30 hover:text-danger hover:bg-red-500/10 transition-all sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </aside>

      {/* ----------------------------------------------------------- thread */}
      <section className={`flex-1 flex flex-col min-w-0 ${activeId ? 'flex' : 'hidden sm:flex'}`}>
        {!active ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-ink/40">Pick a conversation to start reading.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 px-4 py-3 border-b border-ink/10 shrink-0">
              <button
                onClick={closeThread}
                className="sm:hidden w-8 h-8 rounded-lg flex items-center justify-center text-ink/50 hover:bg-ink/5"
                aria-label="Back to conversations"
              >
                <ArrowLeft size={17} />
              </button>

              <Avatar user={active.otherUser} online={otherOnline} />

              <div className="min-w-0 flex-1">
                <div className="font-bold text-ink text-sm truncate">{active.otherUser.name}</div>
                <div className="text-[11px] text-ink/45">
                  {otherTyping
                    ? 'typing…'
                    : otherOnline
                      ? 'Active now'
                      : lastSeenLabel(active.otherUser.lastSeenAt)}
                </div>
              </div>

              {/* Replaces the old "Property" button: the panel it opens carries the
                  property *and* the agent, so one control now covers both. On large
                  screens the panel is already docked, so this only toggles it. */}
              <button
                onClick={() => setDetailsOpen((d) => !d)}
                aria-label="Conversation details"
                aria-pressed={detailsOpen}
                className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-all ${
                  detailsOpen
                    ? 'bg-gold/15 text-gold-dark'
                    : 'text-ink/45 hover:bg-ink/5 hover:text-ink'
                }`}
              >
                <PanelRight size={17} />
              </button>
            </header>

            {/* lg:hidden — above that width the details panel is docked and carries the
                same property, so keeping the strip too would say it twice. */}
            {active.listing && (
              <div className="lg:hidden flex items-center gap-3 px-4 py-2.5 bg-ink/[0.03] border-b border-ink/5 shrink-0">
                {active.listing.photoUrls?.[0] ? (
                  <img
                    src={assetUrl(active.listing.photoUrls[0])}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <span className="w-10 h-10 rounded-lg bg-ink/10 flex items-center justify-center">
                    <Home size={15} className="text-ink/30" />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink truncate">{active.listing.title}</div>
                  <div className="text-[11px] text-ink/50">
                    ₱{Number(active.listing.price).toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {/* min-h-0 for the same reason as the Amicus panel: without it this column
                will not shrink below its messages, and the composer below gets pushed
                out of the thread instead of staying pinned to the bottom of it. */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2">
              {messages.length === 0 && (
                <p className="text-center text-xs text-ink/35 py-8">
                  No messages yet — say hello.
                </p>
              )}

              {messages.map((m, i) => {
                const mine = m.senderId === user?.id
                // Only the newest of your own messages carries the status word, the
                // way Messenger does — repeating it on every bubble is noise.
                const isLastMine =
                  mine && !messages.slice(i + 1).some((later) => later.senderId === user?.id)

                const prev = messages[i - 1]
                const showDate = !prev || !sameDay(prev.createdAt, m.createdAt)
                // The avatar sits beside the *last* message of a run, so a burst of
                // replies reads as one turn rather than a column of repeated faces.
                const next = messages[i + 1]
                const endsRun = !next || next.senderId !== m.senderId

                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="flex items-center gap-3 py-3">
                        <span className="flex-1 h-px bg-ink/10" />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-ink/35">
                          {dayLabel(m.createdAt)}
                        </span>
                        <span className="flex-1 h-px bg-ink/10" />
                      </div>
                    )}

                    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                      {!mine &&
                        (endsRun ? (
                          <Avatar user={active.otherUser} size="sm" />
                        ) : (
                          // Keeps the bubbles in a run aligned with the one that has it.
                          <span className="w-7 shrink-0" />
                        ))}

                      <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          mine
                            ? 'bg-ink text-app rounded-br-sm'
                            : 'bg-ink/5 text-ink rounded-bl-sm'
                        }`}
                      >
                        {m.content}
                      </div>
                      <div
                        className={`flex items-center gap-1 mt-0.5 text-[10px] text-ink/35 ${
                          mine ? 'justify-end' : ''
                        }`}
                      >
                        {shortTime(m.createdAt)}
                        {mine && <MessageStatus message={m} showLabel={isLastMine} />}
                      </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {otherTyping && (
                <div className="flex justify-start">
                  <div className="bg-ink/5 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* pr on the right keeps the send button clear of the Amicus bubble,
                which is fixed to this same corner of the screen. */}
            <form
              onSubmit={handleSend}
              // Same bottom clearance as the Amicus composer, for the same reason.
              className="flex items-end gap-2 p-3 pr-20 sm:pr-24 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] sm:pb-3 border-t border-ink/10 shrink-0"
            >
              <textarea
                value={draft}
                onChange={(e) => handleDraft(e.target.value)}
                onBlur={() => setTyping(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
                rows={1}
                placeholder="Write a message…"
                className="flex-1 resize-none max-h-28 px-3.5 py-2.5 rounded-xl border border-ink/15 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="w-10 h-10 shrink-0 rounded-xl bg-gold text-navy-dark flex items-center justify-center hover:bg-gold-dark transition-all active:scale-95 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </section>

      {/* ---------------------------------------------------------- details */}
      {/* Docked column from lg up. Width is fixed rather than fractional so the thread
          absorbs the resizing — a message column that changes width as the viewport
          moves is harder to read than a slightly narrower one. */}
      {active && detailsOpen && (
        <aside className="hidden lg:block w-80 shrink-0 border-l border-ink/10">
          <ConversationDetails
            conversation={active}
            online={otherOnline}
            onOpenListing={onOpenListing}
          />
        </aside>
      )}

      {/* Below lg the same panel is a sheet over the thread, so the three columns never
          have to share a phone's width. */}
      {active && detailsOpen && (
        <div className="lg:hidden fixed inset-0 z-[70] flex justify-end">
          <div
            className="absolute inset-0 bg-navy-dark/40 backdrop-blur-sm"
            onClick={() => setDetailsOpen(false)}
          />
          <aside className="relative w-full max-w-sm bg-card border-l border-ink/10 shadow-2xl">
            <ConversationDetails
              conversation={active}
              online={otherOnline}
              onOpenListing={onOpenListing}
              onClose={() => setDetailsOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Says plainly that this is one-sided. "Delete conversation" reads like it wipes
          the thread for both people, and an agent removing a buyer's history by mistake
          is not something an undo button can fix. */}
      <ConfirmDialog
        open={!!deleting}
        title={`Remove conversation with ${deleting?.otherUser.name ?? ''}?`}
        description="It disappears from your inbox only — they keep the conversation and can still reply. If they message you again, the thread comes back."
        confirmLabel="Remove"
        loading={deleteLoading}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          setDeleteLoading(true)
          try {
            await removeThread(deleting.id)
            setDeleting(null)
          } catch {
            // removeThread restores the list itself; the dialog stays open so the
            // failure is visible rather than looking like it worked.
          } finally {
            setDeleteLoading(false)
          }
        }}
      />
    </div>
  )
}

/* --------------------------------------------------------------- helpers */

/**
 * Sent → Delivered → Seen.
 *
 * Delivered comes from the recipient's own acknowledgement, so it is not shown for a
 * message that only reached the server.
 */
function MessageStatus({
  message,
  showLabel,
}: {
  message: { deliveredAt?: string | null; readAt?: string | null }
  showLabel: boolean
}) {
  const seen = !!message.readAt
  const delivered = !!message.deliveredAt

  const label = seen ? 'Seen' : delivered ? 'Delivered' : 'Sent'
  const icon = seen ? (
    <CheckCheck size={12} className="text-gold-dark" />
  ) : delivered ? (
    <CheckCheck size={12} />
  ) : (
    <Check size={12} />
  )

  return (
    <span
      className={`flex items-center gap-0.5 ${seen ? 'text-gold-dark' : ''}`}
      title={label}
    >
      {showLabel && <span className="mr-0.5">{label}</span>}
      {icon}
    </span>
  )
}

function Avatar({
  user,
  online,
  size = 'md',
}: {
  user: Participant
  /** Omitted for the small in-thread avatars, which carry no presence dot. */
  online?: boolean
  size?: 'sm' | 'md'
}) {
  const box = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-10 h-10 text-sm'

  return (
    <span className="relative shrink-0">
      {user.avatarUrl ? (
        <img
          src={assetUrl(user.avatarUrl)}
          alt=""
          className={`${box} rounded-full object-cover border border-ink/10`}
        />
      ) : (
        <span
          className={`${box} rounded-full bg-ink/10 text-ink/60 flex items-center justify-center font-black`}
        >
          {user.name?.[0]?.toUpperCase() ?? 'R'}
        </span>
      )}
      {/* The ring keeps the dot legible whichever colour the avatar happens to be.
          Skipped at sm: presence belongs to the header, not to every bubble. */}
      {size === 'md' && (
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-card ${
            online ? 'bg-emerald-500' : 'bg-ink/25'
          }`}
        />
      )}
    </span>
  )
}

/** Same calendar day, in the reader's own timezone. */
function sameDay(a: string, b: string) {
  const x = new Date(a)
  const y = new Date(b)
  return x.toDateString() === y.toDateString()
}

/** "Today" / "Yesterday" / a date, for the dividers between days. */
function dayLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    // Only worth the width once the conversation crosses into another year.
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

function shortTime(iso: string) {
  const date = new Date(iso)
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h`
  return date.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })
}

function lastSeenLabel(lastSeenAt?: string | null) {
  if (!lastSeenAt) return 'Offline'
  const mins = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60000)
  if (mins < 1) return 'Active just now'
  if (mins < 60) return `Active ${mins}m ago`
  if (mins < 60 * 24) return `Active ${Math.floor(mins / 60)}h ago`
  return `Active ${Math.floor(mins / 1440)}d ago`
}
