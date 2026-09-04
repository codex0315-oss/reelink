import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, Check, RotateCcw, Play } from 'lucide-react'

/**
 * What the product does, played out rather than described.
 *
 * A scripted sequence, not a live call. That is a deliberate trade: a real request
 * would need an endpoint open to anyone who finds it, and on a cold instance the first
 * visitor would watch nothing happen for the better part of a minute — on the one page
 * whose job is to convince them. The animation is identical either way; only the source
 * of the words differs, and the panel says plainly that this is an example.
 *
 * The words themselves are the shape our model actually produces: a short hook, a
 * caption with the price and a couple of real features, and hashtags. Nothing here
 * claims a capability the product does not have.
 */

const FIELDS = [
  { label: 'Property', value: 'Condo in Cebu City' },
  { label: 'Price', value: '₱13,000 / month' },
  { label: 'Details', value: '130 sqm · Fully furnished · Parking, Pool' },
] as const

const CAPTION =
  'Fully furnished 130 sqm condo in Cebu City — ₱13,000 a month, with parking and pool access. Message me for a viewing. #CebuCondo #ForRentCebu #ReelinkPH'

const HOOK = 'LIVE LUXE IN CEBU'

/** Milliseconds per typed character. Fast enough to read along, slow enough to watch. */
const TYPE_MS = 18

type Phase = 'idle' | 'filling' | 'writing' | 'rendering' | 'done'

export default function HeroDemo() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [visibleFields, setVisibleFields] = useState(0)
  const [typed, setTyped] = useState('')
  const [progress, setProgress] = useState(0)
  const timers = useRef<number[]>([])
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }, [])

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const run = useCallback(() => {
    clear()
    setTyped('')
    setProgress(0)
    setVisibleFields(0)

    // Reduced motion still gets the outcome, just without the performance.
    if (reduced.current) {
      setVisibleFields(FIELDS.length)
      setTyped(CAPTION)
      setProgress(100)
      setPhase('done')
      return
    }

    setPhase('filling')
    FIELDS.forEach((_, i) => after(400 * (i + 1), () => setVisibleFields(i + 1)))

    after(400 * FIELDS.length + 500, () => {
      setPhase('writing')
      for (let i = 1; i <= CAPTION.length; i++) {
        after(i * TYPE_MS, () => setTyped(CAPTION.slice(0, i)))
      }

      const writingDone = CAPTION.length * TYPE_MS + 400
      after(writingDone, () => {
        setPhase('rendering')
        for (let p = 1; p <= 100; p++) {
          after(p * 12, () => setProgress(p))
        }
        after(100 * 12 + 300, () => setPhase('done'))
      })
    })
  }, [after, clear])

  // Starts itself when scrolled to, so the first thing a visitor sees is the product
  // working rather than a button asking them to care first.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      run()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        run()
      },
      { threshold: 0.3 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      clear()
    }
  }, [run, clear])

  useEffect(() => clear, [clear])

  const started = phase !== 'idle'

  return (
    <div
      ref={ref}
      className="rounded-2xl bg-panel/80 backdrop-blur-sm border border-line/12 shadow-2xl shadow-black/20 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line/10">
        <span className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="ml-1 text-[11px] font-bold uppercase tracking-widest text-content/40">
          Example — not a live render
        </span>
        {phase === 'done' && (
          <button
            onClick={run}
            className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-content/50 hover:text-gold transition-colors"
          >
            <RotateCcw size={12} />
            Replay
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line/10">
        {/* What the agent types */}
        <div className="p-5">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-content/40 mb-3">
            You enter
          </div>
          <div className="space-y-2.5">
            {FIELDS.map((field, i) => (
              <div
                key={field.label}
                className={`transition-all duration-500 ${
                  i < visibleFields ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wide text-content/35">
                  {field.label}
                </div>
                <div className="text-sm font-semibold mt-0.5">{field.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* What Reelink returns */}
        <div className="p-5 bg-line/[0.02]">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles size={12} className="text-gold" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-gold">
              Reelink writes
            </span>
          </div>

          <p className="text-sm leading-relaxed text-content/80 min-h-[6rem]">
            {typed}
            {phase === 'writing' && (
              <span className="inline-block w-[2px] h-4 align-middle bg-gold ml-0.5 animate-pulse" />
            )}
          </p>

          {/* The render bar shares the space rather than appearing below it, so the
              panel never grows and pushes the page around mid-animation. */}
          <div className="mt-4 h-12">
            {(phase === 'rendering' || phase === 'done') && (
              <>
                <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                  <span className="flex items-center gap-1.5 text-content/60">
                    {phase === 'done' ? (
                      <>
                        <Check size={12} className="text-emerald-500" />
                        Reel ready — 1080×1920
                      </>
                    ) : (
                      <>
                        <Play size={11} className="text-gold" />
                        Rendering the reel
                      </>
                    )}
                  </span>
                  <span className="text-content/40">{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-line/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gold transition-[width] duration-100 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {phase === 'done' && (
                  <div className="mt-2 text-[11px] font-bold text-content/45">
                    Hook burned in: “{HOOK}”
                  </div>
                )}
              </>
            )}
            {started && phase !== 'rendering' && phase !== 'done' && (
              <div className="text-[11px] text-content/35 pt-1">
                {phase === 'filling' ? 'Reading your listing…' : 'Writing the caption…'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
