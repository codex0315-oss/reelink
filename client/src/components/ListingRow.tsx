import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import PropertyCard, { type BrowseListing } from './PropertyCard'

/**
 * A sideways shelf of properties.
 *
 * Rows rather than a grid, because of how each fails when there is little to show. A
 * six-column grid holding three cards leaves three visible holes and reads as a broken
 * page; a row holding three cards simply ends, and reads as a short shelf. With a small
 * catalogue that difference is the difference between looking new and looking dead.
 *
 * The arrows appear only when there is something to scroll to, so a short row carries
 * no controls suggesting more exists just out of frame.
 */
export default function ListingRow({
  title,
  listings,
  onOpen,
}: {
  title: string
  listings: BrowseListing[]
  onOpen: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const measure = () => {
    const el = scroller.current
    if (!el) return
    setAtStart(el.scrollLeft <= 4)
    // A pixel of slack: sub-pixel widths mean scrollLeft rarely lands exactly on the end.
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4)
  }

  useEffect(() => {
    measure()
    const el = scroller.current
    if (!el) return
    // Also on resize: a row that fits on a desktop overflows on a narrow window, and
    // the arrows have to appear when that happens rather than only on first paint.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [listings.length])

  const scroll = (direction: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  if (listings.length === 0) return null

  const scrollable = !atStart || !atEnd

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg sm:text-xl font-black tracking-tight">{title}</h2>

        {scrollable && (
          <div className="hidden sm:flex items-center gap-1.5">
            <button
              onClick={() => scroll(-1)}
              disabled={atStart}
              aria-label={`Scroll ${title} left`}
              className="w-8 h-8 rounded-full border border-line/20 flex items-center justify-center text-content/60 hover:text-content hover:border-line/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => scroll(1)}
              disabled={atEnd}
              aria-label={`Scroll ${title} right`}
              className="w-8 h-8 rounded-full border border-line/20 flex items-center justify-center text-content/60 hover:text-content hover:border-line/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Fixed-width cards in a scroller, so one card and six both look intentional —
          stretching a short row to fill the width is what makes it look like a mistake. */}
      <div
        ref={scroller}
        onScroll={measure}
        className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-1 px-1 pb-1"
      >
        {listings.map((listing) => (
          <div
            key={listing.id}
            className="w-[min(72vw,220px)] sm:w-[clamp(220px,14vw,300px)] shrink-0 snap-start"
          >
            <PropertyCard listing={listing} onClick={() => onOpen(listing.id)} />
          </div>
        ))}
      </div>
    </section>
  )
}
