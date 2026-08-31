import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Move, Compass } from 'lucide-react'
import 'pannellum/build/pannellum.css'
import 'pannellum/build/pannellum.js'
import type { PannellumViewer } from '../types/pannellum'
import { assetUrl } from '../lib/config'

type Props = {
  /** 360 photos, already validated as panorama-shaped by the server. */
  panoramas: string[]
  /** Room names from the vision model, positional. May be shorter than panoramas. */
  labels?: string[]
  title: string
  onClose: () => void
}


/**
 * A true 360 panorama is equirectangular: exactly 2:1, the whole sphere unwrapped.
 * The tolerance covers images cropped by a pixel or two.
 */
const EQUIRECT_TOLERANCE = 0.06

/**
 * Vertical field of view assumed for a phone sweep panorama, which carries no
 * metadata saying how much of the scene it covers. With pixels-per-degree constant
 * across a cylindrical sweep, the horizontal arc is simply aspect × this.
 */
const ASSUMED_VAOV = 70

/** Starting horizontal field of view — roughly what a person sees looking ahead. */
const START_HFOV = 100

/** Degrees per second. Negative turns to the left, which reads as walking in. */
const ROTATE_SPEED = -2

/** How long after a drag before the slow rotation picks up again. */
const ROTATE_RESUME_MS = 3500

type Coverage = { haov: number; vaov: number; full: boolean }

/** Works out how much of the sphere an image actually covers. */
function coverageFor(width: number, height: number): Coverage {
  const aspect = width / height
  if (Math.abs(aspect - 2) <= EQUIRECT_TOLERANCE) {
    return { haov: 360, vaov: 180, full: true }
  }
  return {
    haov: Math.min(360, Math.round(aspect * ASSUMED_VAOV)),
    vaov: ASSUMED_VAOV,
    full: false,
  }
}

export default function VirtualTour({ panoramas, labels = [], title, onClose }: Props) {
  const [index, setIndex] = useState(0)

  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + panoramas.length) % panoramas.length),
    [panoramas.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  // The page behind a full-screen tour must not scroll.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  if (panoramas.length === 0) return null

  const label = labels[index] || `Room ${index + 1}`

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* ----------------------------------------------------------- header */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-heading font-bold text-sm sm:text-base truncate">
              {title}
            </h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold text-navy-dark text-[10px] font-extrabold uppercase tracking-wide shrink-0">
              <Compass size={10} />
              360°
            </span>
          </div>
          <p className="text-white/60 text-xs mt-0.5">
            {label}
            {panoramas.length > 1 && ` · ${index + 1} of ${panoramas.length}`}
          </p>
        </div>

        <button
          onClick={onClose}
          aria-label="Close tour"
          className="w-10 h-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        >
          <X size={19} />
        </button>
      </div>

      {/* ------------------------------------------------------------ stage */}
      <div className="flex-1 min-h-0 relative">
        <PanoramaView key={panoramas[index]} src={assetUrl(panoramas[index])} />

        {panoramas.length > 1 && (
          <>
            <StageArrow side="left" onClick={() => go(-1)} />
            <StageArrow side="right" onClick={() => go(1)} />
          </>
        )}
      </div>

      {/* --------------------------------------------------------- filmstrip */}
      {panoramas.length > 1 && (
        <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/85 to-transparent pt-10 pb-4 px-4 sm:px-6">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {panoramas.map((p, i) => (
              <button
                key={p}
                onClick={() => setIndex(i)}
                title={labels[i] || `Room ${i + 1}`}
                className={`relative w-28 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                  i === index ? 'border-gold' : 'border-transparent opacity-55 hover:opacity-90'
                }`}
              >
                <img src={assetUrl(p)} alt="" className="w-full h-full object-cover" />
                {labels[i] && (
                  <span className="absolute bottom-0 inset-x-0 bg-black/65 text-white text-[9px] font-bold px-1 py-0.5 truncate">
                    {labels[i]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * True 360 viewer.
 *
 * Pannellum maps the equirectangular image back onto a sphere and renders it with a
 * perspective camera, which is what makes straight lines look straight. Showing the
 * same image flat — as this did before — is why ceilings bowed and doorways curved:
 * an equirectangular frame is a sphere unwrapped, so it only looks right re-wrapped.
 */
function PanoramaView({ src }: { src: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<PannellumViewer | null>(null)
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCoverage(null)
    setFailed(false)

    // The image is measured first: a full sphere and a phone sweep need different
    // haov/vaov, and passing the wrong one stretches the scene across the sphere.
    const probe = new Image()
    probe.onload = () => {
      if (cancelled || !hostRef.current) return
      const found = coverageFor(probe.naturalWidth, probe.naturalHeight)

      viewerRef.current = window.pannellum.viewer(hostRef.current, {
        type: 'equirectangular',
        panorama: src,
        autoLoad: true,
        autoRotate: ROTATE_SPEED,
        // Pannellum stops rotating the moment the viewer drags, then restarts after
        // this delay — the "pause on touch, resume when idle" behaviour.
        autoRotateInactivityDelay: ROTATE_RESUME_MS,
        haov: found.haov,
        vaov: found.vaov,
        hfov: START_HFOV,
        minHfov: 50,
        maxHfov: 120,
        showZoomCtrl: false,
        showFullscreenCtrl: false,
        compass: false,
        keyboardZoom: false,
      })
      setCoverage(found)
    }
    probe.onerror = () => {
      if (!cancelled) setFailed(true)
    }
    probe.src = src

    return () => {
      cancelled = true
      // Each panorama gets a fresh viewer; without this the WebGL context leaks.
      viewerRef.current?.destroy()
      viewerRef.current = null
    }
  }, [src])

  return (
    <div className="absolute inset-0 bg-black">
      {/* Inline, because Pannellum's own stylesheet loads after ours and paints a
          light grey wireframe backdrop that flashes before the sphere appears. */}
      <div ref={hostRef} className="w-full h-full" style={{ background: '#000' }} />

      {!coverage && !failed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-9 h-9 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-sm text-white/60">This 360 photo could not be loaded.</p>
        </div>
      )}

      {coverage && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 text-white/85 text-xs font-semibold pointer-events-none">
          <Move size={13} />
          {coverage.full
            ? 'Drag to look around · full 360°'
            : `Drag to look around · ${coverage.haov}° view`}
        </div>
      )}
    </div>
  )
}
function StageArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous room' : 'Next room'}
      className={`absolute top-1/2 -translate-y-1/2 ${
        side === 'left' ? 'left-3 sm:left-5' : 'right-3 sm:right-5'
      } w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur-sm transition-colors z-10`}
    >
      <Icon size={22} />
    </button>
  )
}
