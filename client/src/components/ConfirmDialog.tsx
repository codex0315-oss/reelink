import { AlertTriangle, X } from 'lucide-react'

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  /** Defaults to the warning triangle, which suits a destructive confirmation. */
  icon?: typeof AlertTriangle
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  loading = false,
  icon: Icon = AlertTriangle,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-navy-dark/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                danger ? 'bg-red-500/10 text-danger' : 'bg-gold/10 text-gold-dark'
              }`}
            >
              {/* A warning triangle is right for "delete this" and wrong for "place a
                  call" — the caller supplies the icon when the action is not a hazard. */}
              <Icon size={20} />
            </div>
            <button
              onClick={onCancel}
              disabled={loading}
              className="text-ink/30 hover:text-ink transition-colors disabled:opacity-40"
            >
              <X size={18} />
            </button>
          </div>

          <h3 className="font-bold text-ink text-base mb-1.5">{title}</h3>
          <p className="text-sm text-ink/50 leading-relaxed">{description}</p>
        </div>

        <div className="flex border-t border-ink/10">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3.5 text-sm font-semibold text-ink/70 hover:bg-ink/10 transition-all disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-3.5 text-sm font-semibold transition-all disabled:opacity-50 ${
              danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : // bg-ink is near-white on the dark theme, so this label has to invert too
                  'bg-ink hover:bg-ink/85 text-app'
            }`}
          >
            {loading ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}