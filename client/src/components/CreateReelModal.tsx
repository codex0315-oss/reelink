import { useEffect, useState } from 'react'
import { X, Sparkles, ImageIcon, ChevronLeft, PlayCircle, Check, Clock, Film } from 'lucide-react'
import {
  generateReel,
  generateQuickReel,
  fetchReelTemplates,
  fetchReelQuota,
} from '../lib/api'
import AmicusMark from './AmicusMark'
import { assetUrl } from '../lib/config'

type Template = {
  id: string
  name: string
  description: string
  previewUrl: string
  secondsPerPhoto: number
}

type Listing = {
  id: string
  title: string
  price: number
  photoUrls: string[]
}

type Props = {
  token: string
  listings: Listing[]
  onClose: () => void
  onCreated: () => void
}

const AMENITY_OPTIONS = ['Pool', 'Garage', 'Garden', 'Balcony', 'Gated', 'Furnished']

type Mode = 'choose' | 'listing' | 'ai' | 'template'

export default function CreateReelModal({ token, listings, onClose, onCreated }: Props) {
  // Skip the chooser when there is nothing to choose from.
  const [mode, setMode] = useState<Mode>(listings.length === 0 ? 'ai' : 'choose')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Whichever source the user picked, held until they choose a template.
  const [pendingListingId, setPendingListingId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('classic')
  // Off by default: this one costs real money per reel, so it is only ever spent when
  // the agent deliberately asks for it.
  const [cinematic, setCinematic] = useState(false)
  const [quota, setQuota] = useState<Awaited<ReturnType<typeof fetchReelQuota>> | null>(null)

  // Loaded once per open. The allowance only changes when a reel is generated, and
  // generating one closes this modal.
  useEffect(() => {
    fetchReelQuota(token)
      .then(setQuota)
      .catch(() => undefined) // the toggle still works; it just cannot show a count
  }, [token])

  const cinematicSpent = !!quota && !quota.cinematic.available

  useEffect(() => {
    fetchReelTemplates(token)
      .then((list: Template[]) => {
        setTemplates(list)
        if (list[0]) setSelectedTemplate(list[0].id)
      })
      .catch(() => undefined)
  }, [token])

  // AI quick-create fields
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [status, setStatus] = useState('bare')
  const [listingType, setListingType] = useState('sale')
  const [amenities, setAmenities] = useState<string[]>([])
  const [photos, setPhotos] = useState<File[]>([])

  function handleFiles(files: FileList) {
    setPhotos((prev) => [...prev, ...Array.from(files)])
  }

  function toggleAmenity(a: string) {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  // Both sources park here first; nothing is generated until a template is picked.
  function handleFromListing(listingId: string) {
    setError('')
    setPendingListingId(listingId)
    setMode('template')
  }

  function handleQuickCreate(e: React.FormEvent) {
    e.preventDefault()
    if (photos.length === 0) {
      setError('Add at least one photo — the reel is built from your images.')
      return
    }
    setError('')
    setPendingListingId(null)
    setMode('template')
  }

  async function handleGenerate() {
    setError('')
    setLoading(true)
    try {
      if (pendingListingId) {
        await generateReel(token, pendingListingId, selectedTemplate, cinematic)
      } else {
        const formData = new FormData()
        formData.append('title', title)
        formData.append('price', price)
        formData.append('status', status)
        formData.append('listingType', listingType)
        formData.append('amenities', JSON.stringify(amenities))
        formData.append('template', selectedTemplate)
        photos.forEach((file) => formData.append('photos', file))
        await generateQuickReel(token, formData)
      }
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reel')
    } finally {
      setLoading(false)
    }
  }

  /** Going back from the template step returns to whichever source was used. */
  function handleBack() {
    setError('')
    if (mode === 'template') {
      setMode(pendingListingId ? 'listing' : 'ai')
      return
    }
    setMode('choose')
  }

  return (
    <div className="fixed inset-0 bg-navy-dark/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-6">
      <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-5xl max-h-[94vh] sm:max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink/10">
          <div className="flex items-center gap-2">
            {mode !== 'choose' && (listings.length > 0 || mode === 'template') && (
              <button onClick={handleBack} className="text-ink/40 hover:text-ink">
                <ChevronLeft size={18} />
              </button>
            )}
            <h2 className="font-bold text-ink text-lg">
              {mode === 'choose' && 'Create Reel'}
              {mode === 'listing' && 'Pick a property'}
              {mode === 'ai' && 'Create with Amicus AI'}
              {mode === 'template' && 'Choose a template'}
            </h2>
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-danger text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {mode === 'choose' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <button
                onClick={() => setMode('listing')}
                className="text-left p-5 rounded-xl border-2 border-ink/10 hover:border-gold hover:bg-gold/5 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-navy-dark flex items-center justify-center mb-3">
                  <ImageIcon size={20} className="text-gold" />
                </div>
                <h3 className="font-bold text-ink text-sm">From a listing</h3>
                <p className="text-xs text-ink/50 mt-1">
                  Use the photos and details from a property you've already listed.
                </p>
              </button>

              <button
                onClick={() => setMode('ai')}
                className="text-left p-5 rounded-xl border-2 border-ink/10 hover:border-gold hover:bg-gold/5 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-gold/15 flex items-center justify-center mb-3">
                  <AmicusMark className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-ink text-sm">Create with Amicus AI</h3>
                <p className="text-xs text-ink/50 mt-1">
                  Just add photos and details — no listing needed. AI writes the copy.
                </p>
              </button>
            </div>
          )}

          {mode === 'listing' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {listings.map((listing) => (
                <button
                  key={listing.id}
                  disabled={loading || listing.photoUrls.length === 0}
                  onClick={() => handleFromListing(listing.id)}
                  className="text-left rounded-xl border border-ink/10 overflow-hidden hover:border-gold transition-all disabled:opacity-50"
                >
                  {listing.photoUrls[0] ? (
                    <img
                      src={assetUrl(listing.photoUrls[0])}
                      alt=""
                      className="w-full h-28 object-cover"
                    />
                  ) : (
                    <div className="w-full h-28 bg-ink/5 flex items-center justify-center">
                      <PlayCircle size={20} className="text-ink/20" />
                    </div>
                  )}
                  <div className="p-3">
                    <h3 className="font-semibold text-ink text-xs truncate">{listing.title}</h3>
                    <p className="text-gold-dark font-bold text-xs mt-0.5">
                      ₱{Number(listing.price).toLocaleString()}
                    </p>
                    {listing.photoUrls.length === 0 && (
                      <p className="text-[10px] text-ink/40 mt-1">Needs a photo first</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {mode === 'ai' && (
            <form id="quick-reel-form" onSubmit={handleQuickCreate} className="space-y-5">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-gold/10 border border-gold/20">
                <Sparkles size={16} className="text-gold-dark mt-0.5 shrink-0" />
                <p className="text-xs text-ink/70">
                  Amicus AI writes the headline from these details. Nothing is added to your listings —
                  this creates a reel only.
                </p>
              </div>

              {/* Two columns so the whole form is visible at once: the photos and the
                  headline on the left, the details that describe them on the right. */}
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="flex flex-col gap-4">
                  <div className="flex-1 flex flex-col min-h-0">
                    <label className="block text-sm font-semibold text-ink mb-1.5">Photos</label>
                    {photos.length > 0 && (
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-3">
                        {photos.map((file, i) => (
                          <div key={i} className="relative group">
                            <img
                              src={URL.createObjectURL(file)}
                              alt=""
                              className="w-full h-16 object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
                      onDragOver={(e) => e.preventDefault()}
                      className="flex-1 min-h-[110px] flex items-center justify-center border-2 border-dashed border-ink/20 rounded-xl p-5 text-center hover:border-gold/50 transition-all"
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        id="reel-photo-upload"
                        className="hidden"
                        onChange={(e) => e.target.files && handleFiles(e.target.files)}
                      />
                      <label htmlFor="reel-photo-upload" className="cursor-pointer text-sm text-ink/50">
                        <span className="font-semibold text-ink">Click to upload</span> or drag photos here
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1.5">
                      Property / location
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      className="w-full px-4 py-2.5 rounded-lg border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                      placeholder="3BR House in Talamban, Cebu"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-ink mb-1.5">Price (₱)</label>
                      <input
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        required
                        min={0}
                        className="w-full px-4 py-2.5 rounded-lg border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                        placeholder="23000000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink mb-1.5">Listing type</label>
                      <div className="flex gap-2">
                        {(['sale', 'rent'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setListingType(t)}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                              listingType === t
                                ? 'bg-gold text-navy-dark border-gold'
                                : 'border-ink/15 text-ink/50 hover:border-ink/30'
                            }`}
                          >
                            {t === 'sale' ? 'For Sale' : 'For Rent'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1.5">Property status</label>
                    <div className="flex gap-2">
                      {([
                        ['bare', 'Bare'],
                        ['semi-furnished', 'Semi Furnished'],
                        ['fully-furnished', 'Fully Furnished'],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setStatus(value)}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                            status === value
                              ? 'bg-ink text-app border-ink'
                              : 'border-ink/15 text-ink/50 hover:border-ink/30'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1.5">Amenities</label>
                    <div className="flex flex-wrap gap-2">
                      {AMENITY_OPTIONS.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => toggleAmenity(a)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            amenities.includes(a)
                              ? 'bg-gold/15 border-gold text-ink'
                              : 'border-ink/15 text-ink/50 hover:border-ink/30'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </form>
          )}

          {mode === 'template' && (
            <div>
              <p className="text-xs text-ink/50 mb-3">
                Sets the layout, motion and pacing. You can regenerate with a different
                one later.
              </p>

              {/* Only offered for saved listings: the quick-create flow uploads photos
                  with the request, so there is no stored file to animate from yet. */}
              {pendingListingId && (
                <button
                  type="button"
                  onClick={() => setCinematic((c) => !c)}
                  aria-pressed={cinematic}
                  // Disabled once the day's allowance is spent, rather than letting the
                  // agent switch it on and meet a 429 after choosing a template.
                  disabled={cinematicSpent}
                  className={`w-full flex items-start gap-3 p-3.5 mb-4 rounded-xl border-2 text-left transition-all ${
                    cinematicSpent
                      ? 'border-ink/10 opacity-55 cursor-not-allowed'
                      : cinematic
                        ? 'border-gold bg-gold/10'
                        : 'border-ink/10 hover:border-ink/25'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-colors ${
                      cinematic ? 'bg-gold text-navy-dark' : 'bg-ink/5 text-ink/40'
                    }`}
                  >
                    <Film size={17} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-ink text-sm">Cinematic opening</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-gold/20 text-gold-dark">
                        AI
                      </span>
                    </span>
                    <span className="block text-xs text-ink/55 mt-0.5 leading-relaxed">
                      Animates your first photo into a moving shot with a real camera
                      push. Adds a minute or two.
                    </span>
                    {/* The real figure, read from the same rows the server enforces
                        against — a hard-coded "2 daily" said nothing about what was
                        actually left after one had been used. */}
                    <span
                      className={`block text-[11px] font-bold mt-1.5 ${
                        cinematicSpent ? 'text-warn' : 'text-gold-dark'
                      }`}
                    >
                      {quota
                        ? cinematicSpent
                          ? `All ${quota.cinematic.limit} used today — resets tomorrow`
                          : `${quota.cinematic.remaining} of ${quota.cinematic.limit} left today`
                        : 'Checking your allowance…'}
                    </span>
                  </span>

                  {/* Reads as a switch rather than a checkbox, since it changes what the
                      render costs rather than just what it looks like. */}
                  <span
                    className={`mt-1 shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors ${
                      cinematic ? 'bg-gold' : 'bg-ink/15'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        cinematic ? 'translate-x-4' : ''
                      }`}
                    />
                  </span>
                </button>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {templates.map((tpl) => {
                  const active = selectedTemplate === tpl.id
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className={`text-left rounded-xl border-2 overflow-hidden transition-all ${
                        active
                          ? 'border-gold shadow-lg shadow-gold/10'
                          : 'border-ink/10 hover:border-ink/25'
                      }`}
                    >
                      {/* Fixed height rather than a 9:16 box: at this card width the
                          aspect ratio alone made the previews ~410px tall, which is
                          what forced the step to scroll. object-contain keeps the
                          whole frame visible — cropping would hide the very details
                          that tell the templates apart. */}
                      <div className="relative h-72 bg-navy-dark flex items-center justify-center">
                        {/* Previews are rendered ahead of time; until one exists the
                            card still communicates the template's character. */}
                        <video
                          src={tpl.previewUrl}
                          className="h-full w-auto object-contain"
                          muted
                          loop
                          playsInline
                          autoPlay
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                        {active && (
                          <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gold text-navy-dark flex items-center justify-center">
                            <Check size={13} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <div className="font-bold text-ink text-xs">{tpl.name}</div>
                        <p className="text-[11px] text-ink/50 mt-0.5 leading-snug">
                          {tpl.description}
                        </p>
                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-ink/40 font-semibold">
                          <Clock size={10} />
                          {tpl.secondsPerPhoto}s per photo
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {mode === 'ai' && (
          <div className="px-6 py-4 border-t border-ink/10 shrink-0">
            <button
              type="submit"
              form="quick-reel-form"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-ink text-app font-semibold hover:bg-ink/85 transition-all active:scale-[0.99] disabled:opacity-50"
            >
              Next: choose a template
            </button>
          </div>
        )}

        {mode === 'template' && (
          <div className="px-6 py-4 border-t border-ink/10 shrink-0">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gold text-navy-dark font-extrabold hover:bg-gold-dark transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Sparkles size={16} />
              {loading ? 'Starting…' : 'Generate Reel'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
