import { Phone, Home, X, ImageOff, MessageSquare } from 'lucide-react'
import type { Conversation } from '../context/MessagesContext'
import { assetUrl } from '../lib/config'

/**
 * The third column: what this conversation is actually about.
 *
 * The reference this follows puts a person's profile here — job title, hobbies, shared
 * media. Ours is a property marketplace, so the same slot carries the property first
 * and the person second: a buyer in this thread wants the price and the photos to hand,
 * not the agent's biography.
 *
 * Everything shown here already arrives with the conversation, so opening the panel
 * costs no extra request.
 */
export default function ConversationDetails({
  conversation,
  online,
  onOpenListing,
  onClose,
}: {
  conversation: Conversation
  online: boolean
  onOpenListing?: (listingId: string) => void
  /** Only passed on mobile, where the panel is a sheet rather than a column. */
  onClose?: () => void
}) {
  const { otherUser, listing } = conversation
  const phone = otherUser.phone?.trim()
  const photos = listing?.photoUrls ?? []

  return (
    <div className="h-full overflow-y-auto">
      {onClose && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10 sticky top-0 bg-card z-10">
          <span className="font-bold text-ink text-sm">Details</span>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink/45 hover:bg-ink/5"
          >
            <X size={17} />
          </button>
        </div>
      )}

      <div className="p-4 space-y-5">
        {/* ------------------------------------------------------- the property */}
        {listing && (
          <section>
            <div className="relative rounded-xl overflow-hidden bg-ink/5 aspect-[4/3]">
              {photos[0] ? (
                <img src={assetUrl(photos[0])} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageOff size={22} className="text-ink/20" />
                </div>
              )}
              {listing.listingType && (
                <span
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                    listing.listingType === 'rent'
                      ? 'bg-ink text-app'
                      : 'bg-gold text-navy-dark'
                  }`}
                >
                  {listing.listingType === 'rent' ? 'For Rent' : 'For Sale'}
                </span>
              )}
            </div>

            <h3 className="font-bold text-ink text-sm mt-3 leading-snug">{listing.title}</h3>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-heading text-lg font-black text-ink">
                ₱{Number(listing.price).toLocaleString()}
              </span>
              {listing.listingType === 'rent' && (
                <span className="text-[11px] text-ink/45">per month</span>
              )}
            </div>
            {listing.status && (
              <p className="text-[11px] text-ink/50 mt-0.5 capitalize">
                {listing.status.replace('-', ' ')}
              </p>
            )}

            {onOpenListing && (
              <button
                onClick={() => onOpenListing(listing.id)}
                className="w-full flex items-center justify-center gap-2 mt-3 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-extrabold hover:bg-gold-dark transition-all active:scale-95"
              >
                <Home size={15} />
                View property
              </button>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------- the person */}
        <section className="pt-1 border-t border-ink/10">
          <div className="flex items-center gap-3 pt-4">
            <span className="relative shrink-0">
              {otherUser.avatarUrl ? (
                <img
                  src={assetUrl(otherUser.avatarUrl)}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover border border-ink/10"
                />
              ) : (
                <span className="w-12 h-12 rounded-full bg-ink/10 text-ink/60 flex items-center justify-center text-base font-black">
                  {otherUser.name?.[0]?.toUpperCase() ?? 'R'}
                </span>
              )}
              {online && (
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-success border-2 border-card" />
              )}
            </span>

            <div className="min-w-0">
              <div className="font-bold text-ink text-sm truncate">{otherUser.name}</div>
              <div className="text-[11px] text-ink/45">{online ? 'Active now' : 'Offline'}</div>
            </div>
          </div>

          {/* A disabled-looking button with no number beats a dead tel: link. */}
          <a
            href={phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined}
            aria-disabled={!phone}
            onClick={(e) => !phone && e.preventDefault()}
            className={`w-full flex items-center justify-center gap-2 mt-3 py-2.5 rounded-xl border text-sm font-bold transition-all ${
              phone
                ? 'border-ink/15 text-ink hover:border-gold hover:text-gold-dark active:scale-95'
                : 'border-ink/10 text-ink/30 cursor-not-allowed'
            }`}
          >
            <Phone size={15} />
            {phone ?? 'No number shared'}
          </a>
        </section>

        {/* --------------------------------------------------------- the gallery */}
        {photos.length > 1 && (
          <section className="pt-4 border-t border-ink/10">
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="font-bold text-ink text-xs">Property photos</h4>
              {onOpenListing && listing && (
                <button
                  onClick={() => onOpenListing(listing.id)}
                  className="text-[11px] font-bold text-gold-dark hover:underline"
                >
                  See all
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {photos.slice(1, 7).map((url) => (
                <img
                  key={url}
                  src={assetUrl(url)}
                  alt=""
                  className="w-full aspect-square object-cover rounded-lg"
                />
              ))}
            </div>
          </section>
        )}

        {!listing && (
          <p className="flex items-start gap-2 text-[11px] text-ink/45 leading-relaxed">
            <MessageSquare size={13} className="shrink-0 mt-0.5" />
            This property is no longer listed, so only the conversation remains.
          </p>
        )}
      </div>
    </div>
  )
}
