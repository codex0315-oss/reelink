import { useEffect, useState } from 'react'
import {
  Camera,
  Check,
  Lock,
  Bell,
  Mail,
  Plug,
  CalendarDays,
  MessageCircle,
  Phone,
  AlertCircle,
  Eye,
  EyeOff,
  BadgeCheck,
  Palette,
  Sun,
  Moon,
} from 'lucide-react'
import { useAuth, type User } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  updateProfile,
  changePassword,
  updateNotificationPrefs,
  fetchMyVerification,
  submitVerification,
} from '../lib/api'
import { assetUrl } from '../lib/config'
import { LIMITS } from '../lib/limits'

const INTEGRATIONS = [
  {
    name: 'Google Calendar',
    icon: CalendarDays,
    body: 'Sync property viewings and open-house schedules to your calendar.',
  },
  {
    name: 'WhatsApp',
    icon: MessageCircle,
    body: 'Reply to buyer enquiries from inside Reelink.',
  },
  {
    name: 'Viber',
    icon: Phone,
    body: 'Reach buyers on the app many Filipino clients already use.',
  },
]

export default function SettingsView() {
  const { user, token, setUser, setToken } = useAuth()

  if (!user || !token) return null

  return (
    <div className="max-w-6xl">
      <div className="mb-7">
        <h1 className="font-heading text-2xl font-black text-ink">Settings</h1>
        <p className="text-ink/50 text-sm mt-1">
          Manage your profile, security and what Reelink notifies you about.
        </p>
      </div>

      {/* Two columns so the page fills the width instead of leaving the right side
          empty: forms on the left, toggles and status panels on the right.

          Cards keep their natural height — stretching a form is what pulled the
          password fields apart before. The one exception is the Account card, which
          absorbs the last few pixels of difference so the two columns finish exactly
          level; its footnote already sits at the bottom, so the growth is invisible. */}
      <div className="grid lg:grid-cols-5 gap-5 lg:gap-6">
        <div className="lg:col-span-3 flex flex-col gap-5 lg:gap-6">
          <ProfileSection user={user} token={token} onUser={setUser} onToken={setToken} />
          <PasswordSection token={token} />
          {/* Sits here rather than full-width below: the right column runs about one
              card longer than the left, and this is what fills that difference. */}
          <AppearanceSection />
        </div>

        <div className="lg:col-span-2 flex flex-col gap-5 lg:gap-6">
          <NotificationsSection user={user} token={token} onUser={setUser} />
          <IntegrationsSection />
          <AccountSummary user={user} token={token} />
        </div>
      </div>

    </div>
  )
}

/* ------------------------------------------------------------------ profile */

function ProfileSection({
  user,
  token,
  onUser,
  onToken,
}: {
  user: User
  token: string
  onUser: (u: User) => void
  onToken: (t: string) => void
}) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase()
  const preview = avatar ? URL.createObjectURL(avatar) : null

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('phone', phone)
      if (emailChanged) {
        formData.append('email', email.trim())
        formData.append('currentPassword', currentPassword)
      }
      if (avatar) formData.append('avatar', avatar)

      const updated = await updateProfile(token, formData)
      // Changing the email reissues the token, since the old one carries the old address.
      if (updated.accessToken) onToken(updated.accessToken)
      onUser(updated)
      setAvatar(null)
      setCurrentPassword('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Profile" description="How you appear across Reelink.">
      <form onSubmit={handleSave} className="space-y-5">
        <div className="flex items-center gap-5">
          <div className="relative">
            {preview || user.avatarUrl ? (
              <img
                src={preview ?? assetUrl(user.avatarUrl)}
                alt=""
                className="w-20 h-20 rounded-full object-cover border border-ink/10"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-ink text-app flex items-center justify-center text-2xl font-black">
                {user.name?.[0]?.toUpperCase() ?? 'R'}
              </div>
            )}
            <label
              htmlFor="avatar-upload"
              title="Change photo"
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gold text-navy-dark flex items-center justify-center cursor-pointer hover:bg-gold-dark transition-all shadow-md"
            >
              <Camera size={14} />
            </label>
            <input
              type="file"
              id="avatar-upload"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setAvatar(e.target.files[0])}
            />
          </div>
          <div className="text-xs text-ink/50">
            <div className="font-bold text-ink text-sm">Profile photo</div>
            <p className="mt-1">JPG, PNG or WEBP, up to 5MB.</p>
            {avatar && <p className="mt-1 text-gold-dark font-semibold">Save to apply.</p>}
          </div>
        </div>

        <Field label="Display name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={LIMITS.name}
            className={inputClass}
          />
        </Field>

        <Field label="Phone number" hint="Used for buyer enquiries.">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={LIMITS.phone}
            placeholder="+63 917 000 0000"
            className={inputClass}
          />
        </Field>

        <Field label="Email address" hint="You sign in with this.">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={LIMITS.email}
            className={inputClass}
          />
        </Field>

        {/* Only asked for when it's actually needed */}
        {emailChanged && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <p className="text-xs text-warn font-semibold mb-2.5">
              Changing your email changes how you log in. Confirm with your password.
            </p>
            <PasswordInputLight
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Current password"
            />
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-ink text-app text-sm font-bold hover:bg-ink/85 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
              <Check size={14} />
              Saved
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}

