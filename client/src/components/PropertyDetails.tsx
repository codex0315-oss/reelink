import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Ruler,
  Sofa,
  MapPin,
  Home,
  Phone,
  MessageSquare,
  Check,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Compass,
} from 'lucide-react'
import { fetchListing } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import BrowseMap from './BrowseMap'
import VirtualTour from './VirtualTour'
import ConfirmDialog from './ConfirmDialog'
import { assetUrl } from '../lib/config'

export type DetailListing = {
  id: string
  title: string
  description?: string
  price: number
  photoUrls: string[]
  status: string
  listingType: string
  floorArea?: number
  lotArea?: number
  amenities: string[]
  latitude?: number | null
  longitude?: number | null
  createdAt?: string
  panoramaUrls?: string[]
  panoramaLabels?: string[]
  user?: { id: string; name: string; avatarUrl?: string | null; phone?: string | null }
}

type Props = {
  listingId: string
  onBack: () => void
  onEdit: (listing: DetailListing) => void
  onDelete: (listing: DetailListing) => void
  /** Opens the thread with this property's owner and jumps to Messages. */
  onMessageSeller: (listingId: string) => void
}


export default function PropertyDetails({
  listingId,
  onBack,
  onEdit,
  onDelete,
  onMessageSeller,
}: Props) {
  const { user, token } = useAuth()
  const [listing, setListing] = useState<DetailListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [tourOpen, setTourOpen] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchListing(listingId, token)
      .then((data) => {
        if (!cancelled) setListing(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    // Guards against a stale response landing after the user has moved on.
    return () => {
      cancelled = true
    }
  }, [listingId])

  if (loading) {
    return (
      <div className="max-w-6xl">
        <BackLink onBack={onBack} />
        <div className="py-20 text-center text-sm text-ink/40">Loading property…</div>
      </div>
    )
  }

  if (error || !listing) {
    return (
      <div className="max-w-6xl">
        <BackLink onBack={onBack} />
        <div className="py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-ink/5 mx-auto mb-3 flex items-center justify-center">
            <Home size={20} className="text-ink/25" />
          </div>
          <p className="font-bold text-ink text-sm">{error || 'Property not found'}</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 rounded-lg bg-ink text-app text-xs font-bold hover:bg-ink/85 transition-all"
          >
            Back to browse
          </button>
        </div>
      </div>
    )
  }

  const isForRent = listing.listingType === 'rent'
  const isOwner = !!user && listing.user?.id === user.id
  // The tour is panorama-only, so no 360 shots means no tour to offer.
  const panoramas = listing.panoramaUrls ?? []
  const hasLocation =
    typeof listing.latitude === 'number' && typeof listing.longitude === 'number'

  return (
    <div className="max-w-6xl">
      <BackLink onBack={onBack} />

      <Gallery
        photos={listing.photoUrls ?? []}
        title={listing.title}
        hasTour={panoramas.length > 0}
        onOpenTour={() => setTourOpen(true)}
      />

      {tourOpen && (
        <VirtualTour
          panoramas={panoramas}
          labels={listing.panoramaLabels}
          title={listing.title}
          onClose={() => setTourOpen(false)}
        />
      )}

      {/* Details on the left, the seller and the map on the right. */}
      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6 mt-6 items-start">
        <div className="lg:col-span-2 flex flex-col gap-5 lg:gap-6">
          <section className="bg-card rounded-2xl border border-ink/10 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <span
                  className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide mb-2 ${
                    isForRent ? 'bg-ink text-app' : 'bg-gold text-navy-dark'
                  }`}
                >
                  {isForRent ? 'For Rent' : 'For Sale'}
                </span>
                <h1 className="font-heading text-xl sm:text-2xl font-black text-ink">
                  {listing.title}
                </h1>
              </div>
              <div className="text-right shrink-0">
                <div className="font-heading text-2xl sm:text-3xl font-black text-ink">
                  ₱{Number(listing.price).toLocaleString()}
                </div>
                {isForRent && <div className="text-xs text-ink/45">per month</div>}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
              <Fact
                icon={Ruler}
                label="Floor area"
                value={listing.floorArea ? `${listing.floorArea} sqm` : '—'}
              />
              <Fact
                icon={MapPin}
                label="Lot area"
                value={listing.lotArea ? `${listing.lotArea} sqm` : '—'}
              />
              <Fact
                icon={Sofa}
                label="Furnishing"
                value={listing.status.replace('-', ' ')}
                capitalize
              />
            </div>
          </section>

          {listing.description && (
            <section className="bg-card rounded-2xl border border-ink/10 p-5 sm:p-6">
              <h2 className="font-heading font-bold text-ink mb-3">About this property</h2>
              <p className="text-sm text-ink/70 leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </p>
            </section>
          )}

          {listing.amenities?.length > 0 && (
            <section className="bg-card rounded-2xl border border-ink/10 p-5 sm:p-6">
              <h2 className="font-heading font-bold text-ink mb-4">Amenities</h2>
              <div className="grid sm:grid-cols-2 gap-y-2.5 gap-x-4">
                {listing.amenities.map((a) => (
                  <div key={a} className="flex items-center gap-2.5 text-sm text-ink/70">
                    <span className="w-5 h-5 rounded-full bg-gold/15 border border-gold/25 flex items-center justify-center shrink-0">
                      <Check size={11} className="text-gold-dark" strokeWidth={3} />
                    </span>
                    {a}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-5 lg:gap-6">
          {isOwner ? (
            <OwnerActions listing={listing} onEdit={onEdit} onDelete={onDelete} />
          ) : (
            <SellerCard listing={listing} onMessage={onMessageSeller} />
          )}

          <section className="bg-card rounded-2xl border border-ink/10 p-5 sm:p-6">
            <h2 className="font-heading font-bold text-ink mb-1">Location</h2>
            <p className="text-xs text-ink/50 mb-4">
              {hasLocation
                ? 'Approximate position set by the seller.'
                : 'The seller has not pinned this property on the map.'}
            </p>
            {hasLocation ? (
              <div className="h-56 rounded-xl overflow-hidden border border-ink/10">
                {/* Reuses the browse map so the pin and popup look identical. */}
                <BrowseMap
                  listings={[listing]}
                  hoveredId={null}
                  selectedId={null}
                  onHover={() => undefined}
                  onSelect={() => undefined}
                />
              </div>
            ) : (
              <div className="h-32 rounded-xl bg-ink/5 flex items-center justify-center">
                <MapPin size={20} className="text-ink/25" />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- parts */

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1.5 mb-4 text-sm font-semibold text-ink/55 hover:text-ink transition-colors"
    >
      <ArrowLeft size={15} />
      Back to browse
    </button>
  )
}

function Gallery({
  photos,
  title,
  hasTour,
  onOpenTour,
}: {
  photos: string[]
  title: string
  hasTour: boolean
  onOpenTour: () => void
}) {
  const [index, setIndex] = useState(0)
  const [broken, setBroken] = useState<Record<number, boolean>>({})

  if (photos.length === 0) {
    return (
      <div className="h-64 sm:h-96 rounded-2xl bg-ink/5 border border-ink/10 flex flex-col items-center justify-center gap-3">
        <ImageOff size={26} className="text-ink/25" />
        <p className="text-xs text-ink/40">No photos were attached to this listing</p>
        {/* A 360 shot without ordinary photos still deserves its tour. */}
        {hasTour && (
          <button
            onClick={onOpenTour}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-extrabold hover:bg-gold-dark active:scale-95 transition-all"
          >
            <Compass size={16} />
            Virtual Tour
          </button>
        )}
      </div>
    )
  }

  const current = photos[index]

  return (
    <div>
      <div className="relative h-64 sm:h-96 rounded-2xl overflow-hidden bg-ink/5 border border-ink/10 group">
        {broken[index] ? (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff size={26} className="text-ink/25" />
          </div>
        ) : (
          <img
            src={assetUrl(current)}
            alt={title}
            onError={() => setBroken((b) => ({ ...b, [index]: true }))}
            className="w-full h-full object-cover"
          />
        )}

        {photos.length > 1 && (
          <>
            <GalleryArrow
              side="left"
              onClick={() => setIndex((i) => (i === 0 ? photos.length - 1 : i - 1))}
            />
            <GalleryArrow
              side="right"
              onClick={() => setIndex((i) => (i === photos.length - 1 ? 0 : i + 1))}
            />
            <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold">
              {index + 1} / {photos.length}
            </span>
          </>
        )}

        {/* Only when the seller actually uploaded 360 shots — the tour shows real
            panoramas or it does not appear at all. */}
        {hasTour && (
          <button
            onClick={onOpenTour}
            className="absolute bottom-3 left-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-extrabold shadow-lg hover:bg-gold-dark active:scale-95 transition-all"
          >
            <Compass size={16} />
            Virtual Tour
          </button>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <button
              key={p}
              onClick={() => setIndex(i)}
              className={`w-20 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                i === index ? 'border-gold' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={assetUrl(p)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GalleryArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      // Fixed light treatment: these sit on the photo, which is the same in either theme.
      className={`absolute top-1/2 -translate-y-1/2 ${
        side === 'left' ? 'left-3' : 'right-3'
      } w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-white`}
    >
      <Icon size={18} className="text-navy-dark" />
    </button>
  )
}

function Fact({
  icon: Icon,
  label,
  value,
  capitalize,
}: {
  icon: typeof Ruler
  label: string
  value: string
  capitalize?: boolean
}) {
  return (
    <div className="p-3 rounded-xl bg-ink/[0.04] border border-ink/5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink/45 uppercase tracking-wide">
        <Icon size={12} />
        {label}
      </div>
      <div className={`text-sm font-bold text-ink mt-1 ${capitalize ? 'capitalize' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function SellerCard({
  listing,
  onMessage,
}: {
  listing: DetailListing
  onMessage: (listingId: string) => void
}) {
  const seller = listing.user
  const phone = seller?.phone?.trim()
  const [calling, setCalling] = useState(false)

  const listedOn = listing.createdAt
    ? new Date(listing.createdAt).toLocaleDateString('en-PH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <section className="bg-card rounded-2xl border border-ink/10 p-5 sm:p-6">
      <h2 className="font-heading font-bold text-ink mb-4">Listed by</h2>

      <div className="flex items-center gap-3">
        {seller?.avatarUrl ? (
          <img
            src={assetUrl(seller.avatarUrl)}
            alt=""
            className="w-14 h-14 rounded-full object-cover border border-ink/10"
          />
        ) : (
          <span className="w-14 h-14 rounded-full bg-ink/10 text-ink/60 flex items-center justify-center text-lg font-black">
            {seller?.name?.[0]?.toUpperCase() ?? 'R'}
          </span>
        )}
        <div className="min-w-0">
          <div className="font-bold text-ink truncate">{seller?.name ?? 'Reelink user'}</div>
          {listedOn && <div className="text-xs text-ink/45">Listed {listedOn}</div>}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-ink/5">
        {phone ? (
          // Through the same dialog as the Call button — tapping the number itself
          // dialled just as immediately, so fixing only the button would have left the
          // surprise one line above it.
          <button
            type="button"
            onClick={() => setCalling(true)}
            className="flex items-center gap-2.5 text-sm font-semibold text-ink hover:text-gold-dark transition-colors"
          >
            <Phone size={15} className="text-ink/45" />
            {phone}
          </button>
        ) : (
          <p className="flex items-center gap-2.5 text-sm text-ink/45">
            <Phone size={15} />
            No contact number added
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-4">
        {/* A button rather than a bare tel: link. Tapping the link handed the number
            straight to the OS — on a phone that starts dialling a stranger, and on a
            desktop it raises a "pick an app" prompt that explains nothing. The dialog
            shows whose number it is first. */}
        <button
          type="button"
          onClick={() => setCalling(true)}
          disabled={!phone}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
            phone
              ? 'bg-ink text-app hover:bg-ink/85 active:scale-95'
              : 'bg-ink/10 text-ink/35 cursor-not-allowed'
          }`}
        >
          <Phone size={15} />
          Call
        </button>

        <button
          type="button"
          onClick={() => onMessage(listing.id)}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-ink/15 text-sm font-bold text-ink/70 hover:border-gold hover:text-gold-dark transition-all active:scale-95"
        >
          <MessageSquare size={15} />
          Message
        </button>
      </div>

      {/* Not `danger`: calling an agent is the point of the page, not a hazard. The
          number is spelled out so the buyer can check it before their phone dials. */}
      <ConfirmDialog
        open={calling}
        icon={Phone}
        danger={false}
        title={`Call ${seller?.name ?? 'this agent'}?`}
        description={`This opens your phone app and dials ${phone}. Standard call charges apply.`}
        confirmLabel="Call now"
        cancelLabel="Not now"
        onCancel={() => setCalling(false)}
        onConfirm={() => {
          setCalling(false)
          if (phone) window.location.href = `tel:${phone.replace(/\s+/g, '')}`
        }}
      />
    </section>
  )
}

function OwnerActions({
  listing,
  onEdit,
  onDelete,
}: {
  listing: DetailListing
  onEdit: (l: DetailListing) => void
  onDelete: (l: DetailListing) => void
}) {
  return (
    <section className="bg-card rounded-2xl border border-ink/10 p-5 sm:p-6">
      <h2 className="font-heading font-bold text-ink">This is your listing</h2>
      <p className="text-xs text-ink/50 mt-1 mb-4">
        Buyers see your name, photo and contact number here.
      </p>

      <div className="flex flex-col gap-2.5">
        <button
          onClick={() => onEdit(listing)}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-ink text-app text-sm font-bold hover:bg-ink/85 transition-all active:scale-95"
        >
          <Pencil size={15} />
          Edit listing
        </button>
        <button
          onClick={() => onDelete(listing)}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-ink/15 text-sm font-bold text-ink/60 hover:border-red-500/40 hover:text-danger hover:bg-red-500/10 transition-all"
        >
          <Trash2 size={15} />
          Delete listing
        </button>
      </div>
    </section>
  )
}
