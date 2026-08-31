import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck, AlertCircle } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { requestPasswordReset } from '../lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Deliberately does not say whether the address is registered — that would let
  // anyone check who has an account here.
  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If that address is registered, a reset link is on its way."
        footer={<Link to="/login" className="text-gold font-bold">Back to log in</Link>}
      >
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-gold/10 border border-gold/25">
          <MailCheck size={17} className="text-gold-dark shrink-0 mt-0.5" />
          <p className="text-sm text-content/70 leading-relaxed">
            The link works once and expires in an hour. If nothing arrives, check your
            spam folder, then try again.
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to set a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="text-gold font-bold hover:underline">
            Log in
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
          <label htmlFor="email" className="block text-sm font-semibold text-content mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl bg-line/5 border border-line/15 text-sm text-content placeholder:text-content/30 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
            placeholder="you@example.com"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gold text-navy-dark font-extrabold text-sm shadow-lg shadow-gold/20 hover:bg-gold-dark hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:translate-y-0 mt-2"
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </AuthLayout>
  )
}
