import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Film,
  Home,
  Star,
  Users2,
  ShieldCheck,
  Check,
} from 'lucide-react'
import {
  fetchAdminActivity,
  fetchAdminTrends,
  fetchAdminHealth,
  fetchAdminAiUsage,
  type ActivityEvent,
  type AdminTrends,
  type AdminHealth,
  type AdminAiUsage,
  fetchFlagged,
  clearFlag,
  type FlaggedListing,
  type FlaggedReel,
} from '../lib/api'
import Sparkline from './Sparkline'
import { Section, Stat, Avatar, ago } from './adminUi'
import { assetUrl } from '../lib/config'

/* ------------------------------------------------------------------ activity */

/** Colour and icon per kind, so the feed is scannable without reading every line. */
const KIND: Record<string, { tint: string; icon: typeof Users2 }> = {
  signup: { tint: 'text-gold bg-gold/10', icon: Users2 },
  listing: { tint: 'text-sky-500 bg-sky-500/10', icon: Home },
  reel: { tint: 'text-emerald-500 bg-emerald-500/10', icon: Film },
  'reel-failed': { tint: 'text-danger bg-red-500/10', icon: AlertTriangle },
  verification: { tint: 'text-violet-500 bg-violet-500/10', icon: BadgeCheck },
  feedback: { tint: 'text-amber-500 bg-amber-500/10', icon: Star },
}

