import { assetUrl } from '../lib/config'
import { useState } from 'react'
import { Pencil, Trash2, Home, Ruler, Sofa, ChevronLeft, ChevronRight } from 'lucide-react'

type Listing = {
  id: string
  title: string
  price: number
  photoUrls: string[]
  status: string
  listingType: string
  floorArea?: number
  lotArea?: number
  user?: { id: string; name: string; avatarUrl?: string | null }
}

type Props = {
  listing: Listing
  isOwner: boolean
  onClick: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export default function ListingCard({ listing, isOwner, onClick, onEdit, onDelete }: Props) {
  const [photoIndex, setPhotoIndex] = useState(0)
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({})

  const photos = listing.photoUrls ?? []
  const hasMultiple = photos.length > 1
  const currentPhoto = photos[photoIndex]
  const hasPhoto = currentPhoto && !imgErrors[photoIndex]
  const isForRent = listing.listingType === 'rent'

  function goPrev(e: React.MouseEvent) {
    e.stopPropagation()
    setPhotoIndex((i) => (i === 0 ? photos.length - 1 : i - 1))
  }

  function goNext(e: React.MouseEvent) {
    e.stopPropagation()
    setPhotoIndex((i) => (i === photos.length - 1 ? 0 : i + 1))
  }

  return (
    <div className="bg-card rounded-2xl border border-ink/10 overflow-hidden group hover:border-gold/50 hover:shadow-xl hover:shadow-navy/10 hover:-translate-y-1 transition-all duration-200">
      <div onClick={onClick} className="cursor-pointer">
        <div className="relative h-44 bg-ink/5 overflow-hidden">
          {hasPhoto ? (
            <img
              src={assetUrl(currentPhoto)}
              alt={listing.title}
              onError={() => setImgErrors((prev) => ({ ...prev, [photoIndex]: true }))}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Home size={28} className="text-ink/20" />
            </div>
          )}

          <span
            className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
              isForRent ? 'bg-ink text-app' : 'bg-gold text-navy-dark'
            }`}
          >
            {isForRent ? 'For Rent' : 'For Sale'}
          </span>

          {hasMultiple && (
            <>
              <button
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
              >
                <ChevronLeft size={16} className="text-navy-dark" />
              </button>
              <button
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
              >
                <ChevronRight size={16} className="text-navy-dark" />
              </button>

              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1">
                {photos.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      i === photoIndex ? 'bg-white w-3' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-4">
          <p className="text-ink font-black text-lg">
            ₱{Number(listing.price).toLocaleString()}
            {isForRent && <span className="text-xs font-medium text-ink/40"> /mo</span>}
          </p>
          <h3 className="font-semibold text-ink text-sm mt-0.5 truncate group-hover:text-gold-dark transition-colors">
            {listing.title}
          </h3>

          {/* Buyers are choosing who to contact as much as what to view, so the
              person behind the listing gets a face rather than a line of grey text. */}
          {!isOwner && listing.user && (
            <div className="flex items-center gap-2 mt-2.5">
              {listing.user.avatarUrl ? (
                <img
                  src={assetUrl(listing.user.avatarUrl)}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover border border-ink/10"
                />
              ) : (
                <span className="w-6 h-6 rounded-full bg-ink/10 text-ink/60 flex items-center justify-center text-[10px] font-bold">
                  {listing.user.name?.[0]?.toUpperCase() ?? 'R'}
                </span>
              )}
              <span className="text-xs text-ink/60 truncate">
                Listed by <span className="font-semibold text-ink/80">{listing.user.name}</span>
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-ink/5 text-xs text-ink/50">
            {listing.floorArea && (
              <span className="flex items-center gap-1">
                <Ruler size={13} />
                {listing.floorArea} sqm
              </span>
            )}
            <span className="flex items-center gap-1 capitalize">
              <Sofa size={13} />
              {listing.status.replace('-', ' ')}
            </span>
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="flex border-t border-ink/10">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 hover:text-ink transition-all"
          >
            <Pencil size={13} />
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-ink/60 hover:bg-red-500/10 hover:text-danger transition-all border-l border-ink/10"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}