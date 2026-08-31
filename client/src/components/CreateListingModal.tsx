import { assetUrl } from '../lib/config'
import { useState } from 'react'
import { useDismissOnBack } from '../hooks/useDismissOnBack'
import { X, Plus, Compass, AlertTriangle } from 'lucide-react'
import LocationPicker from './LocationPicker'
import { createListing, generateDescription, updateListing } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import AmicusMark from './AmicusMark'
import { LIMITS } from '../lib/limits'

/** Matches the server's check in common/image-size.ts. */
const PANORAMA_MIN_RATIO = 1.9

type ExistingListing = {
  id: string
  title: string
  description?: string
  price: number
  lotArea?: number
  floorArea?: number
  status: string
  listingType: string
  amenities: string[]
  latitude?: number
  longitude?: number
  publishToFacebook: boolean
  photoUrls: string[]
  panoramaUrls?: string[]
}

type Props = {
  onClose: () => void
  onCreated: () => void
  editListing?: ExistingListing
}

const AMENITY_OPTIONS = [
  'Parking', 'Swimming Pool', 'Garden', 'Security', 'Balcony', 'Gym',
  'Sports Courts', 'Outdoor Spaces', 'Clubhouses & Function Rooms',
  'Co-working Lounges', 'Childrens Playground', 'Pet-Friendly Areas'
]

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
    </svg>
  )
}

