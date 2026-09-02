import { useState } from 'react'
import { Star, X, Sparkles } from 'lucide-react'

const MAX_COMMENT = 400

/**
 * Asked once, after the first reel finishes.
 *
 * The rating is about Reelink, not about the reel that prompted it — the wording says
 * so, because "how many stars" beside a video someone just made otherwise reads as a
 * review of their own work.
 *
 * Closing counts as an answer. It is recorded as a dismissal so the prompt never
 * returns, which is the whole reason it can afford to interrupt at all.
 */
export default function FeedbackModal({
  open,
  submitting,
  onSubmit,
  onDismiss,
}: {
  open: boolean
  submitting: boolean
  onSubmit: (value: { rating: number; comment: string; showName: boolean }) => void
  onDismiss: () => void
}) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [showName, setShowName] = useState(true)

  if (!open) return null

  // The filled count follows the pointer while choosing, so the stars respond before
  // anything is committed.
  const shown = hovered || rating
  const willBePublic = rating >= 4 && comment.trim().length > 0

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-5 bg-navy-dark/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90svh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-11 h-11 rounded-xl bg-gold/10 text-gold-dark flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <button
              onClick={onDismiss}
              disabled={submitting}
              aria-label="Close"
              className="text-ink/30 hover:text-ink transition-colors disabled:opacity-40"
            >
              <X size={18} />
            </button>
          </div>

          <h2 className="text-lg font-bold text-ink mb-1">How is Reelink working for you?</h2>
          <p className="text-sm text-ink/55 leading-relaxed mb-5">
            You just made a reel. We would love to know what you think of the app — it
            takes a few seconds and we will not ask again.
          </p>

          <div
            className="flex items-center gap-1.5 mb-5"
            onMouseLeave={() => setHovered(0)}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                onMouseEnter={() => setHovered(value)}
                disabled={submitting}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                className="p-1 rounded-lg transition-transform hover:scale-110 active:scale-95 disabled:opacity-50"
              >
                <Star
                  size={30}
                  className={
                    value <= shown ? 'text-gold fill-gold' : 'text-ink/20'
                  }
                />
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
            disabled={submitting}
            rows={3}
            placeholder="What worked well, or what got in your way? (optional)"
            className="w-full px-3.5 py-3 rounded-xl bg-ink/5 border border-ink/10 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-gold/50 transition-colors resize-none disabled:opacity-50"
          />
          <div className="flex justify-end mt-1 mb-4">
            <span className="text-[11px] text-ink/35">
              {comment.length}/{MAX_COMMENT}
            </span>
          </div>

          {/* Shown only when the answer would actually be published, so nobody is asked
              to consent to something that is not going to happen. */}
          {willBePublic && (
            <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={showName}
                onChange={(e) => setShowName(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 w-4 h-4 accent-gold shrink-0"
              />
              <span className="text-xs text-ink/60 leading-relaxed">
                Show my name and photo with this on the Reelink homepage. Untick to
                appear as “A Reelink agent”.
              </span>
            </label>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onDismiss}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-ink/50 hover:text-ink hover:bg-ink/5 transition-all disabled:opacity-40"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() =>
                onSubmit({ rating, comment: comment.trim(), showName })
              }
              disabled={submitting || rating === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-bold hover:bg-gold-dark transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-navy-dark/40 border-t-transparent rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                'Send feedback'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
