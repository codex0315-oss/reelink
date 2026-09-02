import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Film, Home, Star, Trash2, X } from 'lucide-react'
import {
  fetchAdminUserDetail,
  removeListingAsAdmin,
  removeReelAsAdmin,
  type AdminUser,
  type AdminUserDetail,
} from '../lib/api'
import { assetUrl } from '../lib/config'
import { Avatar, ago } from './adminUi'
import ReasonDialog from './ReasonDialog'

/**
 * One account, in full, with the power to take its content down.
 *
 * Removal lives here rather than in a platform-wide list because the question staff are
 * usually answering is about a person — someone complained about this agent — and the
 * rest of what they have posted is the context for judging any one item.
 */
export default function UserDetail({
  token,
  user,
  onClose,
  onChanged,
}: {
  token: string
  user: AdminUser
  onClose: () => void
  /** Lets the list behind refresh its counts once something is removed. */
  onChanged: () => void
}) {
  const [data, setData] = useState<AdminUserDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  /** What is about to be removed, held so the dialog can name it. */
  const [removing, setRemoving] = useState<
    { kind: 'listing' | 'reel'; id: string; label: string } | null
  >(null)

  const load = useCallback(() => {
    fetchAdminUserDetail(token, user.id)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [token, user.id])

  useEffect(load, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only when no dialog is on top, or Escape would close both at once.
      if (e.key === 'Escape' && !removing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, removing])

  async function confirmRemoval(reason: string) {
    if (!removing) return
    setBusy(true)
    setError('')
    try {
      if (removing.kind === 'listing') {
        await removeListingAsAdmin(token, removing.id, reason)
      } else {
        await removeReelAsAdmin(token, removing.id, reason)
      }
      setRemoving(null)
      load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-start sm:items-center justify-center p-0 sm:p-6 bg-navy-dark/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-app w-full max-w-3xl sm:rounded-2xl shadow-2xl min-h-[100dvh] sm:min-h-0 sm:max-h-[90vh] sm:overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-ink/10 px-5 py-4 flex items-center gap-3 z-10">
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-ink truncate">{user.name}</span>
              {user.isVerified && <BadgeCheck size={14} className="text-gold-dark shrink-0" />}
            </div>
            <div className="text-xs text-ink/50 truncate">{user.email}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-ink/40 hover:text-ink hover:bg-ink/5 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && <p className="text-sm text-danger">{error}</p>}
          {!data ? (
            <p className="text-sm text-ink/40 py-10 text-center">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Tile label="Listings" value={data.user._count.listings} />
                <Tile label="Reels" value={data.user._count.reels} />
                <Tile label="Renders this week" value={data.rendersThisWeek} />
              </div>

              <div className="bg-card rounded-2xl border border-ink/10 divide-y divide-ink/5 text-sm">
                <Row label="Joined" value={new Date(data.user.createdAt).toLocaleDateString()} />
                <Row
                  label="Last seen"
                  value={data.user.lastSeenAt ? ago(data.user.lastSeenAt) : 'never'}
                />
                <Row
                  label="Email confirmed"
                  value={data.user.emailVerifiedAt ? 'yes' : 'not yet'}
                />
                {data.user.suspendedAt && (
                  <Row
                    label="Suspended"
                    value={data.user.suspendedReason || 'no reason recorded'}
                    danger
                  />
                )}
              </div>

              {data.feedback && (
                <section>
                  <Heading>Their feedback</Heading>
                  <div className="bg-card rounded-2xl border border-ink/10 p-4">
                    <div className="flex gap-0.5 mb-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          size={13}
                          className={
                            n <= data.feedback!.rating ? 'text-gold fill-gold' : 'text-ink/15'
                          }
                        />
                      ))}
                    </div>
                    {data.feedback.comment ? (
                      <p className="text-sm text-ink/80">“{data.feedback.comment}”</p>
                    ) : (
                      <p className="text-xs text-ink/35 italic">No comment left</p>
                    )}
                  </div>
                </section>
              )}

              <section>
                <Heading>Listings</Heading>
                {data.listings.length === 0 ? (
                  <Empty>Nothing listed yet.</Empty>
                ) : (
                  <div className="space-y-2">
                    {data.listings.map((l) => (
                      <div
                        key={l.id}
                        className="bg-card rounded-2xl border border-ink/10 p-3 flex items-center gap-3"
                      >
                        {l.photoUrls[0] ? (
                          <img
                            src={assetUrl(l.photoUrls[0])}
                            alt=""
                            className="w-14 h-14 rounded-xl object-cover shrink-0 border border-ink/10"
                          />
                        ) : (
                          <span className="w-14 h-14 rounded-xl bg-ink/5 flex items-center justify-center shrink-0">
                            <Home size={18} className="text-ink/25" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-ink text-sm truncate">{l.title}</div>
                          <div className="text-xs text-ink/50">
                            ₱{l.price.toLocaleString()} · for {l.listingType} ·{' '}
                            {ago(l.createdAt)}
                          </div>
                        </div>
                        <RemoveButton
                          onClick={() =>
                            setRemoving({ kind: 'listing', id: l.id, label: l.title })
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <Heading>Reels</Heading>
                {data.reels.length === 0 ? (
                  <Empty>No reels yet.</Empty>
                ) : (
                  <div className="space-y-2">
                    {data.reels.map((r) => {
                      const label = r.listing?.title ?? r.title ?? 'Untitled reel'
                      return (
                        <div
                          key={r.id}
                          className="bg-card rounded-2xl border border-ink/10 p-3 flex items-center gap-3"
                        >
                          <span className="w-14 h-14 rounded-xl bg-ink/5 flex items-center justify-center shrink-0">
                            <Film size={18} className="text-ink/25" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-ink text-sm truncate">{label}</div>
                            <div className="text-xs text-ink/50">
                              {r.status} · {ago(r.createdAt)}
                            </div>
                          </div>
                          <RemoveButton
                            onClick={() => setRemoving({ kind: 'reel', id: r.id, label })}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <ReasonDialog
        open={!!removing}
        title={`Remove “${removing?.label ?? ''}”?`}
        description={`This deletes the ${removing?.kind ?? 'item'} permanently and cannot be undone. ${user.name} is told it was removed, along with the reason.`}
        placeholder="e.g. The photos are not of this property."
        confirmLabel="Remove permanently"
        loading={busy}
        onConfirm={confirmRemoval}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold text-ink/45 uppercase tracking-wide mb-2">
      {children}
    </h3>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-ink/40 bg-card rounded-2xl border border-ink/10 p-4">
      {children}
    </p>
  )
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-2xl border border-ink/10 p-3.5">
      <div className="font-heading text-xl font-black text-ink">{value}</div>
      <div className="text-[11px] text-ink/45 mt-0.5">{label}</div>
    </div>
  )
}

function Row({
  label,
  value,
  danger,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-ink/60 shrink-0">{label}</span>
      <span className={`font-semibold truncate ${danger ? 'text-danger' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Remove"
      className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-ink/35 hover:text-danger hover:bg-red-500/10 transition-all"
    >
      <Trash2 size={15} />
    </button>
  )
}
