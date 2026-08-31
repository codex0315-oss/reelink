import {
  Plus,
  Clapperboard,
  ImageIcon,
  AlertTriangle,
  Check,
  Download,
  ArrowRight,
  PlayCircle,
  Sparkles,
  ChevronDown,
  MessageSquare,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { assetUrl } from '../lib/config'
import { fetchViewStats } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useMessages } from '../context/MessagesContext'
import Sparkline from './Sparkline'
import BubbleClearance from './BubbleClearance'

type Listing = {
  id: string
  title: string
  price: number
  photoUrls: string[]
}

type Reel = {
  id: string
  listingId: string | null
  videoUrl?: string
  status: string
  createdAt: string
  title?: string
  price?: number
  listing?: { id: string; title: string; price: number; listingType: string }
}

type Props = {
  userName?: string
  listings: Listing[]
  reels: Reel[]
  downloadingReel: string | null
  onNewListing: () => void
  onNewReel: () => void
  onGenerateReelFor: (listingId: string) => void
  // Takes an id rather than the object, so this component's minimal Listing shape
  // doesn't have to match the page's fuller one.
  onEditListing: (listingId: string) => void
  onDownloadReel: (reelId: string) => void
  onGoToListings: () => void
  onGoToReels: () => void
  onGoToMessages?: () => void
}

/**
 * Greets by the agent's own clock.
 *
 * Read from the browser rather than the server: an agent in Cebu should be told "Good
 * evening" at 7pm their time regardless of where the API happens to be hosted, and
 * `getHours()` is already local.
 *
 * Boundaries are the conventional ones — noon and 6pm — with everything from 6pm until
 * 5am counted as evening, so a late-night session is not greeted with "Good morning".
 */
function greetingForNow() {
  const hour = new Date().getHours();

  // Midnight to 5am is still "evening" to anyone awake in it, and it has to be tested
  // first — otherwise those hours fall past the morning branch into the afternoon one.
  if (hour < 5) return { text: 'Good evening', emoji: '🌙' };
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' };
  if (hour < 18) return { text: 'Good afternoon', emoji: '👋' };
  return { text: 'Good evening', emoji: '🌙' };
}

type ViewStats = {
  series: { date: string; count: number }[]
  total: number
  recent: number
  previous: number
  trendPct: number | null
}

/**
 * Loads the view trend once per mount.
 *
 * Not polled: views change slowly and a dashboard left open on a phone should not wake
 * the radio every thirty seconds. The counts that *do* move minute to minute — renders
 * finishing, messages arriving — already arrive over the socket the app keeps open.
 */
function useViewStats() {
  const { token } = useAuth()
  const [stats, setStats] = useState<ViewStats | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetchViewStats(token)
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => undefined) // the card falls back to zero rather than erroring
    return () => {
      cancelled = true
    }
  }, [token])

  return stats
}

/**
 * Buyers waiting on a reply.
 *
 * Reads the conversations the app already keeps in context, so it updates the moment a
 * message lands over the socket — no extra request, no polling, and it disappears by
 * itself once the agent has read everything. Rendering nothing when the inbox is clear
 * is deliberate: a permanent "0 unread" panel is a row of furniture, not information.
 */
