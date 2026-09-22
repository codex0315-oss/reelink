import { useState } from 'react'
import { SlidersHorizontal, X, Compass } from 'lucide-react'
import { FURNISHINGS, SORTS, countActive, type Filters, type SortKey } from '../lib/browse'

/**
 * The filters the search bar does not carry: furnishing, 360° tours, and the order.
 *
 * Where, intent and budget moved into the search capsule, because they are what someone
 * arrives already knowing. What is left is refinement — things you reach for after seeing
 * results — so it sits behind a button instead of taking up the page in advance.
 *
 * The badge counts only what is hidden in the panel. A filter you can read in the search
 * bar does not need announcing; a filter you cannot see is the one that quietly empties
 * the page and has a buyer concluding the site is dead.
 */
export default function FilterBar({
  filters,
  onChange,
  resultCount,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  resultCount: number
}) {
  const [open, setOpen] = useState(false)
  const active = countActive(filters)

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })

  const toggleFurnishing = (value: string) =>
    set({
      furnishings: filters.furnishings.includes(value)
        ? filters.furnishings.filter((f) => f !== value)
        : [...filters.furnishings, value],
    })

  return (
    <div className="mb-8">
      {/* Left-aligned, like the row headings beneath it, so the count reads as the
          first line of the results rather than a caption floating above them. */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-content/50 font-semibold">
          {resultCount} {resultCount === 1 ? 'property' : 'properties'}
        </span>

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border transition-all ${
            active > 0
              ? 'border-gold bg-gold/10 text-gold-dark'
              : 'border-line/15 text-content/70 hover:border-line/35'
          }`}
        >
          <SlidersHorizontal size={14} />
          Filters
          {active > 0 && (
            <span className="w-5 h-5 rounded-full bg-gold text-navy-dark text-[11px] font-black flex items-center justify-center">
              {active}
            </span>
          )}
        </button>

        <select
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as SortKey })}
          aria-label="Sort properties"
          className="px-4 py-2 rounded-full text-sm font-bold border border-line/15 bg-panel text-content/70 outline-none focus:border-gold/50 transition-colors cursor-pointer"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        {active > 0 && (
          <button
            onClick={() => set({ furnishings: [], tourOnly: false })}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-content/45 hover:text-danger transition-colors"
          >
            <X size={13} />
            Clear {active}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 max-w-2xl p-5 rounded-3xl bg-panel border border-line/12 shadow-lg">
          <div className="mb-5">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-content/45 mb-2.5">
              Furnishing
            </div>
            <div className="flex flex-wrap gap-2">
              {FURNISHINGS.map((f) => (
                <Chip
                  key={f.value}
                  on={filters.furnishings.includes(f.value)}
                  onClick={() => toggleFurnishing(f.value)}
                >
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-content/45 mb-2.5">
              Features
            </div>
            {/* The old "360° tours" tab, as what it always was: a property either has a
                tour or it does not, and that composes with buying or renting rather than
                replacing the choice. */}
            <Chip on={filters.tourOnly} onClick={() => set({ tourOnly: !filters.tourOnly })}>
              <Compass size={13} />
              Has a 360° tour
            </Chip>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold border transition-all ${
        on
          ? 'border-gold bg-gold/10 text-gold-dark'
          : 'border-line/15 text-content/60 hover:border-line/35'
      }`}
    >
      {children}
    </button>
  )
}
