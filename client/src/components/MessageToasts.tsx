import { X, MessageSquare } from 'lucide-react'
import { useMessages } from '../context/MessagesContext'
import { assetUrl } from '../lib/config'


/**
 * Incoming-message popups.
 *
 * Top-right rather than bottom-right: the bottom-right corner already belongs to the
 * Amicus bubble, and stacking a toast on it would repeat the collision this change
 * is fixing elsewhere.
 */
export default function MessageToasts({
  onOpenConversation,
}: {
  onOpenConversation: (conversationId: string) => void
}) {
  const { toasts, dismissToast } = useMessages()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-20 right-5 z-[120] flex flex-col gap-2 w-[min(21rem,calc(100vw-2.5rem))]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className="amicus-bubble flex items-start gap-3 p-3 rounded-2xl bg-card border border-ink/10 shadow-2xl"
        >
          <button
            onClick={() => {
              onOpenConversation(toast.conversationId)
              dismissToast(toast.id)
            }}
            className="flex items-start gap-3 min-w-0 flex-1 text-left"
          >
            {toast.avatarUrl ? (
              <img
                src={assetUrl(toast.avatarUrl)}
                alt=""
                className="w-10 h-10 rounded-full object-cover shrink-0 border border-ink/10"
              />
            ) : (
              <span className="w-10 h-10 rounded-full bg-ink/10 text-ink/60 flex items-center justify-center text-sm font-black shrink-0">
                {toast.name?.[0]?.toUpperCase() ?? 'R'}
              </span>
            )}

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <MessageSquare size={12} className="text-gold-dark shrink-0" />
                <span className="font-bold text-ink text-sm truncate">{toast.name}</span>
              </span>
              {toast.propertyTitle && (
                <span className="block text-[11px] text-gold-dark truncate">
                  {toast.propertyTitle}
                </span>
              )}
              <span className="block text-xs text-ink/60 mt-0.5 line-clamp-2">
                {toast.preview}
              </span>
            </span>
          </button>

          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-ink/35 hover:text-ink hover:bg-ink/5 transition-all"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