function UnreadEnquiries({ onGoToMessages }: { onGoToMessages?: () => void }) {
  const { conversations } = useMessages()
  const waiting = conversations.filter((c) => c.unreadCount > 0)

  if (waiting.length === 0) return null

  const total = waiting.reduce((n, c) => n + c.unreadCount, 0)

  return (
    <div className="mb-6 rounded-2xl border border-gold/30 bg-gold/[0.07] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 shrink-0 rounded-lg bg-gold/20 flex items-center justify-center">
            <MessageSquare size={15} className="text-gold-dark" />
          </span>
          <h2 className="font-heading font-bold text-sm text-ink truncate">
            {total} unread {total === 1 ? 'message' : 'messages'}
          </h2>
        </div>
        {onGoToMessages && (
          <button
            onClick={onGoToMessages}
            className="inline-flex items-center gap-1 shrink-0 text-xs font-bold text-gold-dark hover:underline"
          >
            Open inbox
            <ArrowRight size={12} />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {waiting.slice(0, 3).map((c) => (
          <button
            key={c.id}
            onClick={onGoToMessages}
            className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg hover:bg-gold/10 transition-colors"
          >
            <span className="font-bold text-ink text-xs truncate">{c.otherUser.name}</span>
            {c.listing && (
              <span className="text-[11px] text-ink/45 truncate hidden sm:inline">
                {c.listing.title}
              </span>
            )}
            <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-navy-dark text-[10px] font-extrabold flex items-center justify-center">
              {c.unreadCount}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Says what the number means, and only claims a trend when there is one to claim. */
function viewsHint(views: ViewStats | null) {
  if (!views || views.total === 0) return 'no views yet'
  if (views.trendPct === null) return 'in the last 7 days'
  if (views.trendPct === 0) return 'level with last week'
  return `${views.trendPct > 0 ? 'up' : 'down'} ${Math.abs(views.trendPct)}% on last week`
}

export default function DashboardOverview({
  userName,
  listings,
  reels,
  downloadingReel,
  onNewListing,
  onNewReel,
  onGenerateReelFor,
  onEditListing,
  onDownloadReel,
  onGoToListings,
  onGoToReels,
  onGoToMessages,
}: Props) {
  const greeting = greetingForNow()
  const views = useViewStats()

  // Everything below is derived from data already on screen, so no figure is invented.
  const readyReels = reels.filter((r) => r.status === 'done' && r.videoUrl)
  const renderingReels = reels.filter((r) => r.status === 'processing')
  const failedReels = reels.filter((r) => r.status === 'failed')
  const listingsWithoutPhotos = listings.filter((l) => l.photoUrls.length === 0)
  const listedIdsWithReels = new Set(reels.map((r) => r.listingId).filter(Boolean))
  const listingsWithoutReels = listings.filter(
    (l) => l.photoUrls.length > 0 && !listedIdsWithReels.has(l.id),
  )

  // A reel can be made without a listing (the AI quick-create flow), so these are
  // written as independent milestones rather than a strict sequence — otherwise a
  // standalone reel ticks "generate a reel" while "create a listing" sits unchecked.
  const steps = [
    { label: 'Add a property listing', done: listings.length > 0 },
    { label: 'Upload property photos', done: listings.some((l) => l.photoUrls.length > 0) },
    { label: 'Generate a reel', done: reels.length > 0 },
    { label: 'Get a reel ready to post', done: readyReels.length > 0 },
  ]
  const stepsDone = steps.filter((s) => s.done).length
  const onboarding = stepsDone < steps.length

  return (
    <div>
      {/* ------------------------------------------------ greeting + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <h1 className="font-heading text-2xl font-black text-ink">
            {greeting.text}
            {userName ? `, ${userName.split(' ')[0]}` : ''} {greeting.emoji}
          </h1>
          <p className="text-ink/50 text-sm mt-1">{nextStepLine(steps, readyReels.length)}</p>
        </div>
        <div className="flex gap-2.5 shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none">
          <button
            onClick={onNewListing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-bold hover:bg-gold-dark transition-all active:scale-95"
          >
            <Plus size={16} />
            New listing
          </button>
          <button
            onClick={onNewReel}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ink text-app text-sm font-bold hover:bg-ink/85 transition-all active:scale-95"
          >
            <Clapperboard size={16} />
            New reel
          </button>
        </div>
      </div>

      {/* --------------------------------------------------- getting started */}
      {onboarding && (
        <div className="mb-6 p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-navy-dark to-navy text-white relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full bg-gold/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-gold" />
                <h2 className="font-heading font-bold text-sm">Get your first reel live</h2>
              </div>
              <span className="text-xs font-bold text-gold">
                {stepsDone} of {steps.length}
              </span>
            </div>

            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-5">
              <div
                className="h-full bg-gold rounded-full transition-all duration-500"
                style={{ width: `${(stepsDone / steps.length) * 100}%` }}
              />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {steps.map((step) => (
                <div
                  key={step.label}
                  className={`flex items-center gap-2.5 text-xs font-semibold ${
                    step.done ? 'text-white/50' : 'text-white'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                      step.done
                        ? 'bg-gold border-gold text-navy-dark'
                        : 'border-white/25 text-white/30'
                    }`}
                  >
                    {step.done ? <Check size={11} strokeWidth={3} /> : '•'}
                  </span>
                  <span className={step.done ? 'line-through' : ''}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- metrics */}
      {/* Order matters on a phone, where only the first two are above the fold: views
          answers "is anyone looking?", which is the question an agent opens this for.
          Cards that lead somewhere are buttons; the rest stay plain. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard
          label="Property views"
          value={views?.recent ?? 0}
          hint={viewsHint(views)}
          accent
          trend={views?.series.map((d) => d.count)}
          onClick={listings.length > 0 ? onGoToListings : undefined}
        />
        <StatCard
          label="Reels ready"
          value={readyReels.length}
          hint="finished and exportable"
          onClick={readyReels.length > 0 ? onGoToReels : undefined}
        />
        <StatCard
          label="Listings"
          value={listings.length}
          hint="properties you've added"
          onClick={listings.length > 0 ? onGoToListings : undefined}
        />
        <StatCard
          label={renderingReels.length ? 'Rendering now' : 'Needs photos'}
          value={renderingReels.length || listingsWithoutPhotos.length}
          hint={renderingReels.length ? 'still generating' : "can't make a reel yet"}
          warn={!renderingReels.length && listingsWithoutPhotos.length > 0}
          onClick={renderingReels.length ? onGoToReels : undefined}
        />
      </div>

      {/* Unread enquiries jump above everything else on a phone: a buyer waiting on a
          reply is more urgent than a listing missing photos, and on a small screen only
          the first panel is realistically seen without scrolling. */}
      <UnreadEnquiries onGoToMessages={onGoToMessages} />

      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6">
        {/* --------------------------------------------- needs attention */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Panel
            title="Needs attention"
            action={
              listings.length > 0 ? { label: 'All listings', onClick: onGoToListings } : undefined
            }
          >
            {listingsWithoutPhotos.length === 0 &&
            listingsWithoutReels.length === 0 &&
            failedReels.length === 0 ? (
              <div className="flex items-center gap-3 py-6 px-1">
                <span className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                  <Check size={16} className="text-success" />
                </span>
                <div>
                  <div className="text-sm font-bold text-ink">
                    {listings.length === 0 ? 'Nothing to act on yet' : "You're all caught up"}
                  </div>
                  <p className="text-xs text-ink/50 mt-0.5">
                    {listings.length === 0
                      ? 'Add a property listing and anything needing your attention will show up here.'
                      : 'Every listing has photos and a reel. Nothing is waiting on you.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-ink/5">
                {failedReels.length > 0 && (
                  <AttentionRow
                    tone="danger"
                    icon={AlertTriangle}
                    title={`${failedReels.length} reel${failedReels.length > 1 ? 's' : ''} failed to render`}
                    body="Something went wrong during generation. Try again."
                    actionLabel="Go to Reels"
                    onAction={onGoToReels}
                  />
                )}
                {listingsWithoutPhotos.map((l) => (
                  <AttentionRow
                    key={l.id}
                    tone="warn"
                    icon={ImageIcon}
                    title={l.title}
                    body="No photos yet — a reel can't be generated without them."
                    actionLabel="Add photos"
                    onAction={() => onEditListing(l.id)}
                  />
                ))}
                {listingsWithoutReels.map((l) => (
                  <AttentionRow
                    key={l.id}
                    tone="info"
                    icon={Clapperboard}
                    title={l.title}
                    body="Has photos but no reel yet."
                    actionLabel="Generate reel"
                    onAction={() => onGenerateReelFor(l.id)}
                  />
                ))}
              </div>
            )}
          </Panel>

          {/* ------------------------------------------ recent listings */}
          <Panel
            title="Recent listings"
            action={
              listings.length > 0 ? { label: 'View all', onClick: onGoToListings } : undefined
            }
          >
            {listings.length === 0 ? (
              <EmptyRow
                icon={ImageIcon}
                title="No listings yet"
                body="Add your first property to start generating reels."
                actionLabel="Create a listing"
                onAction={onNewListing}
              />
            ) : (
              <div className="divide-y divide-ink/5">
                {listings.slice(0, 4).map((listing) => (
                  // flex-wrap plus a full-width action group: on a phone the two buttons
                  // needed ~170px of a ~296px row, which left the title with about four
                  // characters. They now drop to their own line instead of starving it,
                  // and sit back inline from sm: up where the width exists.
                  <div
                    key={listing.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 px-2 -mx-2 rounded-xl hover:bg-ink/[0.04] transition-colors group"
                  >
                    {listing.photoUrls[0] ? (
                      <img
                        src={assetUrl(listing.photoUrls[0])}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-ink/5 flex items-center justify-center shrink-0">
                        <ImageIcon size={16} className="text-ink/25" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-ink truncate">
                        {listing.title}
                      </div>
                      <div className="text-gold-dark font-bold text-sm">
                        ₱{Number(listing.price).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                      <button
                        onClick={() => onEditListing(listing.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink/60 hover:bg-ink/5 border border-ink/10 sm:border-transparent transition-all"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onGenerateReelFor(listing.id)}
                        disabled={listing.photoUrls.length === 0}
                        title={
                          listing.photoUrls.length === 0
                            ? 'Add a photo first'
                            : 'Generate a reel from this listing'
                        }
                        className="px-3 py-1.5 rounded-lg bg-ink text-app text-xs font-bold hover:bg-ink/85 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Generate reel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ------------------------------------------------- recent reels */}
        <Panel
          title="Your reels"
          collapsible
          badge={reels.length || null}
          action={reels.length > 0 ? { label: 'View all', onClick: onGoToReels } : undefined}
        >
          {reels.length === 0 ? (
            <EmptyRow
              icon={PlayCircle}
              title="No reels yet"
              body="Turn a listing into a narrated video."
              actionLabel="Create a reel"
              onAction={onNewReel}
            />
          ) : (
            <div className="space-y-3">
              {reels.slice(0, 3).map((reel) => {
                const label = reel.listing?.title ?? reel.title ?? 'Untitled reel'
                const ready = reel.status === 'done' && reel.videoUrl
                return (
                  <div
                    key={reel.id}
                    className="flex items-center gap-3 p-2 -m-2 rounded-xl hover:bg-ink/[0.04] transition-colors"
                  >
                    <div className="w-12 h-[68px] rounded-lg overflow-hidden bg-ink/5 shrink-0 flex items-center justify-center">
                      {ready ? (
                        <video
                          src={assetUrl(reel.videoUrl)}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : reel.status === 'processing' ? (
                        <div className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <AlertTriangle size={14} className="text-red-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-ink truncate">{label}</div>
                      <div className="text-[11px] text-ink/45 mt-0.5">
                        {ready
                          ? 'Ready to post'
                          : reel.status === 'processing'
                            ? 'Generating…'
                            : 'Failed'}
                      </div>
                    </div>
                    <button
                      onClick={() => onDownloadReel(reel.id)}
                      disabled={!ready || downloadingReel === reel.id}
                      title="Export video"
                      className="w-8 h-8 rounded-lg bg-ink/5 hover:bg-gold hover:text-navy-dark text-ink/60 flex items-center justify-center transition-all disabled:opacity-30 shrink-0"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <BubbleClearance />
    </div>
  )
}

/** One sentence telling the user the single most useful next action. */
function nextStepLine(steps: { label: string; done: boolean }[], readyCount: number) {
  const firstUndone = steps.find((s) => !s.done)
  if (!firstUndone) {
    return `You have ${readyCount} reel${readyCount === 1 ? '' : 's'} ready to post to Facebook.`
  }
  return `Next up: ${firstUndone.label.toLowerCase()}.`
}

/**
 * A single figure, and — when there is somewhere sensible to go — a way in.
 *
 * Rendered as a button only when `onClick` is given, so a card that leads nowhere never
 * offers a pointer or a press state it cannot honour. That is also why the whole card is
 * the target rather than a small link inside it: on a phone the entire tile is a
 * comfortable tap.
 */
function StatCard({
  label,
  value,
  hint,
  accent,
  warn,
  trend,
  onClick,
}: {
  label: string
  value: number
  hint: string
  accent?: boolean
  warn?: boolean
  /** Daily counts, oldest first. Drawn only when there is something to show. */
  trend?: number[]
  onClick?: () => void
}) {
  const tone =
    warn && value > 0 ? 'text-warn' : accent && value > 0 ? 'text-gold-dark' : 'text-ink'

  const body = (
    <>
      <div className={`font-heading text-2xl font-black ${tone}`}>{value}</div>
      <div className="text-xs text-ink font-bold mt-1">{label}</div>
      <div className="text-[11px] text-ink/40 mt-0.5">{hint}</div>
      {trend && trend.some((n) => n > 0) && (
        <div className={`mt-2.5 ${accent ? 'text-gold-dark' : 'text-ink/45'}`}>
          <Sparkline points={trend} ariaLabel={`${label} over the last ${trend.length} days`} />
        </div>
      )}
    </>
  )

  // min-w-0 for the same reason <main> needs it: a grid track is min-width:auto by
  // default, so a card that cannot shrink widens its column and pushes the whole grid
  // past the screen.
  const shell = 'bg-card rounded-2xl border border-ink/10 p-4 sm:p-5 text-left min-w-0'

  if (!onClick) return <div className={shell}>{body}</div>

  return (
    <button
      onClick={onClick}
      className={`${shell} w-full transition-all hover:border-gold/50 hover:shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50`}
    >
      {body}
    </button>
  )
}

/**
 * A dashboard section, collapsible on small screens.
 *
 * `collapsible` panels start closed on a phone and their contents are not rendered at
 * all until opened — so a secondary section costs no images, no video thumbnails and no
 * layout work on the device least able to afford them. From `sm:` up the toggle
 * disappears and everything is simply open, because there the width is not scarce.
 *
 * `badge` puts the useful part of a closed panel on its header, so collapsing hides the
 * detail without hiding the fact that there is something to look at.
 */
function Panel({
  title,
  action,
  collapsible,
  badge,
  children,
}: {
  title: string
  action?: { label: string; onClick: () => void }
  collapsible?: boolean
  badge?: string | number | null
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-card rounded-2xl border border-ink/10 p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        {collapsible ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="sm:pointer-events-none flex items-center gap-2 min-w-0 group"
          >
            <h2 className="font-heading font-bold text-sm text-ink truncate">{title}</h2>
            {badge != null && badge !== 0 && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-gold/20 text-gold-dark text-[10px] font-extrabold">
                {badge}
              </span>
            )}
            <ChevronDown
              size={15}
              className={`sm:hidden shrink-0 text-ink/40 transition-transform ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>
        ) : (
          <h2 className="font-heading font-bold text-sm text-ink truncate">{title}</h2>
        )}

        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex items-center gap-1 shrink-0 text-xs font-semibold text-ink/50 hover:text-gold-dark transition-colors"
          >
            {action.label}
            <ArrowRight size={12} />
          </button>
        )}
      </div>

      {/* `hidden sm:block` rather than unmounting: the children stay mounted on desktop
          where they are always visible, and on mobile the wrapper is display:none, so
          nothing inside it lays out or fetches until it is opened. */}
      <div className={collapsible && !open ? 'hidden sm:block' : ''}>{children}</div>
    </div>
  )
}

function AttentionRow({
  tone,
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  tone: 'danger' | 'warn' | 'info'
  icon: typeof ImageIcon
  title: string
  body: string
  actionLabel: string
  onAction: () => void
}) {
  const tones = {
    danger: 'bg-red-500/10 border-red-500/25 text-danger',
    warn: 'bg-amber-500/10 border-amber-500/25 text-warn',
    info: 'bg-ink/5 border-ink/10 text-ink/60',
  }
  return (
    // Wraps for the same reason as the listing rows above: the action button was
    // squeezing the message into three lines on a phone.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 px-2 -mx-2 rounded-xl hover:bg-ink/[0.04] transition-colors">
      <span
        className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${tones[tone]}`}
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink truncate">{title}</div>
        <p className="text-xs text-ink/50 mt-0.5">{body}</p>
      </div>
      <button
        onClick={onAction}
        className="px-3 py-1.5 rounded-lg text-xs font-bold text-ink bg-ink/5 hover:bg-gold hover:text-navy-dark transition-all active:scale-95 shrink-0 w-full sm:w-auto"
      >
        {actionLabel}
      </button>
    </div>
  )
}

function EmptyRow({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: typeof ImageIcon
  title: string
  body: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="text-center py-8">
      <div className="w-11 h-11 rounded-xl bg-gold/10 border border-gold/20 mx-auto mb-3 flex items-center justify-center">
        <Icon size={18} className="text-gold-dark" />
      </div>
      <div className="font-bold text-sm text-ink">{title}</div>
      <p className="text-xs text-ink/50 mt-1 mb-4">{body}</p>
      <button
        onClick={onAction}
        className="px-4 py-2 rounded-lg bg-ink text-app text-xs font-bold hover:bg-ink/85 transition-all active:scale-95"
      >
        {actionLabel}
      </button>
    </div>
  )
}
