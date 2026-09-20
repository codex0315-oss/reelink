import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Home } from 'lucide-react'
import PublicChrome, { HEADER_OFFSET } from '../components/PublicChrome'
import ListingRow from '../components/ListingRow'
import FilterBar from '../components/FilterBar'
import SearchBar from '../components/SearchBar'
import type { BrowseListing } from '../components/PropertyCard'
import { fetchAllListings } from '../lib/api'
import {
  EMPTY_FILTERS,
  applyFilters,
  citiesOf,
  fromParams,
  groupByCity,
  isNarrowed,
  toParams,
} from '../lib/browse'

/**
 * Every property on Reelink, without an account.
 *
 * The listings endpoint was already open; this is the interface that was missing. A
 * buyer sent a property link, or arriving from a reel on Facebook, can now look before
 * being asked to register — and an agent listing here knows their property is visible
 * to anyone, not only to members.
 */
export default function BrowsePage() {
  const navigate = useNavigate()
  const [listings, setListings] = useState<BrowseListing[] | null>(null)
  const [error, setError] = useState('')
  // The URL is the search. Arriving from the homepage, a shared link or a reload all
  // land in the same place, and the bar shows what was asked for rather than sitting
  // empty above a filtered page.
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState(() => fromParams(params))

  useEffect(() => {
    fetchAllListings()
      .then(setListings)
      .catch(() => setError('Could not load properties. Please try again.'))
  }, [])

  /**
   * Filters are applied as they change; the URL follows behind.
   *
   * `replace` rather than push, so Back leaves browse instead of walking backwards
   * one keystroke at a time through what was typed.
   */
  const update = (next: typeof filters) => {
    setFilters(next)
    setParams(toParams(next).replace(/^\?/, ''), { replace: true })
  }

  const matching = useMemo(
    () => (listings ? applyFilters(listings, filters) : []),
    [listings, filters],
  )
  const cities = useMemo(() => (listings ? citiesOf(listings) : []), [listings])

  /**
   * City rows are for browsing, not for reading results.
   *
   * Once someone has searched or sorted, splitting the matches across city headings
   * buries the answer and throws away the order they asked for. A flat list is what a
   * result set should look like.
   */
  const isSearching = filters.query.trim().length > 0 || filters.sort !== 'newest'
  /** Whether an empty screen is the filters' doing or an empty catalogue. */
  const narrowed = isNarrowed(filters)
  const groups = useMemo(
    () => (isSearching ? [{ title: 'Results', listings: matching }] : groupByCity(matching)),
    [matching, isSearching],
  )

  return (
    <PublicChrome overlayHero>
      {/* A centred masthead over the same texture as the homepage, so moving between
          the two does not feel like moving between two sites. z-10, and the clipping
          on the decoration rather than the section — otherwise `overflow-hidden` cuts
          the search panels off at the section's bottom edge. Same arrangement as the
          homepage hero, for the same reason, including the offset for the header. */}
      <section className={`relative z-10 border-b border-line/10 ${HEADER_OFFSET}`}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 grid-texture grid-fade opacity-60" />
          <div
            className="ambient-glow absolute -top-56 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] rounded-full bg-gradient-to-br from-navy/60 via-gold/15 to-transparent blur-[150px]"
            aria-hidden
          />
        </div>

        <div className="relative max-w-site mx-auto px-5 sm:px-8 py-10 sm:py-12 text-center">
          <h1 className="font-heading text-headline font-black">
            Properties<span className="text-gold"> on Reelink</span>
          </h1>
          <p className="text-sm text-content/50 mt-2.5 max-w-xl mx-auto">
            Listed by agents across the Philippines. Message one to arrange a viewing.
          </p>

          {/* The same capsule as the homepage, a size down. Editing it filters in
              place — submitting only dismisses the keyboard, since there is nowhere
              further to go. */}
          <div className="mt-7">
            <SearchBar
              value={filters}
              onChange={update}
              cities={cities}
              size="compact"
            />
          </div>
        </div>
      </section>

      <div className="max-w-site mx-auto px-5 sm:px-8 py-10">
        {listings && (
          <FilterBar filters={filters} onChange={update} resultCount={matching.length} />
        )}

        {error && <p className="text-sm text-danger py-10 text-center">{error}</p>}

        {!error && !listings && (
          <p className="text-sm text-content/40 py-20 text-center">Loading properties…</p>
        )}

        {listings && matching.length === 0 && (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 mx-auto mb-5 flex items-center justify-center">
              <Home size={22} className="text-gold-dark" />
            </div>
            {/* Two different situations that look identical if worded the same: a
                filter that excluded everything, and a catalogue with nothing in it.
                Telling them apart is the difference between "widen your search" and
                "come back later". */}
            <h2 className="font-bold text-lg mb-2">
              {narrowed ? 'No matches' : 'Nothing here yet'}
            </h2>
            <p className="text-sm text-content/50 max-w-sm mx-auto">
              {narrowed
                ? 'No properties match that. Try a different city, a wider budget, or clear a filter.'
                : 'The first properties are on their way. Check back shortly.'}
            </p>
            {narrowed && (
              <button
                onClick={() => update({ ...EMPTY_FILTERS, sort: filters.sort })}
                className="mt-5 px-5 py-2.5 rounded-full bg-gold text-navy-dark text-sm font-extrabold hover:bg-gold-dark transition-all active:scale-95"
              >
                Clear the search
              </button>
            )}
          </div>
        )}

        {groups.map((group) => (
          <ListingRow
            key={group.title}
            title={group.title}
            listings={group.listings}
            onOpen={(id) => navigate(`/property/${id}`)}
          />
        ))}
      </div>
    </PublicChrome>
  )
}
