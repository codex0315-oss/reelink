import { useEffect, useRef, useState } from 'react'
import { X, Send, ImagePlus, Trash2, AlertCircle, Minus } from 'lucide-react'
import { fetchChatHistory, sendChatMessage, clearChatHistory } from '../lib/api'
import AmicusMark from './AmicusMark'
import { assetUrl } from '../lib/config'

type ChatMessage = {
  id: string
  role: string
  content: string
  imageUrls: string[]
  createdAt: string
}

type Props = {
  token: string
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** Lifted, so the sidebar entry can un-park a window that is already open. */
  minimized: boolean
  onMinimizedChange: (m: boolean) => void
}

const SUGGESTIONS = [
  'What taxes do I pay when selling a house?',
  'Write a Facebook caption for my newest listing',
  'Which of my listings still needs a reel?',
  'How do I generate a reel in Reelink?',
]

export default function AmicusPanel({
  token,
  open,
  onOpen,
  onClose,
  minimized,
  onMinimizedChange,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keeps the setState(prev => …) shape the call sites already use.
  const setMinimized = (next: boolean | ((m: boolean) => boolean)) =>
    onMinimizedChange(typeof next === 'function' ? next(minimized) : next)

  // Load once on first open, then keep whatever is in memory.
  useEffect(() => {
    if (!open || !token) return
    fetchChatHistory(token)
      .then(setMessages)
      .catch(() => undefined)
  }, [open, token])

  // Keep the newest message in view as the conversation grows. Also runs when the
  // window is restored, since the scroller does not exist while it is collapsed.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, minimized])

  /**
   * The window has to stay mounted while it collapses, or it would vanish instead of
   * animating into the bubble. `exiting` runs the outbound keyframes first and applies
   * the state change once they finish.
   */
  const [exiting, setExiting] = useState(false)
  const exitTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current)
    }
  }, [])

  function collapse(then: () => void) {
    if (exiting) return
    setExiting(true)
    // Matches .amicus-out in index.css.
    exitTimer.current = window.setTimeout(() => {
      setExiting(false)
      then()
    }, 200)
  }

  /**
   * The bubble is a three-way toggle: it opens a closed window, parks an open one,
   * and brings a parked one back — so one control covers every state.
   */
  function handleBubble() {
    if (!open) {
      setMinimized(false)
      onOpen()
    } else if (minimized) {
      setMinimized(false)
    } else {
      collapse(() => setMinimized(true))
    }
  }

  // Escape closes the panel, through the same collapse as the buttons.
  useEffect(() => {
    if (!open || minimized) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse(onClose)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // collapse is stable enough for this; re-binding on every render is not wanted.
  }, [open, minimized, onClose])

  async function handleSend(e?: React.FormEvent, preset?: string) {
    e?.preventDefault()
    const text = preset ?? input
    if ((!text.trim() && images.length === 0) || sending) return

    setError('')
    setSending(true)

    // Show the user's message straight away instead of waiting for the round trip.
    const optimistic: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: text,
      imageUrls: images.map((f) => URL.createObjectURL(f)),
      createdAt: new Date().toISOString(),
    }
    setMessages((m) => [...m, optimistic])
    setInput('')
    const sentImages = images
    setImages([])

    try {
      const formData = new FormData()
      formData.append('message', text)
      sentImages.forEach((file) => formData.append('images', file))
      const reply = await sendChatMessage(token, formData)
      setMessages((m) => [...m, reply])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Amicus could not reply')
      // Drop the optimistic message so the thread doesn't show an unanswered question.
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id))
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  async function handleClear() {
    if (!token) return
    try {
      await clearChatHistory(token)
      setMessages([])
      setError('')
    } catch {
      // fail silently for now
    }
  }

  return (
    <>
      {/* No backdrop by design: the page stays scrollable and clickable with the chat
          open, which is the point of docking it rather than covering the screen. */}
      {open && !minimized && (
        <div
          // 100svh, not 100vh or 100dvh. All three differ only on mobile: vh and dvh can
          // both be the *tall* viewport — the height with the browser toolbar retracted —
          // so a box sized to them runs underneath the toolbar, taking the composer at
          // the bottom of this column with it. svh is the height with chrome at its
          // largest, so the composer is reachable whether the toolbar is up or not.
          // This panel also stops the page scrolling while open, which is what keeps the
          // toolbar shown, so svh is the honest measurement here rather than a shortfall.
          className={`fixed z-50 flex flex-col bg-card shadow-2xl border-ink/10 amicus-window
            inset-x-0 top-0 h-[100svh]
            sm:inset-auto sm:h-[640px] sm:bottom-6 sm:right-6 sm:w-[420px]
            sm:max-h-[calc(100dvh-3rem)] sm:border sm:rounded-2xl ${
              exiting ? 'amicus-out' : 'amicus-in'
            }`}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-ink/10 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <AmicusMark className="w-9 h-9 rounded-full object-cover shrink-0" />
              <div className="min-w-0">
                <div className="font-heading font-bold text-ink text-sm truncate">Amicus AI</div>
                <div className="text-[11px] text-ink/45 truncate">
                  Philippine real estate assistant
                </div>
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {messages.length > 0 && (
                <button
                  onClick={handleClear}
                  title="Clear conversation"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-ink/35 hover:text-danger hover:bg-red-500/10 transition-all"
                >
                  <Trash2 size={15} />
                </button>
              )}
              {/* Minimising collapses into the bubble, so it is desktop-only — the
                  bubble is hidden behind a full-screen sheet on a phone. */}
              <button
                onClick={() => collapse(() => setMinimized(true))}
                title="Minimise"
                aria-label="Minimise"
                className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center text-ink/40 hover:text-ink hover:bg-ink/5 transition-all"
              >
                <Minus size={17} />
              </button>
              <button
                onClick={() => collapse(onClose)}
                aria-label="Close"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink/40 hover:text-ink hover:bg-ink/5 transition-all"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* conversation */}
            {/* min-h-0 is what keeps the composer on screen. A flex item defaults to
                min-height:auto, so this column refused to shrink below the height of the
                messages inside it and pushed the composer past the bottom of the panel —
                which is why the input was cut off on a phone no matter what height the
                panel itself was given. */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4">
              {messages.length === 0 && (
                <div className="text-center pt-6">
                  <AmicusMark className="w-14 h-14 rounded-full mx-auto mb-4" />
                  <h3 className="font-heading font-bold text-ink text-sm">
                    Ask me about property
                  </h3>
                  <p className="text-xs text-ink/50 mt-1.5 mb-6 leading-relaxed max-w-[280px] mx-auto px-2">
                    Taxes, financing, pricing, paperwork, marketing copy, or how to use Reelink. I can
                    see your listings, and you can send me photos.
                  </p>
                  <div className="space-y-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(undefined, s)}
                        className="w-full text-left px-3.5 py-2.5 rounded-xl border border-ink/10 text-xs text-ink/70 hover:border-gold hover:bg-gold/5 transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const mine = msg.role === 'user'
                return (
                  <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] ${mine ? 'items-end' : 'items-start'}`}>
                      {msg.imageUrls.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
                          {msg.imageUrls.map((url) => (
                            <img
                              key={url}
                              src={url.startsWith('blob:') ? url : assetUrl(url)}
                              alt=""
                              className="w-20 h-20 rounded-lg object-cover border border-ink/10"
                            />
                          ))}
                        </div>
                      )}
                      {msg.content && (
                        <div
                          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                            mine
                              ? 'bg-ink text-app rounded-br-sm'
                              : 'bg-ink/5 text-ink rounded-bl-sm'
                          }`}
                        >
                          {stripMarkdown(msg.content)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {sending && (
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

              {error && (
                <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-danger text-xs">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>

            {/* composer */}
            {/* shrink-0 is the other half of the fix above: the scroll area may now
                shrink, so this must refuse to, or a long conversation squashes the
                composer instead of scrolling behind it. */}
            {/* Extra bottom padding on phones. Partly thumb comfort, partly insurance:
                the very bottom edge of a phone screen is where home indicators, gesture
                bars and preview-tool bezels all land, and an input flush against it is
                the one control a user cannot afford to have clipped. env() adds a real
                inset on devices that report one. */}
            <div className="border-t border-ink/10 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:pb-4 shrink-0">
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {images.map((file, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={URL.createObjectURL(file)}
                        alt=""
                        className="w-14 h-14 rounded-lg object-cover border border-ink/10"
                      />
                      <button
                        type="button"
                        onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSend} className="flex items-end gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  id="amicus-images"
                  className="hidden"
                  onChange={(e) => {
                    // Snapshot the files first. React runs the updater below during
                    // the render pass, i.e. after this handler returns — so reading
                    // e.target.files inside it saw the list already emptied by the
                    // reset on the next line, and nothing ever attached.
                    const picked = Array.from(e.target.files ?? [])
                    // Reset so picking the same file twice still fires a change.
                    e.target.value = ''
                    if (picked.length) setImages((p) => [...p, ...picked].slice(0, 4))
                  }}
                />
                <label
                  htmlFor="amicus-images"
                  title="Attach a photo"
                  className="w-10 h-10 shrink-0 rounded-xl border border-ink/15 flex items-center justify-center text-ink/45 hover:text-gold-dark hover:border-gold cursor-pointer transition-all"
                >
                  <ImagePlus size={17} />
                </label>

                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter makes a new line.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  rows={1}
                  placeholder="Ask about property, or send a photo…"
                  className="flex-1 resize-none max-h-28 px-3.5 py-2.5 rounded-xl border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
                />

                <button
                  type="submit"
                  disabled={sending || (!input.trim() && images.length === 0)}
                  className="w-10 h-10 shrink-0 rounded-xl bg-gold text-navy-dark flex items-center justify-center hover:bg-gold-dark transition-all active:scale-95 disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </form>

              <p className="text-[10px] text-ink/35 mt-2 text-center">
                Amicus can be wrong. Confirm figures with a broker, lawyer or the BIR.
              </p>
            </div>
        </div>
      )}

      {/* The dock icon. It is hidden while the window is out — including during the
          collapse — so the window looks like it is being pulled back into it. */}
      {(!open || minimized) && !exiting && (
        <button
          onClick={handleBubble}
          aria-label={minimized ? 'Reopen Amicus AI' : 'Open Amicus AI'}
          title={minimized ? 'Reopen Amicus AI' : 'Ask Amicus AI'}
          // Brand gold rather than the card colour: a white bubble on a near-white
          // page measured 1.04:1 against the background — effectively invisible.
          // gold-dark is the best single colour for both themes (2.56:1 on light,
          // 7.27:1 on dark), and the ink-tinted ring adapts on its own: a dark edge
          // on the light theme, a light one on dark.
          // Sits much higher on a phone than on a desktop. A fixed element is placed
          // against the *layout* viewport, which on mobile extends underneath the
          // browser's own chrome — at 24px from the bottom the bubble ended up behind
          // the toolbar, or clipped off the screen entirely. The 5rem is what actually
          // fixes that; the env() term is 0 today (it only reports a real inset under
          // viewport-fit=cover) and is there so this stays correct if that is ever set.
          className="amicus-bubble fixed right-5 sm:right-6 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-40 w-16 h-16 rounded-full bg-gold-dark ring-2 ring-ink/20 shadow-xl shadow-gold-dark/40 flex items-center justify-center hover:scale-105 hover:bg-gold active:scale-95 transition-all"
        >
          {/* Pinned dark: the bubble stays gold in both themes, so the mark must too. */}
          <AmicusMark tone="dark" className="w-9 h-9 object-contain" />
          {/* Same idea as the dot under a running app in the Dock. */}
          {minimized && (
            <span className="absolute -bottom-1 w-2 h-2 rounded-full bg-navy-dark" />
          )}
        </button>
      )}
    </>
  )
}

/** The model still emits light markdown; render it as clean text in the bubble. */
function stripMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)\*(?!\s)(.+?)\*/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '')
    .trim()
}
