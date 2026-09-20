import { useEffect, useRef, useState } from 'react'
import { Search, MapPin, Check } from 'lucide-react'
import { INTENTS, intentLabel, type Category, type Filters } from '../lib/browse'

/**
 * The search bar, as one segmented capsule rather than a box and a row of tabs.
 *
 * It replaced a plain input sitting above "All / For sale / For rent / 360° tours". The
 * tabs read as a way to browse, but they were really a filter wearing the wrong clothes —
 * and because they sat apart from the search box, the two could disagree without either
 * one showing it. Folding them in means one control, and the whole of the query is
 * legible in a single glance: where, what for, how much.
 *
 * Three segments because Reelink has three questions worth asking. Airbnb's fourth and
 * fifth — dates and guests — have no counterpart here, and inventing some would be
 * copying the shape of the thing rather than the reason for it.
 *
 * Only one popover is open at a time, and the whole capsule closes on an outside click
 * or Escape, so it never traps a phone's viewport behind an open panel.
 *
 * Note for whoever places this: the panels hang below the bar, so no ancestor may clip
 * its overflow. The hero sections keep `overflow-hidden` on a wrapper around their glow
 * and texture rather than on the section itself, for exactly this reason.
 */
export default function SearchBar({
  value,
  onChange,
  onSubmit,
  cities,
  size = 'large',
}: {
  value: Filters
  onChange: (next: Filters) => void
  onSubmit?: () => void
  /** Real cities from the catalogue — suggestions that always return something. */
  cities: string[]
  /** `large` for the homepage hero, `compact` for the browse page masthead. */
  size?: 'large' | 'compact'
}) {
  const [open, setOpen] = useState<'where' | 'intent' | 'budget' | null>(null)
  const root = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setOpen(null)
    onSubmit?.()
  }

  // Cities matching what has been typed, so the list narrows as you go rather than
  // showing the same twelve suggestions under a half-typed name.
  const typed = value.query.trim().toLowerCase()
  const suggestions = cities
    .filter((c) => !typed || c.toLowerCase().includes(typed))
    .slice(0, 6)

  const pad = size === 'large' ? 'py-3.5' : 'py-2.5'

  return (
    <form
      ref={root}
      onSubmit={submit}
      role="search"
      className={`relative z-20 mx-auto ${size === 'large' ? 'max-w-4xl' : 'max-w-3xl'}`}
    >
      {/* One pill on a desktop, a stack on a phone. Squeezing three segments across a
          360px screen makes all three unreadable, so below `sm` they become rows and the
          dividers turn horizontal — the same control, laid out for the space it has.

          Asymmetric padding on purpose: the segments carry their own px-5, so the text
          sits ~28px in from the left edge, and matching that on the right keeps the
          button seated inside the pill instead of jammed against the tip. */}
      <div className="flex flex-col sm:flex-row sm:items-center rounded-3xl sm:rounded-full bg-panel border border-line/15 shadow-xl shadow-black/10 p-1.5 sm:py-2 sm:pl-2 sm:pr-3 gap-1 sm:gap-0">
        {/* Where. Each segment and its panel share a relatively-positioned wrapper, so
            the panel hangs from the segment it belongs to rather than from the form —
            which is what keeps it under the right field at every width. */}
        <Field className="sm:flex-[1.4]">
          <Segment open={open === 'where'} onOpen={() => setOpen('where')} className={pad} label="Where">
            <input
              value={value.query}
              onChange={(e) => {
                set({ query: e.target.value })
                setOpen('where')
              }}
              onFocus={() => setOpen('where')}
              placeholder="Any city or property"
              aria-label="Search by city or property"
              className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-content/35 placeholder:font-normal"
            />
          </Segment>

          {open === 'where' && suggestions.length > 0 && (
            <Popover title={typed ? 'Matching cities' : 'Cities on Reelink'}>
              {suggestions.map((city) => (
                <Option
                  key={city}
                  selected={value.query.trim().toLowerCase() === city.toLowerCase()}
                  onClick={() => {
                    set({ query: city })
                    setOpen(null)
                  }}
                >
                  <MapPin size={14} className="text-gold-dark shrink-0" />
                  {city}
                </Option>
              ))}
            </Popover>
          )}
        </Field>

        <Divider />

        {/* Looking for */}
        <Field>
          <Segment
            open={open === 'intent'}
            onOpen={() => setOpen(open === 'intent' ? null : 'intent')}
            className={pad}
            label="Looking for"
            button
          >
            <span
              className={`block text-sm truncate ${
                value.category === 'all' ? 'text-content/35' : 'font-semibold'
              }`}
            >
              {value.category === 'all' ? 'Sale or rent' : intentLabel(value.category)}
            </span>
          </Segment>

          {open === 'intent' && (
            <Popover title="I am">
              {INTENTS.map((intent) => (
                <Option
                  key={intent.id}
                  selected={value.category === intent.id}
                  onClick={() => {
                    set({ category: intent.id as Category })
                    setOpen(null)
                  }}
                >
                  <span className="font-bold">{intent.label}</span>
                  <span className="text-content/40 text-xs">{intent.hint}</span>
                </Option>
              ))}
            </Popover>
          )}
        </Field>

        <Divider />

        {/* Budget. Its panel is right-anchored: it is the last segment, and a
            left-anchored panel would hang off the end of the pill. */}
        <Field>
          <Segment
            open={open === 'budget'}
            onOpen={() => setOpen(open === 'budget' ? null : 'budget')}
            className={pad}
            label="Budget"
            button
          >
            <span
              className={`block text-sm truncate ${
                !value.minPrice && !value.maxPrice ? 'text-content/35' : 'font-semibold'
              }`}
            >
              {budgetLabel(value.minPrice, value.maxPrice)}
            </span>
          </Segment>

          {open === 'budget' && (
            <Popover title="Price range" align="right">
              {/* Free entry rather than preset bands: a ₱15,000 rental and a ₱15,000,000
                  house share this control, and no single set of brackets is sensible for
                  both at once. */}
              <div className="flex items-center gap-2.5 px-1 pb-1">
                <PriceInput
                  label="Minimum price"
                  value={value.minPrice}
                  onChange={(v) => set({ minPrice: v })}
                  placeholder="No min"
                />
                <span className="text-content/30 text-sm">—</span>
                <PriceInput
                  label="Maximum price"
                  value={value.maxPrice}
                  onChange={(v) => set({ maxPrice: v })}
                  placeholder="No max"
                />
              </div>
              {(value.minPrice || value.maxPrice) && (
                <button
                  type="button"
                  onClick={() => set({ minPrice: '', maxPrice: '' })}
                  className="mt-2 mx-1 text-xs font-bold text-content/45 hover:text-danger transition-colors"
                >
                  Clear budget
                </button>
              )}
            </Popover>
          )}
        </Field>

        <button
          type="submit"
          aria-label="Search properties"
          className="shrink-0 w-full sm:w-12 h-11 sm:h-12 rounded-full bg-gold text-navy-dark font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-gold-dark transition-all active:scale-95 sm:ml-1"
        >
          <Search size={18} strokeWidth={2.6} />
          <span className="sm:hidden">Search</span>
        </button>
      </div>
    </form>
  )
}

