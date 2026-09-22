import { Compass, BadgeCheck } from 'lucide-react'
import { assetUrl } from '../lib/config'

export type BrowseListing = {
  id: string
  title: string
  price: number
  status: string
  listingType: string
  photoUrls: string[]
  panoramaUrls?: string[]
  floorArea?: number | null
  lotArea?: number | null
  /** Not shown on the card, but searched — see haystack() in lib/browse. */
  description?: string | null
  amenities?: string[]
  createdAt?: string
  user?: { id: string; name: string; avatarUrl?: string | null; isVerified?: boolean }
}

/**
 * One property, as a browsable card.
 *
 * Image-forward and quiet underneath: the photo does the selling, and the text is three
 * short facts rather than a specification. Deliberately without a save or favourite
 * control — there is no such feature, and a heart that does nothing is worse than no
 * heart at all.
 *
 * Badges are earned rather than decorative. A 360° tour and a verified agent are both
 * things Reelink actually checks, so they mean something where a "popular" tag on a
 * platform with a handful of listings would not.
 */
export default function PropertyCard({
  listing,
  onClick,
}: {
  listing: BrowseListing
  onClick: () => void
}) {
  const photo = listing.photoUrls?.[0]
  const hasTour = (listing.panoramaUrls?.length ?? 0) > 0
  const isRent = listing.listingType === 'rent'
  const area = listing.floorArea ?? listing.lotArea

  return (
    <button
      onClick={onClick}
      className="group text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-2xl"
    >
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-line/10">
        {photo ? (
          <img
            src={assetUrl(photo)}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-content/20 text-xs font-bold">
            No photo yet
          </div>
        )}

        {hasTour && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/90 backdrop-blur text-[11px] font-bold shadow-sm">
            <Compass size={11} className="text-gold-dark" />
            360° tour
          </span>
        )}

        {listing.user?.isVerified && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface/90 backdrop-blur text-[11px] font-bold shadow-sm">
            <BadgeCheck size={11} className="text-gold-dark" />
            Verified
          </span>
        )}
      </div>

      <div className="pt-3">
        <div className="font-bold text-[15px] leading-snug truncate">{listing.title}</div>
        <div className="text-sm text-content/55 mt-0.5">
          <span className="font-bold text-content">₱{listing.price.toLocaleString()}</span>
          {isRent && <span className="text-content/50"> / month</span>}
          {area ? <span> · {area} sqm</span> : null}
        </div>
        <div className="text-xs text-content/40 mt-0.5 capitalize">
          {listing.status.replace(/-/g, ' ')} · for {listing.listingType}
        </div>
      </div>
    </button>
  )
}
