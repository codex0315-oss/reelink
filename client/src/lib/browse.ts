import type { BrowseListing } from '../components/PropertyCard'

/**
 * The city a listing is in, read out of its title.
 *
 * A stopgap, and worth being plain about: there is no city on the listing. Titles
 * happen to follow "Condo in Cebu City", so this reads that, and anything not in that
 * shape falls through to null and is grouped as "More properties" rather than being
 * guessed at.
 *
 * The real fix is a city field on the listing form, which would also let an agent write
 * "Bright 3BR near IT Park" without vanishing from every city row. Until then this is
 * honest about what it does not know.
 */
export function cityOf(listing: { title: string }): string | null {
  const match = listing.title.match(/\bin\s+([A-Za-zÑñ\s.'-]{3,40})$/i)
  if (!match) return null

  const city = match[1].trim().replace(/\s+/g, ' ')
  // A trailing "in ..." that is clearly not a place — "in need of repair".
  if (/^(need|good|great|excellent|perfect)\b/i.test(city)) return null

  return city
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** A row's worth of listings, with the heading it should carry. */
export type ListingGroup = { title: string; listings: BrowseListing[] }

/**
 * How many listings a city needs before it earns its own row.
 *
 * Two, not one. A row headed "Available in Talisay" holding a single card advertises
 * how little is there; the same card inside "More properties across the Philippines"
 * does not. The threshold is what keeps city rows from becoming a list of ones.
 */
const MIN_PER_CITY = 2;

/**
 * Groups listings into rows, biggest city first.
 *
 * Cities too thin for a row of their own are pooled at the end rather than dropped, so
 * every listing is reachable however it was titled. With a small catalogue this
 * collapses to a single honest row, which is the right shape for a platform that is
 * new rather than empty.
 */
export function groupByCity(listings: BrowseListing[]): ListingGroup[] {
  const byCity = new Map<string, BrowseListing[]>()
  const leftovers: BrowseListing[] = []

  for (const listing of listings) {
    const city = cityOf(listing)
    if (!city) {
      leftovers.push(listing)
      continue
    }
    byCity.set(city, [...(byCity.get(city) ?? []), listing])
  }

  const groups: ListingGroup[] = []
  for (const [city, items] of byCity) {
    if (items.length >= MIN_PER_CITY) {
      groups.push({ title: `Places to stay in ${city}`, listings: items })
    } else {
      leftovers.push(...items)
    }
  }

  // Largest first, so the page opens with the row that looks fullest.
  groups.sort((a, b) => b.listings.length - a.listings.length)

  if (leftovers.length > 0) {
    groups.push({
      title: groups.length > 0 ? 'More properties' : 'Properties on Reelink',
      listings: leftovers,
    })
  }

  return groups
}

/**
 * What someone is here to do, which is the first thing a search should ask.
 *
 * "360° tours" used to sit alongside these as a fourth tab, and it never belonged: buying
 * and renting are mutually exclusive intentions, while a tour is a feature a property
 * either has or does not. Mixing the two meant picking "360° tours" silently threw away
 * whether you wanted to buy. It is now a toggle in the filters, where it composes with
 * everything else instead of replacing it.
 */
export type Category = 'all' | 'sale' | 'rent'

export const INTENTS: { id: Category; label: string; hint: string }[] = [
  { id: 'all', label: 'Anything', hint: 'Sale and rent' },
  { id: 'sale', label: 'Buying', hint: 'For sale' },
  { id: 'rent', label: 'Renting', hint: 'For rent' },
]

/** The short form, for the collapsed search bar where there is no room for a hint. */
export function intentLabel(category: Category): string {
  if (category === 'sale') return 'For sale'
  if (category === 'rent') return 'For rent'
  return 'Any'
}

/** Filters rather than fills, which is why it holds up even with a small catalogue. */
export function byCategory(listings: BrowseListing[], category: Category) {
  if (category === 'all') return listings
  return listings.filter((l) => l.listingType === category)
}

/** Every city with a listing in it, most-listed first — the search bar's suggestions. */
export function citiesOf(listings: BrowseListing[]): string[] {
  const counts = new Map<string, number>()
  for (const listing of listings) {
    const city = cityOf(listing)
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([city]) => city)
}

/** The furnishing values a listing can carry, as stored. */
export const FURNISHINGS = [
  { value: 'bare', label: 'Bare' },
  { value: 'semi-furnished', label: 'Semi-furnished' },
  { value: 'fully-furnished', label: 'Fully furnished' },
] as const

export type SortKey = 'newest' | 'price-asc' | 'price-desc'

export const SORTS: { id: SortKey; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
]

export type Filters = {
  query: string
  category: Category
  furnishings: string[]
  minPrice: string
  maxPrice: string
  /** Only properties with a walkable 360° tour. Was a tab; is a feature. */
  tourOnly: boolean
  sort: SortKey
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  category: 'all',
  furnishings: [],
  minPrice: '',
  maxPrice: '',
  tourOnly: false,
  sort: 'newest',
}

/**
 * Everything a search should look at, as one lowercase string.
 *
 * Title alone was too narrow: someone typing "pool" or "Minglanilla" or "3 bedroom"
 * gets nothing back from a catalogue that plainly contains all three, because those
 * words live in the description and the amenities rather than the name. The city is
 * folded in as well, so searching a place still works when the agent left it out of
 * the title.
 */
function haystack(listing: BrowseListing): string {
  return [
    listing.title,
    listing.description ?? '',
    listing.amenities?.join(' ') ?? '',
    cityOf(listing) ?? '',
    listing.status.replace(/-/g, ' '),
  ]
    .join(' ')
    .toLowerCase()
}

/**
 * Applies every filter, then sorts.
 *
 * Words are matched independently rather than as one phrase, so "cebu condo" finds a
 * "Condo in Cebu City" — a buyer types what they want, not the title as written.
 */
export function applyFilters(listings: BrowseListing[], f: Filters): BrowseListing[] {
  const terms = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const min = f.minPrice ? Number(f.minPrice) : null
  const max = f.maxPrice ? Number(f.maxPrice) : null

  const matched = byCategory(listings, f.category).filter((listing) => {
    if (terms.length > 0) {
      const text = haystack(listing)
      if (!terms.every((t) => text.includes(t))) return false
    }
    if (f.furnishings.length > 0 && !f.furnishings.includes(listing.status)) return false
    if (f.tourOnly && (listing.panoramaUrls?.length ?? 0) === 0) return false
    // Number('') is 0, which would silently filter everything under nothing — hence
    // the explicit null above rather than a falsy check here.
    if (min !== null && Number.isFinite(min) && listing.price < min) return false
    if (max !== null && Number.isFinite(max) && listing.price > max) return false
    return true
  })

  return sortListings(matched, f.sort)
}

function sortListings(listings: BrowseListing[], sort: SortKey): BrowseListing[] {
  // A copy: sorting the array in place would reorder the caller's state and make the
  // next render start from an order nobody chose.
  const copy = [...listings]
  if (sort === 'price-asc') return copy.sort((a, b) => a.price - b.price)
  if (sort === 'price-desc') return copy.sort((a, b) => b.price - a.price)
  return copy.sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  )
}

/**
 * How many of the *hidden* filters are doing something.
 *
 * Deliberately not every filter. Where, intent and budget all sit in the search bar
 * where you can read them; furnishing and 360° live behind a button, and a filter you
 * cannot see is the one that quietly empties the page. The badge counts what is out of
 * sight, because that is what someone needs telling about.
 */
export function countActive(f: Filters): number {
  return f.furnishings.length + (f.tourOnly ? 1 : 0)
}

/**
 * The search, as a URL.
 *
 * Only what is set, so an untouched search gives a clean `/browse` rather than a query
 * string full of empties. This is what lets a search be shared, bookmarked, or survive a
 * reload — and it is why the homepage can hand its draft to the browse page without the
 * two needing to know anything about each other.
 */
export function toParams(f: Filters): string {
  const params = new URLSearchParams()
  if (f.query.trim()) params.set('q', f.query.trim())
  if (f.category !== 'all') params.set('type', f.category)
  if (f.minPrice) params.set('min', f.minPrice)
  if (f.maxPrice) params.set('max', f.maxPrice)
  if (f.tourOnly) params.set('tour', '1')
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** The other direction: a URL back into filters, for arriving at /browse with a link. */
export function fromParams(params: URLSearchParams): Filters {
  const type = params.get('type')
  return {
    ...EMPTY_FILTERS,
    query: params.get('q') ?? '',
    category: type === 'sale' || type === 'rent' ? type : 'all',
    // Anything non-numeric is dropped rather than trusted — these come from a URL, which
    // anyone can edit, and a stray "abc" would otherwise sit in the box filtering nothing.
    minPrice: (params.get('min') ?? '').replace(/[^\d]/g, ''),
    maxPrice: (params.get('max') ?? '').replace(/[^\d]/g, ''),
    tourOnly: params.get('tour') === '1',
  }
}

/**
 * Whether anything at all is narrowing the results.
 *
 * Separate from countActive because it answers a different question: not "what should
 * the badge say" but "is this screen empty because of them, or because we have nothing".
 * Those two call for opposite messages.
 */
export function isNarrowed(f: Filters): boolean {
  return (
    f.query.trim().length > 0 ||
    f.category !== 'all' ||
    f.furnishings.length > 0 ||
    f.tourOnly ||
    Boolean(f.minPrice) ||
    Boolean(f.maxPrice)
  )
}