/** A segment and its panel, sharing a positioning context. */
function Field({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={`relative flex sm:flex-1 ${className}`}>{children}</div>
}

/** A label stacked over its control, highlighted while its popover is open. */
function Segment({
  label,
  children,
  open,
  onOpen,
  className = '',
  button = false,
}: {
  label: string
  children: React.ReactNode
  open: boolean
  onOpen: () => void
  className?: string
  button?: boolean
}) {
  const body = (
    <>
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-content/45 mb-0.5">
        {label}
      </div>
      {children}
    </>
  )

  const shell = `flex-1 min-w-0 text-left px-5 rounded-2xl sm:rounded-full transition-colors ${
    open ? 'bg-line/[0.08]' : 'hover:bg-line/[0.05]'
  } ${className}`

  // The `where` segment wraps a real input, so it must not also be a button — a button
  // containing a text field is invalid markup and swallows clicks meant for the caret.
  return button ? (
    <button type="button" onClick={onOpen} className={shell}>
      {body}
    </button>
  ) : (
    <div onClick={onOpen} className={shell}>
      {body}
    </div>
  )
}

function Divider() {
  return <div className="hidden sm:block w-px h-8 bg-line/12 shrink-0" />
}

function Popover({
  title,
  children,
  align = 'left',
}: {
  title: string
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <div
      className={`absolute z-40 top-full mt-3 left-0 right-0 p-3 rounded-3xl bg-panel border border-line/12 shadow-2xl shadow-black/30 sm:w-[320px] ${
        align === 'right' ? 'sm:left-auto sm:right-0' : 'sm:right-auto sm:left-0'
      }`}
    >
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-content/40 px-1 mb-2">
        {title}
      </div>
      {children}
    </div>
  )
}

function Option({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm text-left transition-colors ${
        selected ? 'bg-gold/10 text-gold-dark' : 'hover:bg-line/[0.06]'
      }`}
    >
      {children}
      {selected && <Check size={14} className="ml-auto shrink-0" />}
    </button>
  )
}

function PriceInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative flex-1 min-w-0">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-content/40">₱</span>
      <input
        // inputMode rather than type="number": a numeric keypad on a phone, without the
        // spinners and scroll-to-change that make number inputs awkward to use.
        inputMode="numeric"
        value={value ? Number(value).toLocaleString() : ''}
        aria-label={label}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        placeholder={placeholder}
        className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-line/15 bg-surface text-sm outline-none focus:border-gold/50 transition-colors"
      />
    </div>
  )
}

/** Reads back as a phrase, so a glance at the collapsed bar says what was asked for. */
function budgetLabel(min: string, max: string): string {
  const peso = (v: string) => `₱${Number(v).toLocaleString()}`
  if (min && max) return `${peso(min)} – ${peso(max)}`
  if (max) return `Up to ${peso(max)}`
  if (min) return `${peso(min)} and up`
  return 'Any price'
}
