import { useEffect } from 'react'
import { AlertCircle, X } from 'lucide-react'

/**
 * A brief message when something the user asked for did not happen.
 *
 * Top-centre, deliberately not top-right: incoming-message toasts already own that
 * corner and the Amicus bubble owns the bottom-right, so this is the one edge left
 * where nothing lands on top of anything else.
 *
 * Auto-dismisses. An error the user can do nothing about should not need clearing,
 * and the close button is there for the case where it covers something they are
 * reading. Ten seconds is long enough to read a sentence twice on a phone.
 */
export default function ErrorToast({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDismiss, 10_000)
    return () => clearTimeout(timer)
    // Keyed on the message, so a second failure restarts the clock rather than
    // inheriting whatever was left of the first one's.
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div
      role="alert"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[130] w-[min(24rem,calc(100vw-2.5rem))]"
    >
      <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-card border border-red-500/25 shadow-2xl">
        <span className="w-8 h-8 rounded-lg bg-red-500/10 text-danger flex items-center justify-center shrink-0">
          <AlertCircle size={16} />
        </span>
        <p className="min-w-0 flex-1 text-sm text-ink/80 leading-snug pt-1.5">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-ink/35 hover:text-ink hover:bg-ink/5 transition-all shrink-0"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
