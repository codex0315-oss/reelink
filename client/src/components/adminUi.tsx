import { assetUrl } from '../lib/config'

/**
 * The small pieces every admin panel is built from.
 *
 * Pulled out of AdminPage once the dashboard grew past four tabs: the panels live in
 * their own file now, and both need these. Presentational only — nothing here fetches
 * or decides anything.
 */

export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-[11px] font-bold text-ink/45 uppercase tracking-wide mb-2">
        {title}
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string
  value: number | string
  hint: string
  warn?: boolean
}) {
  // A warning tone on a zero would paint "0 suspended" red, which reads as a problem
  // when it is in fact the good outcome.
  const isZero = value === 0 || value === '$0.00' || value === '0%'

  return (
    <div className="bg-card rounded-2xl border border-ink/10 p-4 min-w-0">
      <div
        className={`font-heading text-2xl font-black ${
          warn && !isZero ? 'text-warn' : 'text-ink'
        }`}
      >
        {value}
      </div>
      <div className="text-xs font-bold text-ink mt-1">{label}</div>
      <div className="text-[11px] text-ink/40 mt-0.5">{hint}</div>
    </div>
  )
}

export function Avatar({
  user,
}: {
  user: { name: string; avatarUrl?: string | null }
}) {
  if (user.avatarUrl) {
    return (
      <img
        src={assetUrl(user.avatarUrl)}
        alt=""
        className="w-10 h-10 rounded-full object-cover shrink-0 border border-ink/10"
      />
    )
  }

  return (
    <span className="w-10 h-10 rounded-full bg-ink/10 text-ink/60 flex items-center justify-center text-sm font-black shrink-0">
      {user.name?.[0]?.toUpperCase() ?? 'R'}
    </span>
  )
}

/**
 * Relative time, for things that just happened.
 *
 * An activity feed reading "02/09/2026" for something two minutes old buries the one
 * fact that matters, which is how recent it is. Falls back to a date past a month,
 * where the exact day starts mattering more than the gap.
 */
export function ago(iso: string) {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}
