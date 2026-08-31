import { useEffect, useRef, useState } from 'react'
import { useReelProgress } from '../context/ReelProgressContext'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Play,
  Sparkles,
  AlertTriangle,
  PlayCircle,
} from 'lucide-react'
import { assetUrl } from '../lib/config'

export type FeedReel = {
  id: string
  listingId: string | null
  videoUrl?: string
  status: string
  createdAt: string
  title?: string
  price?: number
  hook?: string | null
  propertyStatus?: string | null
  listingType?: string | null
  listing?: { id: string; title: string; price: number; listingType: string }
}

type Props = {
  reels: FeedReel[]
  downloadingReel: string | null
  onDownload: (id: string) => void
  onRegenerate: (id: string) => void
  onDelete: (id: string) => void
}

export default function ReelsPlayer({
  reels,
  downloadingReel,
  onDownload,
  onRegenerate,
  onDelete,
}: Props) {
  const [index, setIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const [copied, setCopied] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Deleting the last reel would otherwise leave the index past the end.
  const safeIndex = Math.min(index, Math.max(reels.length - 1, 0))
  const reel = reels[safeIndex]

  // Live render progress for the reel on screen, if one is being rendered.
  const { progress } = useReelProgress()
  const live = reel ? progress[reel.id] : undefined

  const go = (delta: number) => {
    if (reels.length < 2) return
    setIndex((i) => (i + delta + reels.length) % reels.length)
    setPaused(false)
    setCopied(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore while typing in a field elsewhere on the page.
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reels.length])

  if (!reel) return null

  const label = reel.listing?.title ?? reel.title ?? 'Untitled reel'
  const price = reel.listing?.price ?? reel.price
  const listingType = reel.listing?.listingType ?? reel.listingType
  const ready = reel.status === 'done' && reel.videoUrl

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play().catch(() => undefined)
      setPaused(false)
    } else {
      v.pause()
      setPaused(true)
    }
  }

  async function copyHook() {
    if (!reel.hook) return
    try {
      await navigator.clipboard.writeText(reel.hook)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked; nothing useful to show
    }
  }

  return (
    <div
      // Fixed dark, not bg-ink: ink inverts with the theme, so in dark mode this
      // surface turned near-white while everything on it stayed white-on-dark.
      // Player chrome sits around a video and should be dark in both themes.
      className="rounded-2xl bg-navy-dark overflow-hidden"
    >
      {/* Stacks on phones; the side arrows only appear once there is room for them */}
      <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-4 p-4 sm:p-7">
        <NavButton
          side="left"
          disabled={reels.length < 2}
          onClick={() => go(-1)}
          className="hidden sm:flex"
        />

        {/* the reel */}
        <div className="relative shrink-0 w-[160px] sm:w-[230px] rounded-xl overflow-hidden bg-black">
          {ready ? (
            <>
              <video
                ref={videoRef}
                key={reel.id}
                src={assetUrl(reel.videoUrl)}
                className="w-full aspect-[9/16] object-cover"
                autoPlay
                muted={muted}
                playsInline
                onEnded={() => go(1)}
                onClick={togglePlay}
              />
              {paused && (
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/20"
                >
                  <span className="w-14 h-14 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                    <Play size={22} className="text-white ml-0.5" fill="white" />
                  </span>
                </button>
              )}
              <button
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/20 text-white flex items-center justify-center hover:bg-black/75 transition-all active:scale-95"
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </>
          ) : (
            <div className="w-full aspect-[9/16] flex items-center justify-center bg-navy">
              {reel.status === 'processing' ? (
                <div className="text-center px-6 w-full">
                  <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  {/* Falls back to the spinner alone until the first progress event
                      arrives — a reload mid-render has no live number to show. */}
                  {live ? (
                    <>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-white/70">{live.label}…</span>
                        <span className="text-gold font-extrabold tabular-nums">
                          {live.percent}%
                        </span>
                      </div>
                      <div
                        className="h-1.5 rounded-full bg-white/15 overflow-hidden"
                        role="progressbar"
                        aria-valuenow={live.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full bg-gold rounded-full transition-[width] duration-500 ease-out"
                          style={{ width: `${live.percent}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-white/60">Generating…</span>
                  )}
                </div>
              ) : reel.status === 'failed' ? (
                <div className="text-center px-5">
                  <AlertTriangle size={22} className="text-red-300 mx-auto mb-2" />
                  <span className="text-xs text-red-300">Generation failed</span>
                </div>
              ) : (
                <PlayCircle size={30} className="text-white/20" />
              )}
            </div>
          )}
        </div>

        {/* details + actions fill the width the video leaves over */}
        <div className="flex-1 min-w-0 text-white text-center sm:text-left w-full">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            {!reel.listingId && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-gold text-navy-dark">
                <Sparkles size={9} />
                AI
              </span>
            )}
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
              {listingType === 'rent' ? 'For rent' : 'For sale'}
            </span>
          </div>

          <h2 className="font-heading text-lg sm:text-2xl font-black truncate">{label}</h2>
          {price !== undefined && (
            <div className="font-heading text-lg font-black text-gold mt-0.5">
              ₱{Number(price).toLocaleString()}
            </div>
          )}

          <div className="mt-2 text-xs text-white/45">
            {ready ? 'Ready to post' : reel.status === 'processing' ? 'Rendering now' : 'Needs another try'}
            {reel.propertyStatus && ` · ${reel.propertyStatus.replace('-', ' ')}`}
          </div>

          {reel.hook && (
            <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-1">
                AI caption
              </div>
              <p className="text-sm text-white/80 leading-snug">{reel.hook}</p>
              <button
                onClick={copyHook}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-gold hover:text-gold-dark transition-colors"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy caption'}
              </button>
            </div>
          )}

          <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-5">
            <button
              onClick={() => onDownload(reel.id)}
              disabled={!ready || downloadingReel === reel.id}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-extrabold hover:bg-gold-dark transition-all active:scale-95 disabled:opacity-40"
            >
              <Download size={15} />
              {downloadingReel === reel.id ? 'Exporting…' : 'Export MP4'}
            </button>
            <button
              onClick={() => onRegenerate(reel.id)}
              disabled={reel.status === 'processing'}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm font-bold hover:bg-white/15 transition-all active:scale-95 disabled:opacity-40"
            >
              <RefreshCw size={15} />
              Regenerate
            </button>
            <button
              onClick={() => onDelete(reel.id)}
              title="Delete reel"
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:bg-red-500/15 hover:text-red-300 hover:border-red-400/30 transition-all active:scale-95"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <NavButton
          side="right"
          disabled={reels.length < 2}
          onClick={() => go(1)}
          className="hidden sm:flex"
        />
      </div>

      {/* On phones the arrows move down here, beside the position dots */}
      {reels.length > 1 && (
        <div className="flex items-center justify-center gap-3 pb-5 px-4">
          <NavButton side="left" disabled={false} onClick={() => go(-1)} className="sm:hidden" />
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {reels.map((r, i) => (
              <button
                key={r.id}
                onClick={() => {
                  setIndex(i)
                  setPaused(false)
                }}
                aria-label={`Go to reel ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === safeIndex ? 'w-6 bg-gold' : 'w-1.5 bg-white/25 hover:bg-white/40'
                }`}
              />
            ))}
            <span className="ml-2 text-[11px] font-semibold text-white/35">
              {safeIndex + 1} of {reels.length}
            </span>
          </div>

          <NavButton side="right" disabled={false} onClick={() => go(1)} className="sm:hidden" />
        </div>
      )}
    </div>
  )
}

function NavButton({
  side,
  disabled,
  onClick,
  className = '',
}: {
  side: 'left' | 'right'
  disabled: boolean
  onClick: () => void
  className?: string
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous reel' : 'Next reel'}
      className={`shrink-0 w-11 h-11 rounded-full bg-white/5 border border-white/10 text-white/60 items-center justify-center hover:bg-white/10 hover:text-white transition-all active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed ${className || 'flex'}`}
    >
      <Icon size={20} />
    </button>
  )
}