export default function CreateListingModal({ onClose, onCreated, editListing }: Props) {
  // Device Back closes this instead of leaving the dashboard.
  useDismissOnBack(true, onClose)
  const { token } = useAuth()
  const isEditing = !!editListing
  const [title, setTitle] = useState(editListing?.title ?? '')
  const [description, setDescription] = useState(editListing?.description ?? '')
  const [price, setPrice] = useState(editListing ? String(editListing.price) : '')
  const [lotArea, setLotArea] = useState(editListing?.lotArea ? String(editListing.lotArea) : '')
  const [floorArea, setFloorArea] = useState(editListing?.floorArea ? String(editListing.floorArea) : '')
  const [status, setStatus] = useState(editListing?.status ?? 'bare')
  const [amenities, setAmenities] = useState<string[]>(editListing?.amenities ?? [])
  const [customAmenity, setCustomAmenity] = useState('')
  const [latitude, setLatitude] = useState<number | null>(editListing?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(editListing?.longitude ?? null)
  // Read-only while publishing is unbuilt. The value is still carried so editing a
  // listing that was saved with it set does not silently clear the flag.
  const [publishToFacebook] = useState(editListing?.publishToFacebook ?? false)
  const [existingPhotos, setExistingPhotos] = useState<string[]>(editListing?.photoUrls ?? [])
  const [photos, setPhotos] = useState<File[]>([])
  const [existingPanoramas, setExistingPanoramas] = useState<string[]>(
    editListing?.panoramaUrls ?? [],
  )
  const [panoramas, setPanoramas] = useState<File[]>([])
  const [panoramaWarning, setPanoramaWarning] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [listingType, setListingType] = useState(editListing?.listingType ?? 'sale')

  function toggleAmenity(a: string) {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  function addCustomAmenity() {
    const trimmed = customAmenity.trim()
    if (trimmed && !amenities.includes(trimmed)) {
      setAmenities((prev) => [...prev, trimmed])
    }
    setCustomAmenity('')
  }

  function handleFiles(fileList: FileList | File[]) {
    setPhotos((prev) => [...prev, ...Array.from(fileList)])
  }

  /**
   * Checks the shape in the browser so the agent is told immediately, rather than
   * uploading a few megabytes and getting the server's rejection back. The server
   * checks again regardless — this is convenience, not the guard.
   */
  async function handlePanoramaFiles(fileList: FileList | File[]) {
    const picked = Array.from(fileList)
    const accepted: File[] = []
    const rejected: string[] = []

    await Promise.all(
      picked.map(
        (file) =>
          new Promise<void>((resolve) => {
            const img = new Image()
            const url = URL.createObjectURL(file)
            img.onload = () => {
              const ratio = img.naturalWidth / img.naturalHeight
              if (ratio >= PANORAMA_MIN_RATIO) accepted.push(file)
              else rejected.push(`${file.name} (${img.naturalWidth}×${img.naturalHeight})`)
              URL.revokeObjectURL(url)
              resolve()
            }
            img.onerror = () => {
              // Unreadable here, but the server will have the final say.
              accepted.push(file)
              URL.revokeObjectURL(url)
              resolve()
            }
            img.src = url
          }),
      ),
    )

    if (accepted.length) setPanoramas((prev) => [...prev, ...accepted])
    setPanoramaWarning(
      rejected.length
        ? `Not a panorama: ${rejected.join(', ')}. A 360 photo has to be at least twice as wide as it is tall — shoot it with your phone's Panorama mode.`
        : '',
    )
  }

  function removeNewPanorama(index: number) {
    setPanoramas((prev) => prev.filter((_, i) => i !== index))
  }

  function removeExistingPanorama(url: string) {
    setExistingPanoramas((prev) => prev.filter((u) => u !== url))
  }

  function removeNewPhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  function removeExistingPhoto(url: string) {
    setExistingPhotos((prev) => prev.filter((u) => u !== url))
  }

  async function handleGenerateDescription() {
    if (!token) return
    if (existingPhotos.length + photos.length === 0) {
      setError('Please attach at least one photo before generating a description.')
      return
    }
    if (!title || !price) {
      setError('Add a title and price first so Amicus AI has something to work with.')
      return
    }
    setGenerating(true)
    setError('')
    try {
      const result = await generateDescription(token, {
        title,
        price: Number(price),
        lotArea: lotArea ? Number(lotArea) : undefined,
        floorArea: floorArea ? Number(floorArea) : undefined,
        status,
        amenities,
      })
      setDescription(result.description)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate description')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setError('')
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('title', title)
      formData.append('description', description)
      formData.append('price', price)
      if (lotArea) formData.append('lotArea', lotArea)
      if (floorArea) formData.append('floorArea', floorArea)
      formData.append('status', status)
      formData.append('listingType', listingType)
      formData.append('amenities', JSON.stringify(amenities))
      if (latitude !== null) formData.append('latitude', String(latitude))
      if (longitude !== null) formData.append('longitude', String(longitude))
      formData.append('publishToFacebook', String(publishToFacebook))
      photos.forEach((file) => formData.append('photos', file))
      panoramas.forEach((file) => formData.append('panoramas', file))

      if (isEditing && editListing) {
        formData.append('existingPhotoUrls', JSON.stringify(existingPhotos))
        formData.append('existingPanoramaUrls', JSON.stringify(existingPanoramas))
        await updateListing(token, editListing.id, formData)
      } else {
        await createListing(token, formData)
      }
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const customAmenities = amenities.filter((a) => !AMENITY_OPTIONS.includes(a))

  return (
    <div className="fixed inset-0 bg-navy-dark/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      {/* Wider and taller than the usual modal on purpose: the whole form is meant to
          be visible at once on a laptop, so nothing needs scrolling to reach. */}
      <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-7xl max-h-[94vh] sm:max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink/10">
          <h2 className="font-bold text-ink text-lg">{isEditing ? 'Edit Listing' : 'Create Listing'}</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-danger text-sm">
            {error}
          </div>
        )}

        <form id="create-listing-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4">
          {/* Three columns from xl, so the whole form fits on a laptop screen without
              scrolling. The groups are ordered to come out roughly level: identity and
              media here, the numbers and choices next, the map and copy last. */}
          <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={LIMITS.listingTitle}
                  className="w-full px-4 py-2.5 rounded-lg border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  placeholder="3BR House in Talamban, Cebu"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Photos</label>

                {(existingPhotos.length > 0 || photos.length > 0) && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                    {existingPhotos.map((url) => (
                      <div key={url} className="relative group">
                        <img
                          src={assetUrl(url)}
                          alt=""
                          className="w-full h-20 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => removeExistingPhoto(url)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {photos.map((file, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt=""
                          className="w-full h-20 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => removeNewPhoto(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  onDrop={(e) => {
                    e.preventDefault()
                    handleFiles(e.dataTransfer.files)
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-ink/20 rounded-xl p-6 text-center hover:border-gold/50 transition-all"
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    id="photo-upload"
                    className="hidden"
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                  />
                  <label htmlFor="photo-upload" className="cursor-pointer text-sm text-ink/50">
                    <span className="font-semibold text-ink">Click to upload</span> or drag and drop photos here
                  </label>
                </div>
              </div>

              {/* ------------------------------------------- 360 virtual tour */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="block text-sm font-semibold text-ink">
                    360° photos for the virtual tour
                  </label>
                  <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide bg-gold/15 text-gold-dark border border-gold/25">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-ink/50 mb-2.5">
                  Optional. Buyers can look around the room instead of scrolling photos.
                  Use your phone's <span className="font-semibold text-ink/70">Panorama</span>{' '}
                  mode — stand in the middle of the room and turn slowly. One per room is
                  plenty.
                </p>

                {(existingPanoramas.length > 0 || panoramas.length > 0) && (
                  <div className="space-y-2 mb-3">
                    {existingPanoramas.map((url) => (
                      <PanoramaRow
                        key={url}
                        src={assetUrl(url)}
                        onRemove={() => removeExistingPanorama(url)}
                      />
                    ))}
                    {panoramas.map((file, i) => (
                      <PanoramaRow
                        key={`${file.name}-${i}`}
                        src={URL.createObjectURL(file)}
                        onRemove={() => removeNewPanorama(i)}
                      />
                    ))}
                  </div>
                )}

                <div
                  onDrop={(e) => {
                    e.preventDefault()
                    handlePanoramaFiles(e.dataTransfer.files)
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex-1 min-h-[86px] flex items-center justify-center border-2 border-dashed border-gold/30 bg-gold/[0.04] rounded-xl p-5 text-center hover:border-gold/60 transition-all"
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    id="panorama-upload"
                    className="hidden"
                    onChange={(e) => {
                      // Snapshot before resetting the input, or the files are gone by
                      // the time React runs the state updater.
                      const picked = Array.from(e.target.files ?? [])
                      e.target.value = ''
                      if (picked.length) handlePanoramaFiles(picked)
                    }}
                  />
                  <label
                    htmlFor="panorama-upload"
                    className="cursor-pointer text-sm text-ink/50 inline-flex items-center gap-2"
                  >
                    <Compass size={15} className="text-gold-dark" />
                    <span>
                      <span className="font-semibold text-ink">Add a 360° photo</span> or drag
                      one here
                    </span>
                  </label>
                </div>

                {panoramaWarning && (
                  <p className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-warn">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    {panoramaWarning}
                  </p>
                )}
              </div>

              {/* Direct publishing is not built — nothing in the server talks to the
                  Graph API. A toggle that flips but does nothing is worse than no
                  toggle, so this is inert and says why. Kept visible rather than
                  removed: it tells an agent the feature is coming, and the listing
                  already carries the publishToFacebook column for when it lands. */}
              <div
                aria-disabled="true"
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-ink/10 bg-ink/[0.02] cursor-not-allowed select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FacebookIcon className="w-5 h-5 text-[#1877F2] opacity-40 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-ink/45">
                        Publish to Facebook Page
                      </span>
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide bg-ink/10 text-ink/50">
                        Coming soon
                      </span>
                    </div>
                    <p className="text-[11px] text-ink/40 mt-0.5">
                      For now, export the reel and post it yourself.
                    </p>
                  </div>
                </div>

                {/* Rendered off and unreachable — not a button, so it cannot be tabbed
                    to or clicked. */}
                <div className="w-10 h-5 rounded-full bg-ink/10 relative shrink-0">
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ink/20" />
                </div>
              </div>
            </div>

            {/* ------------------------------------- numbers and choices */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-ink mb-1.5">Price (₱)</label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    min="0"
                    className="w-full px-3 py-2.5 rounded-lg border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink mb-1.5">Lot (sqm)</label>
                  <input
                    type="number"
                    value={lotArea}
                    onChange={(e) => setLotArea(e.target.value)}
                    min="0"
                    className="w-full px-3 py-2.5 rounded-lg border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink mb-1.5">Floor (sqm)</label>
                  <input
                    type="number"
                    value={floorArea}
                    onChange={(e) => setFloorArea(e.target.value)}
                    min="0"
                    className="w-full px-3 py-2.5 rounded-lg border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Listing Type</label>
                <div className="flex gap-2">
                  {[
                    { value: 'sale', label: 'For Sale' },
                    { value: 'rent', label: 'For Rent' },
                  ].map((t) => (
                    <button
                      type="button"
                      key={t.value}
                      onClick={() => setListingType(t.value)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        listingType === t.value
                          ? 'bg-gold text-navy-dark border-gold'
                          : 'text-ink/60 border-ink/15 hover:bg-ink/5'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Property Status</label>
                <div className="flex gap-2">
                  {['bare', 'semi-furnished', 'fully-furnished'].map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setStatus(s)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all capitalize ${
                        status === s
                          ? 'bg-ink text-app border-ink'
                          : 'text-ink/60 border-ink/15 hover:bg-ink/5'
                      }`}
                    >
                      {s.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <label className="block text-sm font-semibold text-ink mb-1.5">Amenities</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AMENITY_OPTIONS.map((a) => (
                    <button
                      type="button"
                      key={a}
                      onClick={() => toggleAmenity(a)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all text-center truncate ${
                        amenities.includes(a)
                          ? 'bg-gold/15 text-gold-dark border-gold/40'
                          : 'text-ink/60 border-ink/15 hover:bg-ink/5'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>

                {customAmenities.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {customAmenities.map((a) => (
                      <span
                        key={a}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gold/15 text-gold-dark border border-gold/40 flex items-center gap-1.5"
                      >
                        {a}
                        <button type="button" onClick={() => toggleAmenity(a)} className="hover:text-danger">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* mt-auto drops this to the bottom of the stretched column, so it
                    lands level with the description box and the Facebook toggle. */}
                <div className="flex items-center gap-2 mt-auto pt-2">
                  <input
                    type="text"
                    value={customAmenity}
                    onChange={(e) => setCustomAmenity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCustomAmenity()
                      }
                    }}
                    placeholder="Add another amenity…"
                    className="flex-1 px-3 py-2.5 rounded-lg border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  />
                  <button
                    type="button"
                    onClick={addCustomAmenity}
                    aria-label="Add amenity"
                    className="w-10 h-10 rounded-lg bg-ink/10 text-ink flex items-center justify-center hover:bg-ink/20 transition-all flex-shrink-0"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* --------------------------------------- location and copy */}
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Location</label>
                <LocationPicker
                  latitude={latitude}
                  longitude={longitude}
                  onChange={(lat, lng) => {
                    setLatitude(lat)
                    setLongitude(lng)
                  }}
                />
              </div>

              {/* Grows into whatever height the tallest column sets, which is what
                  pulls every column down to the same bottom edge. */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold text-ink">Description</label>
                  <button
                    type="button"
                    onClick={handleGenerateDescription}
                    disabled={generating}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold-dark text-xs font-semibold hover:bg-gold/20 transition-all disabled:opacity-50"
                  >
                    <AmicusMark className="w-4 h-4 rounded-full" />
                    {generating ? 'Generating...' : 'Generate with Amicus AI'}
                  </button>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={LIMITS.listingDescription}
                  // min-h sets the row height for all three columns, so keeping it
                  // modest is what stops the form needing a scrollbar again.
                  className="w-full flex-1 min-h-[120px] resize-none px-4 py-2.5 rounded-lg border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  placeholder="Attach photos on the left, then generate with Amicus AI — or write your own"
                />
              </div>
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-ink/10 shrink-0">
          <button
            type="submit"
            form="create-listing-form"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-ink text-app font-semibold text-sm hover:bg-ink/85 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Listing'}
          </button>
        </div>
      </div>
    </div>
  )
}
/**
 * A panorama is too wide to preview in a grid cell, so each one gets a full-width
 * strip that shows its actual shape — which also makes a wrongly-shaped file obvious.
 */
function PanoramaRow({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative group rounded-lg overflow-hidden border border-ink/10">
      <img src={src} alt="" className="w-full h-16 object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove panorama"
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
      >
        ×
      </button>
      <span className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-extrabold uppercase tracking-wide">
        360°
      </span>
    </div>
  )
}
