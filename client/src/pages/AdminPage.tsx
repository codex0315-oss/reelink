import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Ban, Check, Search, ShieldCheck, Star, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  fetchAdminMetrics,
  fetchAdminUsers,
  fetchVerifications,
  reviewVerification,
  setUserSuspension,
  fetchAllFeedback,
  setFeedbackPublished,
  type AdminMetrics,
  type AdminUser,
  type AdminFeedback,
  type VerificationRequest,
} from '../lib/api'
import { Section, Stat, Avatar } from '../components/adminUi'
import { Activity, Trends, Health, AiUsage, Flagged } from '../components/AdminPanels'
import ReasonDialog from '../components/ReasonDialog'
import UserDetail from '../components/UserDetail'

type Tab =
  | 'overview'
  | 'activity'
  | 'trends'
  | 'health'
  | 'ai'
  | 'flagged'
  | 'verifications'
  | 'feedback'
  | 'users'

/**
 * Staff tooling, on its own route rather than inside the agent dashboard.
 *
 * The role check here only decides what to render — every endpoint behind it re-checks
 * server-side, so a user who edits their own profile object in memory gains nothing but
 * an empty screen. It answers "page not found" rather than "forbidden" for the same
 * reason the guard does: confirming that an admin area exists is free reconnaissance.
 */
