import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, Check, CircleCheck } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import PasswordInput from '../components/PasswordInput'
import { resetPassword } from '../lib/api'

const MIN_PASSWORD_LENGTH = 6

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  const mismatch = confirm.length > 0 && password !== confirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!longEnough || mismatch) return
    setError('')
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
      // Long enough to read the confirmation, short enough not to feel stuck.
      setTimeout(() => navigate('/login'), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // A link with no token at all never came from one of our emails.
  if (!token) {
    return (
      <AuthLayout
        title="This link is incomplete"
        subtitle="It's missing the reset code, so we can't tell whose password to change."
        footer={
          <Link to="/forgot-password" className="text-gold font-bold hover:underline">
            Request a new link
          </Link>
        }
      >
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle size={17} className="text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-content/70 leading-relaxed">
            Try opening the link straight from the email rather than retyping it.
          </p>
        </div>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout
        title="Password changed"
        subtitle="Taking you to the log in page…"
        footer={<Link to="/login" className="text-gold font-bold">Go now</Link>}
      >
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
          <CircleCheck size={17} className="text-success shrink-0 mt-0.5" />
          <p className="text-sm text-content/70 leading-relaxed">
            You can log in with your new password. The reset link has been used up and
            won't work again.
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose something you haven't used on Reelink before."
      footer={
        <>
          Changed your mind?{' '}
          <Link to="/login" className="text-gold font-bold hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-danger text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div>
          <PasswordInput
            label="New password"
            value={password}
            onChange={setPassword}
            placeholder="Create a password"
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
          <div
            className={`flex items-center gap-1.5 mt-2 text-xs transition-colors ${
              longEnough ? 'text-success' : 'text-content/35'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center border transition-colors ${
                longEnough ? 'bg-emerald-500/20 border-emerald-500/40' : 'border-line/20'
              }`}
            >
              {longEnough && <Check size={10} />}
            </span>
            At least {MIN_PASSWORD_LENGTH} characters
          </div>
        </div>

        <div>
          <PasswordInput
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Type it again"
            autoComplete="new-password"
          />
          {mismatch && <p className="text-xs text-danger mt-1.5">Passwords don't match.</p>}
        </div>

        <button
          type="submit"
          disabled={loading || !longEnough || mismatch}
          className="w-full py-3 rounded-xl bg-gold text-navy-dark font-extrabold text-sm shadow-lg shadow-gold/20 hover:bg-gold-dark hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:translate-y-0 mt-2"
        >
          {loading ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </AuthLayout>
  )
}
