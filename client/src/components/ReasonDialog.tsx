import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

/**
 * A confirmation that also collects why.
 *
 * Replaces window.prompt for staff actions. The browser dialog was doing real work —
 * suspending someone, declining a licence — in an unstyled box that names the domain
 * rather than the action, cannot be cancelled with anything but its own button, and on
 * some mobile browsers does not appear at all. It also gave no way to show what is
 * about to happen next to the field where you justify it.
 *
 * The reason is required. Every action this fronts is one somebody may later ask staff
 * to explain, and "no reason recorded" is not an answer.
 */
export default function ReasonDialog({
  open,
  title,
  description,
  placeholder,
  confirmLabel = 'Confirm',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  placeholder?: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')

  // Cleared whenever the dialog opens, so a reason typed for one account can never be
  // submitted against the next one.
  useEffect(() => {
    if (open) setReason('')
  }, [open])

  // Escape closes it, which the browser prompt this replaces did not allow.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onCancel])

  if (!open) return null

  const ready = reason.trim().length > 0

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5 bg-navy-dark/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-11 h-11 rounded-xl bg-red-500/10 text-danger flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <button
              onClick={onCancel}
              disabled={loading}
              aria-label="Cancel"
              className="text-ink/30 hover:text-ink transition-colors disabled:opacity-40"
            >
              <X size={18} />
            </button>
          </div>

          <h2 className="text-lg font-bold text-ink mb-1">{title}</h2>
          <p className="text-sm text-ink/55 leading-relaxed mb-4">{description}</p>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            disabled={loading}
            rows={3}
            autoFocus
            placeholder={placeholder ?? 'Give a reason…'}
            className="w-full px-3.5 py-3 rounded-xl bg-ink/5 border border-ink/10 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-gold/50 transition-colors resize-none disabled:opacity-50"
          />
          <p className="text-[11px] text-ink/40 mt-1.5 mb-5">
            This is recorded and shown to the person affected.
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-ink/50 hover:text-ink hover:bg-ink/5 transition-all disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(reason.trim())}
              disabled={loading || !ready}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                  Working…
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
