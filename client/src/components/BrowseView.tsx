import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MapPin, X, Map as MapIcon, List } from 'lucide-react'
import BrowseMap from './BrowseMap'
import ErrorBoundary from './ErrorBoundary'
import ListingCard from './ListingCard'

type Listing = {
  id: string
  title: string
  price: number
  photoUrls: string[]
  status: string
  listingType: string
  floorArea?: number
  lotArea?: number
  latitude?: number | null
  longitude?: number | null
  user?: { id: string; name: string; avatarUrl?: string | null }
}

type Props = {
  listings: Listing[]
  loading: boolean
}

const STATUSES = [
  { value: 'bare', label: 'Bare' },
  { value: 'semi-furnished', label: 'Semi' },
  { value: 'fully-furnished', label: 'Furnished' },
]

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'sale', label: 'For Sale' },
  { value: 'rent', label: 'For Rent' },
] as const

export default function BrowseView({ listings, loading }: Props) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [type, setType] = useState<'all' | 'sale' | 'rent'>('all')
  const [status, setStatus] = useState<string[]>([])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const min = minPrice ? Number(minPrice) : null
    const max = maxPrice ? Number(maxPrice) : null
    const q = search.trim().toLowerCase()

    return listings.filter((l) => {
      if (q && !l.title.toLowerCase().includes(q)) return false
      if (type !== 'all' && l.listingType !== type) return false
      if (status.length && !status.includes(l.status)) return false
      if (min !== null && l.price < min) return false
      if (max !== null && l.price > max) return false
      return true
    })
  }, [listings, search, type, status, minPrice, maxPrice])

  const unmappedCount = visible.filter(
    (l) => typeof l.latitude !== 'number' || typeof l.longitude !== 'number',
  ).length

  const activeFilters =
    (type !== 'all' ? 1 : 0) + status.length + (minPrice ? 1 : 0) + (maxPrice ? 1 : 0)

  function toggleStatus(v: string) {
    setStatus((prev) => (prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]))
  }

  function clearFilters() {
    setType('all')
    setStatus([])
    setMinPrice('')
    setMaxPrice('')
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)]">
      {/* ------------------------------------------------------------ header */}
      <div className="shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h1 className="font-heading text-lg font-bold text-ink">Browse Properties</h1>
              <p className="text-sm text-ink/50">
                {visible.length} propert{visible.length === 1 ? 'y' : 'ies'}
              </p>
            </div>
            {activeFilters > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-ink/50 hover:text-danger hover:bg-red-500/10 transition-all"
              >
                <X size={13} />
                Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
              </button>
            )}
          </div>

          <div className="relative lg:w-80">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-ink/15 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
            />
          </div>
        </div>

        {/* One scrolling row on phones, a three-column bar from md: up. scrollbar-hide
            keeps the row from spending vertical space on a scrollbar; the groups are
            shrink-0 above so they keep their natural width and scroll instead of
            compressing into unreadable stubs. */}
        <div className="mb-4 p-3 md:p-4 rounded-2xl bg-card border border-ink/10 flex md:grid items-center gap-2 md:gap-4 lg:gap-5 md:grid-cols-3 overflow-x-auto md:overflow-visible scrollbar-hide">
          <FilterGroup label="Listing type">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`flex-none md:flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  type === t.value
                    ? 'bg-ink text-app'
                    : 'bg-ink/5 text-ink/60 hover:bg-ink/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup label="Furnishing">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => toggleStatus(s.value)}
                className={`flex-none md:flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  status.includes(s.value)
                    ? 'bg-gold text-navy-dark'
                    : 'bg-ink/5 text-ink/60 hover:bg-ink/10'
                }`}
              >
                {s.label}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup label="Price range (₱)">
            <input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min"
              className="w-20 md:w-auto md:flex-1 min-w-0 px-3 py-2 rounded-lg border border-ink/15 bg-card text-xs focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <span className="text-ink/30 shrink-0">–</span>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max"
              className="w-20 md:w-auto md:flex-1 min-w-0 px-3 py-2 rounded-lg border border-ink/15 bg-card text-xs focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </FilterGroup>
        </div>
      </div>

      {/* ------------------------------------------------- list + sticky map */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-[1.15fr_1fr] gap-5">
        <div className="min-h-0 overflow-y-auto pr-1">
          {loading ? (
            <p className="text-sm text-ink/40 py-10 text-center">Loading properties…</p>
          ) : visible.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-xl bg-ink/5 mx-auto mb-3 flex items-center justify-center">
                <MapPin size={20} className="text-ink/25" />
              </div>
              <p className="font-bold text-ink text-sm">No properties match</p>
              <p className="text-xs text-ink/50 mt-1">Try widening your filters.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4 pb-2">
              {visible.map((listing) => (
                <div
                  key={listing.id}
                  onMouseEnter={() => setHoveredId(listing.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`rounded-2xl transition-all ${
                    selectedId === listing.id ? 'ring-2 ring-gold' : ''
                  }`}
                >
                  {/* The card opens the property; the map is driven by hover and by
                      clicking a pin, so the two no longer compete for the click. */}
                  <ListingCard
                    listing={listing}
                    isOwner={false}
                    onClick={() => navigate(`/dashboard/property/${listing.id}`)}
                  />
                </div>
              ))}
            </div>
          )}

          {unmappedCount > 0 && (
            <p className="text-[11px] text-ink/40 text-center py-3">
              {unmappedCount} propert{unmappedCount === 1 ? 'y has' : 'ies have'} no map location
              set, so {unmappedCount === 1 ? 'it does' : 'they do'} not appear as a pin.
            </p>
          )}
        </div>

        {/* Sticky: the map holds its position while the list scrolls beside it. */}
        <div className="hidden lg:block min-h-0 relative">
          <div className="absolute inset-0 rounded-2xl overflow-hidden border border-ink/10">
            <ErrorBoundary label="The map could not be drawn">
              <BrowseMap
                listings={visible}
                hoveredId={hoveredId}
                selectedId={selectedId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Phones get one at a time; a split view is unusable at that width. */}
      <MobileMapToggle
        listings={visible}
        hoveredId={hoveredId}
        selectedId={selectedId}
        onHover={setHoveredId}
        onSelect={setSelectedId}
      />
    </div>
  )
}

/** Label above a row of controls that stretch to fill the column. */
/**
 * One filter, laid out two ways.
 *
 * From md: up it is a labelled block in a three-column bar. Below that the label is
 * dropped and the controls sit inline in a single scrolling row — three stacked labelled
 * sections cost about 220px of a 640px screen, which left roughly one property card
 * visible. The filters stay on screen either way; only the chrome around them goes.
 */
function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 shrink-0 md:shrink">
      <label className="hidden md:block text-[11px] font-bold text-ink/50 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  )
}

function MobileMapToggle(props: React.ComponentProps<typeof BrowseMap>) {
  const [open, setOpen] = useState(false)

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        // Same clearance as the Amicus bubble, and for the same reason: this control
        // only ever renders on a phone, where 24px from the bottom puts it under the
        // browser's toolbar.
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-ink text-app text-sm font-bold shadow-2xl active:scale-95 transition-all"
      >
        {open ? <List size={16} /> : <MapIcon size={16} />}
        {open ? 'Show list' : 'Show map'}
      </button>

      {open && (
        <div className="fixed inset-0 top-16 z-30 bg-app p-4">
          <div className="w-full h-full rounded-2xl overflow-hidden border border-ink/10">
            <ErrorBoundary label="The map could not be drawn">
            <BrowseMap {...props} />
          </ErrorBoundary>
          </div>
        </div>
      )}
    </div>
  )
}
