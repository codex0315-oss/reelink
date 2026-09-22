import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import PublicChrome, { HEADER_OFFSET } from '../components/PublicChrome'
import ListingRow from '../components/ListingRow'
import SearchBar from '../components/SearchBar'
import type { BrowseListing } from '../components/PropertyCard'
import { fetchAllListings } from '../lib/api'
import {
  EMPTY_FILTERS,
  applyFilters,
  citiesOf,
  groupByCity,
  isNarrowed,
  toParams,
  type Filters,
} from '../lib/browse'

/**
 * The homepage: properties, and nothing else.
 *
 * No pitch and no explanation of the product. Everything aimed at agents lives at
 * /for-agents, which they reach from the header — the "For agents" link and the "List
 * your property" button, both of which are always on screen. That is the whole of the
 * agent route from here, and it is deliberate: this page is for people looking for
 * somewhere to live.
 *
 * With a small catalogue the rows collapse to one honest shelf rather than a grid of
 * gaps — see groupByCity, where a city needs two listings before it earns a heading.
 */
export default function HomePage() {
  const navigate = useNavigate()
  const [listings, setListings] = useState<BrowseListing[] | null>(null)
  // The search bar edits a full Filters object so it behaves identically here and on
  // /browse. Here nothing is applied in place: submitting carries it over as a URL.
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)

  useEffect(() => {
    // A failure here leaves the rows out and the rest of the page standing. The
    // homepage should never be blank because one request did not land.
    fetchAllListings()
      .then(setListings)
      .catch(() => setListings([]))
  }, [])

  const groups = useMemo(() => (listings ? groupByCity(listings) : []), [listings])
  const cities = useMemo(() => (listings ? citiesOf(listings) : []), [listings])

  /** What the current draft would return, so the button can say so before you commit. */
  const preview = useMemo(
    () => (listings ? applyFilters(listings, draft).length : 0),
    [listings, draft],
  )
  const touched = isNarrowed(draft)

  const search = () => navigate(`/browse${toParams(draft)}`)

  return (
    <PublicChrome overlayHero>
      {/* A short hero, not a pitch. Enough to say where you are and let you search;
          the properties below are the argument. z-10 so the search panels, which hang
          below this section, paint over the listings rather than under them. It runs
          up behind the transparent header, hence the offset. */}
      <section className={`relative z-10 border-b border-line/10 ${HEADER_OFFSET}`}>
        {/* The clipping lives here, on the decoration, rather than on the section.
            `overflow-hidden` on the section itself is what the glow needs — it is wider
            than the page and would otherwise bleed — but it also silently cut every
            search panel off at the section's bottom edge. Containing only the decorative
            layers keeps the glow in and lets the panels out. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* The brand's texture, carried over from the agent page so the two feel like
              one site. Behind the content and click-through, with the mask fading it out
              at the edges so it never reads as a hard-edged pattern. */}
          <div className="absolute inset-0 grid-texture grid-fade opacity-60" />
          <div
            className="ambient-glow absolute -top-56 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] rounded-full bg-gradient-to-br from-navy/60 via-gold/15 to-transparent blur-[150px]"
            aria-hidden
          />
        </div>

        <div className="relative max-w-site mx-auto px-5 sm:px-8 py-12 sm:py-16 text-center">
          <h1 className="font-heading text-display font-black">
            Find your next place
            <span className="text-gold"> in the Philippines.</span>
          </h1>
          <p className="mt-3.5 text-content/55 text-lede max-w-2xl mx-auto">
            Real properties from local agents — walk through them in 360° and watch the
            video before you spend a Saturday travelling to one.
          </p>

          <div className="mt-8">
            <SearchBar value={draft} onChange={setDraft} onSubmit={search} cities={cities} />
          </div>

          {/* A count, but only once something has been chosen. Showing "12 properties"
              under an untouched search bar states the obvious; showing it after a budget
              has been set answers the question that was just asked. */}
          {touched && listings && (
            <p className="mt-4 text-sm text-content/50">
              {preview === 0 ? (
                'Nothing matches that yet — try widening it.'
              ) : (
                <>
                  <span className="font-bold text-content">{preview}</span>
                  {preview === 1 ? ' property matches' : ' properties match'}
                </>
              )}
            </p>
          )}

          {/* Real cities from the catalogue, so every one of these returns something.
              Two or more, otherwise "popular" is describing a list of one. */}
          {!touched && cities.length > 1 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm">
              <span className="text-content/40">Popular right now</span>
              {cities.slice(0, 5).map((city) => (
                <Link
                  key={city}
                  to={`/browse?q=${encodeURIComponent(city)}`}
                  className="px-3 py-1.5 rounded-full border border-line/15 font-semibold text-content/70 hover:border-gold/50 hover:text-content transition-all"
                >
                  {city}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* The listings carry the texture too, so the grid runs the length of the page
          rather than stopping at the hero and leaving the rest looking like a
          different site. Its own fade, so the seam between the two never shows. */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-texture grid-fade opacity-50" />

        <div className="relative max-w-site mx-auto px-5 sm:px-8 py-12 pb-16">
          {!listings && (
            <p className="text-sm text-content/40 py-16 text-center">Loading properties…</p>
          )}

          {listings && groups.length === 0 && (
            <div className="text-center py-16">
              <h2 className="font-heading text-xl font-black mb-2">
                The first properties are on their way
              </h2>
              <p className="text-sm text-content/45 max-w-sm mx-auto">
                Agents are listing now. Check back shortly — or list yours and be the
                first one here.
              </p>
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

          {listings && listings.length > 0 && (
            <div className="text-center">
              <Link
                to="/browse"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-line/20 text-sm font-bold hover:border-line/40 transition-all"
              >
                Browse all {listings.length} properties
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </section>
    </PublicChrome>
  )
}
