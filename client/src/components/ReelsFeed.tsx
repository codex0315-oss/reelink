import { useEffect, useRef, useState } from 'react'
import {
  Download,
  PlayCircle,
  Volume2,
  VolumeX,
  Play,
  Sparkles,
  Phone,
  MessageSquare,
  Home,
  Clock,
} from 'lucide-react'
import { assetUrl } from '../lib/config'
import ConfirmDialog from './ConfirmDialog'

export type FeedReel = {
  id: string
  listingId: string | null
  videoUrl?: string
  status: string
  createdAt: string
  title?: string
  price?: number
  listing?: { id: string; title: string; price: number; listingType: string }
  /** Present on the public feed; absent on the user's own library. */
  user?: { id: string; name: string; avatarUrl?: string | null; phone?: string | null }
}

type Props = {
  reels: FeedReel[]
  downloadingReel: string | null
  onDownload: (reelId: string) => void
  /** Used to tell the viewer's own reels from everyone else's. */
  currentUserId?: string
  onOpenListing?: (listingId: string) => void
  /** Distinguishes "still fetching" from "nobody has posted a reel". */
  loading?: boolean
}


export default function ReelsFeed({
  reels,
  downloadingReel,
  onDownload,
  currentUserId,
  onOpenListing,
  loading = false,
}: Props) {
  // Browsers refuse to autoplay audio, so every reel starts muted and the viewer
  // opts into sound. One toggle for the whole feed, so it survives scrolling.
  const [muted, setMuted] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [soonFor, setSoonFor] = useState<string | null>(null)
  /** The reel whose seller is about to be called, held so the dialog can name them. */
  const [calling, setCalling] = useState<FeedReel | null>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  // Play whichever reel is currently filling the viewport and pause the rest, so
  // scrolling behaves like a normal short-video feed.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute('data-reel-id')
          if (!id) return
          const video = videoRefs.current[id]
          if (!video) return

          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setActiveId(id)
            void video.play().catch(() => {
              // autoplay can still be refused; the play button remains available
            })
          } else {
            video.pause()
          }
        })
      },
      { root: containerRef.current, threshold: [0, 0.6, 1] },
    )

    const items = containerRef.current?.querySelectorAll('[data-reel-id]')
    items?.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [reels])

  function togglePlay(id: string) {
    const video = videoRefs.current[id]
    if (!video) return
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }

  // Both states keep the feed's own dark frame rather than falling back to the page's
  // empty state, so switching to Feed does not change the shape of the screen while
  // it loads or when there is genuinely nothing to show.
  if (loading || reels.length === 0) {
    return (
      <div className="h-[calc(100dvh-14rem)] sm:h-[calc(100dvh-12rem)] rounded-2xl bg-navy-dark flex flex-col items-center justify-center text-center px-8">
        {loading ? (
          <>
            <div className="w-9 h-9 border-2 border-gold border-t-transparent rounded-full animate-spin mb-4" />
            <span className="text-sm text-white/60">Loading reels…</span>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 mb-5 flex items-center justify-center">
              <PlayCircle size={22} className="text-gold" />
            </div>
            <h2 className="font-bold text-white text-lg mb-2">No reels to show yet</h2>
            <p className="text-sm text-white/50 leading-relaxed max-w-xs">
              Nobody has published a reel yet. Create one from a listing and it will
              appear here for other agents and buyers to see.
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      // Fixed dark rather than bg-ink, which inverts with the theme — the overlays
      // on top of each reel are white-on-dark in both themes.
      className="h-[calc(100dvh-14rem)] sm:h-[calc(100dvh-12rem)] overflow-y-auto snap-y snap-mandatory rounded-2xl bg-navy-dark scrollbar-hide"
    >
      {reels.map((reel) => {
        const isReady = reel.status === 'done' && reel.videoUrl
        const seller = reel.user
        const isMine = !!currentUserId && seller?.id === currentUserId
        const phone = seller?.phone?.trim()

        return (
          <div
            key={reel.id}
            data-reel-id={reel.id}
            className="h-full snap-start flex items-center justify-center relative px-4 py-4"
          >
            <div className="relative h-full aspect-[9/16] max-w-full rounded-xl overflow-hidden bg-black">
              {isReady ? (
                <video
                  ref={(el) => {
                    videoRefs.current[reel.id] = el
                  }}
                  src={assetUrl(reel.videoUrl)}
                  className="w-full h-full object-cover"
                  loop
                  muted={muted}
                  playsInline
                  onClick={() => togglePlay(reel.id)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-navy/90">
                  {reel.status === 'processing' ? (
                    <div className="text-center px-6">
                      <div className="w-9 h-9 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <span className="text-sm text-white/60">Generating your reel…</span>
                    </div>
                  ) : reel.status === 'failed' ? (
                    <span className="text-sm text-red-300 px-6 text-center">
                      Generation failed. Try creating it again.
                    </span>
                  ) : (
                    <PlayCircle size={40} className="text-white/20" />
                  )}
                </div>
              )}

              {/* The reel already burns the headline, price and status into the video,
                  so the overlay carries who made it and how to reach them instead —
                  repeating the title here just printed it twice on the same frame. */}
              {!reel.listingId && (
                <span className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold bg-gold text-navy-dark">
                  <Sparkles size={9} />
                  AI
                </span>
              )}

              <div className="absolute left-0 right-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-black via-black/75 to-transparent">
                {seller && (
                  <div className="flex items-center gap-2.5 mb-3">
                    {seller.avatarUrl ? (
                      <img
                        src={assetUrl(seller.avatarUrl)}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover border-2 border-white/25"
                      />
                    ) : (
                      <span className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center text-sm font-black border-2 border-white/25">
                        {seller.name?.[0]?.toUpperCase() ?? 'R'}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="text-white font-bold text-sm truncate drop-shadow">
                        {seller.name}
                      </div>
                      <div className="text-white/55 text-[11px]">
                        {isMine ? 'Your reel' : 'Listed this property'}
                      </div>
                    </div>
                  </div>
                )}

                {/* A buyer who just watched the reel can act on it without leaving. */}
                {!isMine && (
                  <div className="flex items-center gap-2">
                    {/* Confirms first, like the property page. Handing a number
                        straight to the OS from a video that autoplays past is an easy
                        way to dial someone by accident. */}
                    <button
                      type="button"
                      onClick={() => phone && setCalling(reel)}
                      disabled={!phone}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                        phone
                          ? 'bg-white text-navy-dark hover:bg-white/90 active:scale-95'
                          : 'bg-white/15 text-white/40 cursor-not-allowed'
                      }`}
                    >
                      <Phone size={15} />
                      {phone ? 'Call' : 'No number'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSoonFor((s) => (s === reel.id ? null : reel.id))}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/25 text-sm font-bold text-white/80 hover:bg-white/10 transition-all"
                    >
                      <MessageSquare size={15} />
                      Message
                    </button>
                  </div>
                )}

                {soonFor === reel.id && (
                  <p className="flex items-start gap-1.5 mt-2 px-3 py-2 rounded-lg bg-white/10 text-[11px] text-white/75">
                    <Clock size={12} className="shrink-0 mt-0.5 text-gold" />
                    In-app messaging is still being built. Call for now.
                  </p>
                )}

                {reel.listingId && onOpenListing && (
                  <button
                    type="button"
                    onClick={() => onOpenListing(reel.listingId as string)}
                    className="w-full flex items-center justify-center gap-2 mt-2 py-2 rounded-xl bg-gold text-navy-dark text-sm font-extrabold hover:bg-gold-dark transition-all active:scale-95"
                  >
                    <Home size={15} />
                    View property
                  </button>
                )}
              </div>

              {/* Action rail */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-3">
                {isReady && (
                  <button
                    onClick={() => setMuted((m) => !m)}
                    title={muted ? 'Unmute voiceover' : 'Mute'}
                    className="w-11 h-11 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-all active:scale-95"
                  >
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                )}
                {/* Exporting someone else's reel is not an option, so this is owner-only. */}
                {isMine && (
                  <button
                    onClick={() => onDownload(reel.id)}
                    disabled={!isReady || downloadingReel === reel.id}
                    title="Export video"
                    className="w-11 h-11 rounded-full bg-gold text-navy-dark flex items-center justify-center hover:bg-gold-dark transition-all active:scale-95 disabled:opacity-40"
                  >
                    <Download size={18} />
                  </button>
                )}
              </div>

              {/* Paused indicator */}
              {isReady && activeId !== reel.id && (
                <button
                  onClick={() => togglePlay(reel.id)}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="w-14 h-14 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
                    <Play size={22} className="text-white ml-0.5" fill="white" />
                  </span>
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* One dialog for the whole feed rather than one per reel: only ever a single
          call is being confirmed, and the feed can hold dozens of reels. */}
      <ConfirmDialog
        open={!!calling}
        icon={Phone}
        danger={false}
        title={`Call ${calling?.user?.name ?? 'this agent'}?`}
        description={`This opens your phone app and dials ${calling?.user?.phone?.trim() ?? ''}. Standard call charges apply.`}
        confirmLabel="Call now"
        cancelLabel="Not now"
        onCancel={() => setCalling(null)}
        onConfirm={() => {
          const number = calling?.user?.phone?.trim()
          setCalling(null)
          if (number) window.location.href = `tel:${number.replace(/\s+/g, '')}`
        }}
      />
    </div>
  )
}