/* --------------------------------------------------------------- appearance */

/**
 * Each tile paints a miniature of the real interface in fixed colours, so the choice
 * is made by looking rather than by reading a label.
 */
const THEMES = [
  {
    value: 'light' as const,
    label: 'Light',
    hint: 'Best in daylight',
    icon: Sun,
    swatch: { page: '#EEF1F6', card: '#FFFFFF', ink: '#070D1B', muted: '#C9D2E0' },
  },
  {
    value: 'dark' as const,
    label: 'Dark',
    hint: 'Easier at night',
    icon: Moon,
    swatch: { page: '#070D1B', card: '#101E36', ink: '#E8EEF7', muted: '#2C3E5C' },
  },
]

function AppearanceSection() {
  const { theme, setTheme } = useTheme()

  return (
    <Card
      title="Appearance"
      description="Applies to every page, on this browser."
      icon={Palette}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        {THEMES.map(({ value, label, hint, icon: Icon, swatch }) => {
          const active = theme === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={active}
              className={`text-left rounded-xl border p-3 flex items-center gap-4 transition-all active:scale-[0.99] ${
                active
                  ? 'border-gold ring-2 ring-gold/30'
                  : 'border-ink/15 hover:border-ink/30'
              }`}
            >
              {/* Miniature of the app: sidebar, header, a card and some text. Fixed
                  width so it keeps screen-like proportions however wide the card is. */}
              <div
                className="w-32 h-[5rem] shrink-0 rounded-lg overflow-hidden flex gap-1 p-1.5"
                style={{ background: swatch.page }}
              >
                <div
                  className="w-1/4 rounded"
                  style={{ background: swatch.card }}
                  aria-hidden
                />
                <div className="flex-1 flex flex-col gap-1">
                  <div
                    className="h-3 rounded"
                    style={{ background: swatch.card }}
                    aria-hidden
                  />
                  <div
                    className="flex-1 rounded p-1.5 flex flex-col gap-1 justify-center"
                    style={{ background: swatch.card }}
                    aria-hidden
                  >
                    <div
                      className="h-1.5 w-3/4 rounded-full"
                      style={{ background: swatch.ink }}
                    />
                    <div
                      className="h-1.5 w-full rounded-full"
                      style={{ background: swatch.muted }}
                    />
                    <div
                      className="h-1.5 w-1/2 rounded-full"
                      style={{ background: swatch.muted }}
                    />
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon size={15} className={active ? 'text-gold-dark' : 'text-ink/40'} />
                  <span className="text-sm font-bold text-ink">{label}</span>
                </div>
                <p className="text-xs text-ink/50 mt-1">{hint}</p>
              </div>

              <span
                className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${
                  active ? 'bg-gold text-navy-dark' : 'border border-ink/20'
                }`}
              >
                {active && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/* ----------------------------------------------------------------- password */

function PasswordSection({ token }: { token: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (mismatch) return
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      await changePassword(token, { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Change password"
      description="Use at least 6 characters."
      icon={Lock}
    >
      {/* Natural height. This used to stretch to match the right column, which was
          fine until that column grew — then the leftover space blew the field gaps
          apart. Balance is handled by what sits in each column instead. */}
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <PasswordInputLight
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <PasswordInputLight
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          minLength={6}
        />
        <div>
          <PasswordInputLight
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
          {mismatch && (
            <p className="text-xs text-danger mt-1.5">Passwords don't match.</p>
          )}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !currentPassword || !newPassword || mismatch}
            className="px-5 py-2.5 rounded-xl bg-ink text-app text-sm font-bold hover:bg-ink/85 transition-all active:scale-95 disabled:opacity-40"
          >
            {saving ? 'Updating…' : 'Update password'}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
              <Check size={14} />
              Password changed
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}

/* ------------------------------------------------------------ notifications */

function NotificationsSection({
  user,
  token,
  onUser,
}: {
  user: User
  token: string
  onUser: (u: User) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)

  async function toggle(key: keyof User, value: boolean) {
    setSaving(key)
    // Optimistic: the switch moves immediately, then reconciles with the server.
    onUser({ ...user, [key]: value })
    try {
      const updated = await updateNotificationPrefs(token, { [key]: value })
      onUser(updated)
    } catch {
      onUser({ ...user, [key]: !value })
    } finally {
      setSaving(null)
    }
  }

  const rows = [
    {
      key: 'notifyNewListings' as const,
      title: 'New properties listed',
      body: 'When anyone publishes a new property on Reelink.',
    },
    {
      key: 'notifyNewReels' as const,
      title: 'New reels published',
      body: 'When anyone creates a new marketing reel.',
    },
    {
      key: 'notifyMyActivity' as const,
      title: 'My own activity',
      body: 'When your reel finishes rendering, or a render fails.',
    },
    {
      key: 'notifyEmailMessages' as const,
      title: 'Email me about messages',
      // Says plainly that this one leaves the app, unlike the three above it.
      body: 'Only when someone messages you while you are offline.',
      email: true,
    },
  ]

  return (
    <Card
      title="Notifications"
      description="In-app alerts appear in the bell menu. One setting sends email."
      icon={Bell}
    >
      <div className="divide-y divide-ink/5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-6 py-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-bold text-ink">{row.title}</div>
                {'email' in row && row.email && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide bg-gold/15 text-gold-dark border border-gold/25">
                    <Mail size={9} />
                    Email
                  </span>
                )}
              </div>
              <p className="text-xs text-ink/50 mt-0.5">{row.body}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(user[row.key])}
              disabled={saving === row.key}
              onClick={() => toggle(row.key, !user[row.key])}
              className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-60 ${
                user[row.key] ? 'bg-gold' : 'bg-ink/15'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  user[row.key] ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------- integrations */

function IntegrationsSection() {
  return (
    <Card
      title="Connections"
      description="Reach buyers where they already are."
      icon={Plug}
    >
      <div className="divide-y divide-ink/5">
        {INTEGRATIONS.map(({ name, icon: Icon, body }) => (
          <div key={name} className="flex items-center gap-4 py-3.5">
            <span className="w-10 h-10 rounded-xl bg-ink/5 border border-ink/10 flex items-center justify-center text-ink/40 shrink-0">
              <Icon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-ink">{name}</div>
              <p className="text-xs text-ink/50 mt-0.5">{body}</p>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide bg-gold/15 text-gold-dark border border-gold/25 shrink-0">
              Coming soon
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ----------------------------------------------------------- verification */

/**
 * Asking to be verified, and seeing where the request stands.
 *
 * Verification is reviewed by staff rather than granted on request, so this collects
 * the one thing a reviewer needs — a licence number to check against the PRC register —
 * and then reports back. A declined request shows the reason so it can be corrected and
 * resubmitted rather than leaving the agent guessing.
 */
function VerificationRequestRow({ token }: { token: string }) {
  const [request, setRequest] = useState<Awaited<
    ReturnType<typeof fetchMyVerification>
  > | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [licence, setLicence] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchMyVerification(token)
      .then(setRequest)
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [token])

  async function submit() {
    const value = licence.trim()
    if (!value) return
    setSaving(true)
    setError('')
    try {
      await submitVerification(token, value)
      setRequest(await fetchMyVerification(token))
      setOpen(false)
      setLicence('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your request')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  if (request?.status === 'pending') {
    return (
      <div className="py-3 text-xs text-ink/55">
        Verification requested — a reviewer will check licence{' '}
        <span className="font-mono font-bold text-ink">{request.licenseNumber}</span> shortly.
      </div>
    )
  }

  return (
    <div className="py-3">
      {request?.status === 'rejected' && (
        <p className="text-xs text-warn mb-2">
          Last request was declined{request.reviewNote ? `: ${request.reviewNote}` : '.'}
        </p>
      )}

      {open ? (
        <div className="space-y-2">
          <input
            value={licence}
            onChange={(e) => setLicence(e.target.value)}
            placeholder="PRC licence or DHSUD registration no."
            maxLength={40}
            className={inputClass}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={saving || !licence.trim()}
              className="flex-1 px-3 py-2 rounded-lg bg-gold text-navy-dark text-xs font-bold hover:bg-gold-dark transition-all disabled:opacity-50"
            >
              {saving ? 'Sending…' : 'Send for review'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-lg border border-ink/15 text-xs font-bold text-ink/60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-bold text-gold-dark hover:underline"
        >
          {request?.status === 'rejected' ? 'Try again' : 'Get verified'}
        </button>
      )}
    </div>
  )
}

/* -------------------------------------------------------- account summary */

function AccountSummary({ user, token }: { user: User; token: string }) {
  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-PH', {
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <Card
      title="Account"
      description="Your standing on Reelink."
      icon={BadgeCheck}
      className="flex-1 flex flex-col"
    >
      <div className="divide-y divide-ink/5">
        <div className="flex items-center justify-between py-3">
          <span className="text-xs text-ink/50 font-semibold">Verification</span>
          {user.isVerified ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide bg-emerald-500/10 text-success border border-emerald-500/25">
              <Check size={11} />
              Verified
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide bg-ink/5 text-ink/45 border border-ink/10">
              Unverified
            </span>
          )}
        </div>

        {/* The badge above used to be permanent — nothing in the app could ever grant
            it. This is the route that makes it mean something to a buyer. */}
        {!user.isVerified && <VerificationRequestRow token={token} />}

        {joined && (
          <div className="flex items-center justify-between py-3">
            <span className="text-xs text-ink/50 font-semibold">Member since</span>
            <span className="text-xs font-bold text-ink">{joined}</span>
          </div>
        )}

        <div className="flex items-center justify-between py-3">
          <span className="text-xs text-ink/50 font-semibold">Plan</span>
          <span className="text-xs font-bold text-ink">Free</span>
        </div>
      </div>

      <p className="text-[11px] text-ink/40 leading-relaxed mt-auto pt-3 border-t border-ink/5">
        A verification badge for licensed brokers is coming. Anyone can list properties
        on Reelink in the meantime.
      </p>
    </Card>
  )
}

/* ------------------------------------------------------------------ shared */

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-ink/15 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all'

function Card({
  title,
  description,
  icon: Icon,
  className = '',
  children,
}: {
  title: string
  description: string
  icon?: typeof Bell
  /** Lets the last card in a column stretch, so both columns finish level. */
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={`bg-card rounded-2xl border border-ink/10 p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-start gap-3 mb-5">
        {Icon && (
          <span className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold-dark shrink-0">
            <Icon size={16} />
          </span>
        )}
        <div>
          <h2 className="font-heading font-bold text-ink">{title}</h2>
          <p className="text-xs text-ink/50 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-sm font-semibold text-ink">{label}</label>
        {hint && <span className="text-[11px] text-ink/40">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-danger text-sm">
      <AlertCircle size={15} className="shrink-0 mt-0.5" />
      {children}
    </div>
  )
}

/**
 * PasswordInput is styled for the dark auth pages; the dashboard is light, so this
 * reuses its show/hide behaviour with light-theme classes.
 */
function PasswordInputLight({
  label,
  value,
  onChange,
  placeholder,
  minLength,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minLength?: number
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-ink mb-1.5">{label}</label>
      )}
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          minLength={minLength}
          placeholder={placeholder}
          className={`${inputClass} pr-12`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-ink/35 hover:text-gold-dark hover:bg-ink/5 transition-all"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}