export default function AdminPage() {
  const { user, token, loading } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  if (loading) return null

  if (!user || !token || user.role !== 'admin') {
    return (
      <div className="min-h-[100dvh] bg-app flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-ink/5 mx-auto mb-3 flex items-center justify-center">
            <ShieldCheck size={20} className="text-ink/25" />
          </div>
          <p className="font-bold text-ink text-sm">Page not found</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-4 py-2 rounded-lg bg-ink text-app text-xs font-bold hover:bg-ink/85 transition-all"
          >
            Back to Reelink
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-app">
      <header className="border-b border-ink/10 bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-ink/50 hover:bg-ink/5"
            aria-label="Back to Reelink"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-lg font-black text-ink truncate">Reelink Admin</h1>
            <p className="text-xs text-ink/50 truncate">Signed in as {user.name}</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto scrollbar-hide">
          {(
            [
              ['overview', 'Overview'],
              ['activity', 'Activity'],
              ['trends', 'Trends'],
              ['health', 'Health'],
              ['ai', 'AI usage'],
              ['flagged', 'Review queue'],
              ['verifications', 'Verifications'],
              ['feedback', 'Feedback'],
              ['users', 'Users'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                tab === key
                  ? 'border-gold text-ink'
                  : 'border-transparent text-ink/45 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'overview' && <Overview token={token} />}
        {tab === 'activity' && <Activity token={token} />}
        {tab === 'trends' && <Trends token={token} />}
        {tab === 'health' && <Health token={token} />}
        {tab === 'ai' && <AiUsage token={token} />}
        {tab === 'flagged' && <Flagged token={token} />}
        {tab === 'verifications' && <Verifications token={token} />}
        {tab === 'feedback' && <Feedback token={token} />}
        {tab === 'users' && <Users token={token} currentUserId={user.id} />}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ overview */

function Overview({ token }: { token: string }) {
  const [m, setM] = useState<AdminMetrics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminMetrics(token)
      .then(setM)
      .catch((e: Error) => setError(e.message))
  }, [token])

  if (error) return <p className="text-sm text-danger py-10 text-center">{error}</p>
  if (!m) return <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>

  return (
    <div className="space-y-6">
      {m.queue.pendingVerifications > 0 && (
        <div className="rounded-2xl border border-gold/30 bg-gold/[0.07] p-4 flex items-center gap-3">
          <BadgeCheck size={18} className="text-gold-dark shrink-0" />
          <p className="text-sm text-ink font-semibold">
            {m.queue.pendingVerifications} verification
            {m.queue.pendingVerifications === 1 ? '' : 's'} waiting for review
          </p>
        </div>
      )}

      <Section title="People">
        <Stat
          label="Agents"
          value={m.users.total}
          hint={`${m.users.newThisWeek} joined this week`}
        />
        <Stat label="Verified" value={m.users.verified} hint="approved by staff" />
        <Stat label="Suspended" value={m.users.suspended} hint="cannot sign in" warn />
      </Section>

      <Section title="Content">
        <Stat
          label="Listings"
          value={m.listings.total}
          hint={`${m.listings.newThisWeek} added this week`}
        />
        <Stat label="Reels ready" value={m.reels.ready} hint={`${m.reels.total} total`} />
        <Stat
          label="Failed renders"
          value={m.reels.failed}
          hint="worth investigating"
          warn={m.reels.failed > 0}
        />
      </Section>

      <Section title="Cost and load">
        <Stat label="Renders today" value={m.renders.today} hint="across all accounts" />
        <Stat
          label="AI clips this week"
          value={m.renders.aiThisWeek}
          hint="billed by Higgsfield"
        />
        {/* The only figure here that is an estimate rather than a count, so it says so
            rather than presenting a derived number as a fact. */}
        <Stat
          label="Est. AI spend"
          value={`$${m.aiSpend.estimatedUsd.toFixed(2)}`}
          hint="this week, estimated from credit price"
          warn={m.aiSpend.estimatedUsd > 10}
        />
      </Section>

      <Section title="Engagement">
        <Stat label="Property views" value={m.engagement.viewsThisWeek} hint="this week" />
        <Stat label="Conversations" value={m.engagement.conversations} hint="buyer to agent" />
      </Section>
    </div>
  )
}

/* ------------------------------------------------------------- verifications */

function Verifications({ token }: { token: string }) {
  const [items, setItems] = useState<VerificationRequest[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  /** The request whose decline is being explained, held so the dialog can name it. */
  const [declining, setDeclining] = useState<VerificationRequest | null>(null)

  const load = useCallback(() => {
    fetchVerifications(token)
      .then(setItems)
      .catch((e: Error) => setError(e.message))
  }, [token])

  useEffect(load, [load])

  /** Approving needs no explanation; declining does, so it goes through the dialog. */
  async function review(id: string, approve: boolean, note?: string) {
    setBusy(id)
    setError('')
    try {
      await reviewVerification(token, id, approve, note)
      setDeclining(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that decision')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="text-sm text-danger py-10 text-center">{error}</p>
  if (!items) return <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-xl bg-ink/5 mx-auto mb-3 flex items-center justify-center">
          <BadgeCheck size={20} className="text-ink/25" />
        </div>
        <p className="font-bold text-ink text-sm">Nothing waiting</p>
        <p className="text-xs text-ink/50 mt-1">
          Requests appear here as agents submit them from Settings.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((r) => (
        <div
          key={r.id}
          className="bg-card rounded-2xl border border-ink/10 p-4 flex flex-wrap items-center gap-x-4 gap-y-3"
        >
          <Avatar user={r.user} />

          <div className="min-w-0 flex-1">
            <div className="font-bold text-ink text-sm truncate">{r.user.name}</div>
            <div className="text-xs text-ink/50 truncate">{r.user.email}</div>
            <div className="text-xs text-ink/70 mt-1">
              Licence <span className="font-mono font-bold text-ink">{r.licenseNumber}</span>
            </div>
            <div className="text-[11px] text-ink/40 mt-0.5">
              Submitted {new Date(r.createdAt).toLocaleDateString()} · {r.user._count.listings}{' '}
              listing{r.user._count.listings === 1 ? '' : 's'}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setDeclining(r)}
              disabled={busy === r.id}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-ink/15 text-xs font-bold text-ink/60 hover:border-danger hover:text-danger transition-all disabled:opacity-50"
            >
              <X size={13} />
              Decline
            </button>
            <button
              onClick={() => review(r.id, true)}
              disabled={busy === r.id}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-navy-dark text-xs font-bold hover:bg-gold-dark transition-all disabled:opacity-50"
            >
              <Check size={13} />
              Approve
            </button>
          </div>
        </div>
      ))}

      <ReasonDialog
        open={!!declining}
        title={`Decline ${declining?.user.name ?? ''}?`}
        description="They will be told their licence was not approved, along with the reason, so they can correct it and try again."
        placeholder="e.g. The licence number does not match PRC records."
        confirmLabel="Decline request"
        loading={busy === declining?.id}
        onConfirm={(reason) => declining && review(declining.id, false, reason)}
        onCancel={() => setDeclining(null)}
      />
    </div>
  )
}

/* --------------------------------------------------------------------- users */

function Users({ token, currentUserId }: { token: string; currentUserId: string }) {
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<AdminUser[] | null>(null)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  /** The account whose suspension is being explained. */
  const [suspending, setSuspending] = useState<AdminUser | null>(null)
  /** The account whose detail screen is open, if any. */
  const [viewing, setViewing] = useState<AdminUser | null>(null)

  const load = useCallback(
    (q: string) => {
      fetchAdminUsers(token, q)
        .then((d) => {
          setItems(d.items)
          setTotal(d.total)
        })
        .catch((e: Error) => setError(e.message))
    },
    [token],
  )

  // Debounced, so typing a name is one query rather than one per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => load(search), 300)
    return () => window.clearTimeout(timer)
  }, [search, load])

  /**
   * Lifting a suspension needs no explanation, so it runs straight away. Applying one
   * does, and goes through the dialog — the reason is what the person sees when they
   * next try to sign in.
   */
  async function setSuspension(
    u: AdminUser,
    suspending: boolean,
    reason?: string,
    days?: number,
  ) {
    setBusy(u.id)
    setError('')
    try {
      await setUserSuspension(token, u.id, suspending, reason, days)
      setSuspending(null)
      load(search)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that account')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-ink/15 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
        />
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {!items ? (
        <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink/40 py-10 text-center">No accounts match.</p>
      ) : (
        <>
          <p className="text-xs text-ink/40 mb-2">
            Showing {items.length} of {total}
          </p>

          <div className="space-y-2">
            {items.map((u) => (
              <div
                key={u.id}
                className="bg-card rounded-2xl border border-ink/10 p-3.5 flex flex-wrap items-center gap-x-3 gap-y-2.5"
              >
                <Avatar user={u} />

                {/* The whole block opens the account, so the target is the row rather
                    than a small "view" link beside the one action already there. */}
                <button
                  onClick={() => setViewing(u)}
                  className="min-w-0 flex-1 text-left group"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold text-ink text-sm truncate group-hover:text-gold-dark transition-colors">
                      {u.name}
                    </span>
                    {u.isVerified && <BadgeCheck size={13} className="text-gold-dark shrink-0" />}
                    {u.role === 'admin' && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-ink/10 text-ink/60">
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink/50 truncate">{u.email}</div>
                  <div className="text-[11px] text-ink/40 mt-0.5">
                    {u._count.listings} listing{u._count.listings === 1 ? '' : 's'} ·{' '}
                    {u._count.reels} reel{u._count.reels === 1 ? '' : 's'} · joined{' '}
                    {new Date(u.createdAt).toLocaleDateString()}
                  </div>
                  {u.suspendedAt && (
                    <div className="text-[11px] text-danger mt-1">
                      Suspended{u.suspendedReason ? `: ${u.suspendedReason}` : ''}
                      {/* Says when it ends, so staff can tell a cooling-off period from
                          a permanent removal without opening anything. */}
                      {u.suspendedUntil
                        ? ` · lifts ${new Date(u.suspendedUntil).toLocaleDateString()}`
                        : ' · indefinite'}
                    </div>
                  )}
                </button>

                {/* No button for admins or for yourself: the server refuses both, so
                    offering one would only ever produce an error. */}
                {u.role !== 'admin' && u.id !== currentUserId && (
                  <button
                    onClick={() =>
                      u.suspendedAt ? setSuspension(u, false) : setSuspending(u)
                    }
                    disabled={busy === u.id}
                    className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                      u.suspendedAt
                        ? 'bg-ink text-app hover:bg-ink/85'
                        : 'border border-ink/15 text-ink/60 hover:border-danger hover:text-danger'
                    }`}
                  >
                    {u.suspendedAt ? <Check size={13} /> : <Ban size={13} />}
                    {u.suspendedAt ? 'Restore' : 'Suspend'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <ReasonDialog
        open={!!suspending}
        title={`Suspend ${suspending?.name ?? ''}?`}
        description="They will be signed out and unable to sign back in. The reason is shown to them when they try, along with when it lifts."
        placeholder="e.g. Listings are not genuine properties."
        confirmLabel="Suspend account"
        withDuration
        loading={busy === suspending?.id}
        onConfirm={(reason, days) =>
          suspending && setSuspension(suspending, true, reason, days)
        }
        onCancel={() => setSuspending(null)}
      />

      {viewing && (
        <UserDetail
          token={token}
          user={viewing}
          onClose={() => setViewing(null)}
          onChanged={() => load(search)}
        />
      )}
    </div>
  )
}

/**
 * Every rating, happy or not.
 *
 * The unhappy ones never reach the landing page, which is exactly why they are worth
 * a screen: they are the only place the app says something it did not choose to say.
 */
function Feedback({ token }: { token: string }) {
  const [data, setData] = useState<{
    feedback: AdminFeedback[]
    average: number | null
    total: number
  } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetchAllFeedback(token)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [token])

  useEffect(load, [load])

  async function toggle(id: string, published: boolean) {
    setBusy(id)
    setError('')
    try {
      await setFeedbackPublished(token, id, published)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that feedback')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="text-sm text-danger py-10 text-center">{error}</p>
  if (!data) return <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>

  if (data.feedback.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-xl bg-ink/5 mx-auto mb-3 flex items-center justify-center">
          <Star size={20} className="text-ink/25" />
        </div>
        <p className="font-bold text-ink text-sm">No feedback yet</p>
        <p className="text-xs text-ink/50 mt-1">
          Agents are asked once, after their first reel finishes.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-card rounded-2xl border border-ink/10 p-4 flex items-center gap-6">
        <div>
          <div className="text-2xl font-black text-ink">
            {data.average?.toFixed(1) ?? '—'}
          </div>
          <div className="text-xs text-ink/50">average of all {data.total}</div>
        </div>
        <div className="text-xs text-ink/50 leading-relaxed">
          This is every rating, including the ones never shown publicly. Only 4 and 5
          star feedback with a comment reaches the landing page.
        </div>
      </div>

      {data.feedback.map((f) => (
        <div key={f.id} className="bg-card rounded-2xl border border-ink/10 p-4">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <Avatar user={f.user} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink text-sm truncate">{f.user.name}</span>
                <span className="flex gap-0.5 shrink-0">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={12}
                      className={n <= f.rating ? 'text-gold fill-gold' : 'text-ink/15'}
                    />
                  ))}
                </span>
              </div>
              <div className="text-xs text-ink/50 truncate">{f.user.email}</div>
              {f.comment ? (
                <p className="text-sm text-ink/80 mt-2 leading-relaxed">“{f.comment}”</p>
              ) : (
                <p className="text-xs text-ink/35 mt-2 italic">No comment left</p>
              )}
              <div className="text-[11px] text-ink/40 mt-1.5">
                {new Date(f.createdAt).toLocaleDateString()} · after a {f.source}
                {!f.showName && ' · asked to stay anonymous'}
              </div>
            </div>

            <div className="w-full sm:w-auto">
              {f.published ? (
                <button
                  onClick={() => toggle(f.id, false)}
                  disabled={busy === f.id}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-ink/15 text-xs font-bold text-ink/60 hover:border-danger hover:text-danger transition-all disabled:opacity-50"
                >
                  <X size={13} />
                  Hide from homepage
                </button>
              ) : (
                <button
                  onClick={() => toggle(f.id, true)}
                  // Nothing to show is nothing to publish, and we never edit what
                  // somebody wrote to make it publishable.
                  disabled={busy === f.id || !f.comment}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-navy-dark text-xs font-bold hover:bg-gold-dark transition-all disabled:opacity-40"
                >
                  <Check size={13} />
                  {f.comment ? 'Show on homepage' : 'No comment to show'}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