export function Activity({ token }: { token: string }) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminActivity(token)
      .then(setEvents)
      .catch((e: Error) => setError(e.message))
  }, [token])

  if (error) return <p className="text-sm text-danger py-10 text-center">{error}</p>
  if (!events) return <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>

  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="font-bold text-ink text-sm">Nothing has happened yet</p>
        <p className="text-xs text-ink/50 mt-1">
          Signups, listings, reels and feedback all appear here as they happen.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-2xl border border-ink/10 divide-y divide-ink/5">
      {events.map((e) => {
        const style = KIND[e.kind] ?? KIND.signup
        const Icon = style.icon
        return (
          <div key={e.id} className="flex items-start gap-3 p-3.5">
            <span
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.tint}`}
            >
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink leading-snug">
                <span className="font-bold">{e.who}</span> {e.what}
              </p>
              <p className="text-[11px] text-ink/40 mt-0.5">{ago(e.at)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------- trends */

export function Trends({ token }: { token: string }) {
  const [data, setData] = useState<AdminTrends | null>(null)
  const [days, setDays] = useState(14)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    fetchAdminTrends(token, days)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [token, days])

  if (error) return <p className="text-sm text-danger py-10 text-center">{error}</p>

  const charts: [string, { date: string; count: number }[], string][] = data
    ? [
        ['Signups', data.signups, 'text-gold'],
        ['Listings', data.listings, 'text-sky-500'],
        ['Reels started', data.reels, 'text-emerald-500'],
        ['Failed renders', data.failures, 'text-danger'],
        ['Listing views', data.views, 'text-violet-500'],
      ]
    : []

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              days === d
                ? 'bg-gold text-navy-dark'
                : 'bg-ink/5 text-ink/50 hover:text-ink'
            }`}
          >
            {d} days
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {charts.map(([label, series, tone]) => {
            const points = series.map((p) => p.count)
            const total = points.reduce((a, b) => a + b, 0)
            return (
              <div key={label} className="bg-card rounded-2xl border border-ink/10 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-ink">{label}</span>
                  <span className="font-heading text-xl font-black text-ink">{total}</span>
                </div>
                <div className="text-[11px] text-ink/40 mb-2">over {days} days</div>
                <Sparkline
                  points={points}
                  className={tone}
                  ariaLabel={`${label}: ${total} over ${days} days`}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- health */

function ConfigRow({
  label,
  value,
  ok,
}: {
  label: string
  value?: string
  ok?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-ink/70 shrink-0">{label}</span>
      {value !== undefined ? (
        <span className="text-sm font-bold text-ink truncate">{value}</span>
      ) : (
        <span
          className={`text-xs font-bold px-2 py-1 rounded-lg shrink-0 ${
            ok ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-danger'
          }`}
        >
          {ok ? 'set' : 'missing'}
        </span>
      )}
    </div>
  )
}

export function Health({ token }: { token: string }) {
  const [h, setH] = useState<AdminHealth | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminHealth(token)
      .then(setH)
      .catch((e: Error) => setError(e.message))
  }, [token])

  if (error) return <p className="text-sm text-danger py-10 text-center">{error}</p>
  if (!h) return <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>

  // Past this, the problem is the renderer rather than any one reel.
  const rateIsBad = h.reels.failureRate !== null && h.reels.failureRate >= 20
  const attempted = h.reels.failed + h.reels.done

  return (
    <div className="space-y-5">
      <Section title="Rendering">
        <Stat
          label="Failure rate"
          value={h.reels.failureRate === null ? '—' : `${h.reels.failureRate}%`}
          hint={`${h.reels.failed} failed of ${attempted}`}
          warn={rateIsBad}
        />
        <Stat label="In progress" value={h.reels.processing} hint="rendering now" />
        <Stat
          label="Stuck"
          value={h.reels.stuck}
          hint="over a day in progress"
          warn
        />
      </Section>

      <section>
        <h2 className="text-[11px] font-bold text-ink/45 uppercase tracking-wide mb-2">
          Configuration
        </h2>
        {/* Read from the environment the API is actually running with, so this is what
            is live rather than what the repository defaults to. */}
        <div className="bg-card rounded-2xl border border-ink/10 divide-y divide-ink/5">
          <ConfigRow label="Renderer" value={h.config.renderer} />
          <ConfigRow label="File storage" value={h.config.storage} />
          <ConfigRow label="Cloud render key" ok={h.config.cloudRenderKey} />
          <ConfigRow label="Cinematic key" ok={h.config.cinematicKey} />
          <ConfigRow label="AI text key" ok={h.config.groqKey} />
        </div>
      </section>

      {h.recentFailures.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold text-ink/45 uppercase tracking-wide mb-2">
            Failures in the last 24 hours
          </h2>
          <div className="bg-card rounded-2xl border border-ink/10 divide-y divide-ink/5">
            {h.recentFailures.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-3.5">
                <AlertTriangle size={15} className="text-danger shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">
                    <span className="font-bold">{f.who}</span>
                    {f.listing ? ` — ${f.listing}` : ''}
                  </p>
                  <p className="text-[11px] text-ink/40">{ago(f.at)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ ai usage */

export function AiUsage({ token }: { token: string }) {
  const [u, setU] = useState<AdminAiUsage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminAiUsage(token)
      .then(setU)
      .catch((e: Error) => setError(e.message))
  }, [token])

  if (error) return <p className="text-sm text-danger py-10 text-center">{error}</p>
  if (!u) return <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>

  return (
    <div className="space-y-5">
      <Section title="Cinematic clips — billed per clip">
        <Stat label="This week" value={u.cinematic.thisWeek} hint="clips generated" />
        <Stat label="All time" value={u.cinematic.total} hint="clips generated" />
        <Stat
          label="Estimated cost"
          value={`$${u.cinematic.estimatedUsdThisWeek.toFixed(2)}`}
          hint="this week"
          warn
        />
      </Section>

      <Section title="Cloud renders — billed per second">
        <Stat label="This week" value={u.cloudRenders.thisWeek} hint="reels finished" />
        <Stat label="All time" value={u.cloudRenders.total} hint="reels finished" />
        <Stat
          label="Estimated credits"
          value={u.cloudRenders.estimatedCreditsThisWeek}
          hint="this week, at ~14s a reel"
        />
      </Section>

      <Section title="Amicus AI — free tier">
        <Stat label="Today" value={u.amicus.today} hint="questions asked" />
        <Stat label="This week" value={u.amicus.thisWeek} hint="questions asked" />
        <Stat label="All time" value={u.amicus.total} hint="questions asked" />
      </Section>

      {u.heaviestUsers.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold text-ink/45 uppercase tracking-wide mb-2">
            Heaviest render users this week
          </h2>
          <div className="bg-card rounded-2xl border border-ink/10 divide-y divide-ink/5">
            {u.heaviestUsers.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink truncate">{h.name}</div>
                  <div className="text-xs text-ink/45 truncate">{h.email}</div>
                </div>
                <span className="text-sm font-black text-ink shrink-0">{h.renders}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] text-ink/40 leading-relaxed">
        Costs are estimated from published credit prices, not read from invoices.
        Written copy and Amicus run on a free tier today, so those are shown as volume —
        what matters there is whether usage is nearing a limit, not a bill.
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- flagged */

/**
 * What the automated check hid, waiting on a person.
 *
 * Shows the model's reason and the photos side by side, because the reason on its own
 * is not enough to judge by — the whole point of a human step is that they look at the
 * thing. Disputes come first: an agent who has said "this is genuine" is blocked on
 * staff, while one who has said nothing may simply have posted a car.
 */
export function Flagged({ token }: { token: string }) {
  const [data, setData] = useState<{
    listings: FlaggedListing[]
    reels: FlaggedReel[]
  } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetchFlagged(token)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [token])

  useEffect(load, [load])

  async function clear(kind: 'listing' | 'reel', id: string) {
    setBusy(id)
    setError('')
    try {
      await clearFlag(token, kind, id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear that flag')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="text-sm text-danger py-10 text-center">{error}</p>
  if (!data) return <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>

  const total = data.listings.length + data.reels.length
  if (total === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-xl bg-ink/5 mx-auto mb-3 flex items-center justify-center">
          <ShieldCheck size={20} className="text-ink/25" />
        </div>
        <p className="font-bold text-ink text-sm">Nothing waiting</p>
        <p className="text-xs text-ink/50 mt-1">
          Listings and reels the automated check hides appear here for you to decide on.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink/50 leading-relaxed bg-card rounded-2xl border border-ink/10 p-4">
        These are hidden from buyers. The check is deliberately cautious and does get it
        wrong — vacant lots and unfinished builds are the usual false alarms. Clearing
        one puts it back and stops it ever being checked again. To take something down
        for good, open the agent under Users and remove it there.
      </p>

      {data.listings.map((l) => (
        <FlaggedCard
          key={l.id}
          title={l.title}
          subtitle={`₱${l.price.toLocaleString()}`}
          photos={l.photoUrls}
          item={l}
          busy={busy === l.id}
          onClear={() => clear('listing', l.id)}
        />
      ))}

      {data.reels.map((r) => (
        <FlaggedCard
          key={r.id}
          title={r.title ?? 'Untitled reel'}
          subtitle="Quick reel"
          photos={r.photoUrls}
          item={r}
          busy={busy === r.id}
          onClear={() => clear('reel', r.id)}
        />
      ))}
    </div>
  )
}

function FlaggedCard({
  title,
  subtitle,
  photos,
  item,
  busy,
  onClear,
}: {
  title: string
  subtitle: string
  photos: string[]
  item: FlaggedListing | FlaggedReel
  busy: boolean
  onClear: () => void
}) {
  const disputed = item.moderationStatus === 'appealed'

  return (
    <div className="bg-card rounded-2xl border border-ink/10 p-4">
      <div className="flex items-start gap-3">
        <Avatar user={item.user} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-ink text-sm">{title}</span>
            {disputed && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-gold/15 text-gold-dark">
                Disputed
              </span>
            )}
          </div>
          <div className="text-xs text-ink/50">
            {subtitle} · {item.user.name} · {item.moderatedAt ? ago(item.moderatedAt) : ''}
          </div>
        </div>
        <button
          onClick={onClear}
          disabled={busy}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-navy-dark text-xs font-bold hover:bg-gold-dark transition-all disabled:opacity-50"
        >
          <Check size={13} />
          Allow it
        </button>
      </div>

      {photos.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide">
          {photos.slice(0, 6).map((url) => (
            <img
              key={url}
              src={assetUrl(url)}
              alt=""
              className="w-24 h-24 rounded-xl object-cover shrink-0 border border-ink/10"
            />
          ))}
        </div>
      )}

      {item.moderationReason && (
        <p className="text-xs text-ink/70 mt-3 px-3 py-2 rounded-lg bg-ink/5">
          <span className="font-bold">The check said:</span> {item.moderationReason}
        </p>
      )}

      {item.moderationNote && (
        <p className="text-xs text-ink/70 mt-2 px-3 py-2 rounded-lg bg-gold/10 border border-gold/20">
          <span className="font-bold">{item.user.name} says:</span> {item.moderationNote}
        </p>
      )}
    </div>
  )
}
