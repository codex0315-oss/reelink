import { useEffect, useState } from 'react'
import { Clapperboard, Check, X } from 'lucide-react'
import { useReelProgress } from '../context/ReelProgressContext'

/** The success dialog closes itself, so a finished reel never needs dismissing. */
const AUTO_CLOSE_MS = 5000

/**
 * One dialog covering the whole render: the percentage while it runs, then a success
 * state when it lands.
 *
 * It opens by itself the moment a render starts and closes by itself when the reel is
 * ready — nothing here waits on a refresh. "Hide" exists because a render takes a
 * minute and the user should be able to carry on; hiding only dismisses the progress
 * view, and the success dialog still appears when the reel is done.
 */
export default function ReelProgressDialog({ onViewReel }: { onViewReel: () => void }) {
  const { progress, finished, dismissFinished } = useReelProgress()
  const active = Object.values(progress)[0]

  // Reset per render, so hiding one reel's progress doesn't hide the next one's.
  const [hiddenFor, setHiddenFor] = useState<string | null>(null)
  useEffect(() => {
    if (active && hiddenFor && active.reelId !== hiddenFor) setHiddenFor(null)
  }, [active, hiddenFor])

  // The success state takes itself off screen.
  useEffect(() => {
    if (!finished) return
    const timer = window.setTimeout(dismissFinished, AUTO_CLOSE_MS)
    return () => window.clearTimeout(timer)
  }, [finished, dismissFinished])

  const showProgress = !!active && hiddenFor !== active.reelId
  if (!showProgress && !finished) return null

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-navy-dark/50 backdrop-blur-sm">
      <div className="amicus-window amicus-in w-full max-w-sm rounded-2xl bg-card border border-ink/10 shadow-2xl p-7 text-center">
        {finished ? (
          <>
            <span className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Check size={26} className="text-success" strokeWidth={3} />
            </span>

            <h2 className="font-heading text-lg font-black text-ink">
              Reel generated successfully
            </h2>
            <p className="text-sm text-ink/55 mt-1.5 truncate">{finished.title}</p>

            {/* A full bar, so the jump from 99% to success still reads as completion. */}
            <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden mt-5">
              <div className="h-full w-full bg-success rounded-full" />
            </div>

            <div className="flex gap-2.5 mt-5">
              <button
                onClick={dismissFinished}
                className="flex-1 py-2.5 rounded-xl border border-ink/15 text-sm font-bold text-ink/60 hover:border-ink/30 transition-all"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onViewReel()
                  dismissFinished()
                }}
                className="flex-1 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-extrabold hover:bg-gold-dark transition-all active:scale-95"
              >
                View reel
              </button>
            </div>

            <p className="text-[11px] text-ink/35 mt-3">This closes on its own.</p>
          </>
        ) : (
          active && (
            <>
              <button
                onClick={() => setHiddenFor(active.reelId)}
                aria-label="Hide"
                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-ink/35 hover:text-ink hover:bg-ink/5 transition-all"
              >
                <X size={17} />
              </button>

              <span className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gold/15 border border-gold/25 flex items-center justify-center">
                <Clapperboard size={24} className="text-gold-dark" />
              </span>

              <h2 className="font-heading text-lg font-black text-ink">Generating your reel</h2>
              <p className="text-sm text-ink/55 mt-1">{active.label}…</p>

              <div className="font-heading text-4xl font-black text-ink tabular-nums mt-5">
                {active.percent}
                <span className="text-xl text-ink/40">%</span>
              </div>

              <div
                className="h-2 rounded-full bg-ink/10 overflow-hidden mt-3"
                role="progressbar"
                aria-valuenow={active.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-gold rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${active.percent}%` }}
                />
              </div>

              <button
                onClick={() => setHiddenFor(active.reelId)}
                className="w-full mt-6 py-2.5 rounded-xl border border-ink/15 text-sm font-bold text-ink/60 hover:border-gold hover:text-gold-dark transition-all"
              >
                Hide and keep working
              </button>
              <p className="text-[11px] text-ink/35 mt-2.5">
                Rendering carries on in the background — you'll be told when it's ready.
              </p>
            </>
          )
        )}
      </div>
    </div>
  )
}
