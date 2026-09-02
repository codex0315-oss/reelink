import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWakingServer } from '../hooks/useWakingServer'
import { loginAgent } from '../lib/api'
import AuthLayout from '../components/AuthLayout'
import PasswordInput from '../components/PasswordInput'
import { LIMITS } from '../lib/limits'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, token } = useAuth()
  const waking = useWakingServer(loading)

  // Browser history can land an already-signed-in user back here — pressing Back from
  // the dashboard, for instance. Without this they see a login form and reasonably
  // conclude they were signed out, when the session is still perfectly valid.
  if (token) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await loginAgent({ email, password })
      // Awaited so the button keeps spinning until the redirect happens; login now
      // loads the profile first to decide whether this is staff.
      await login(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome!"
      subtitle="Log in to your Reelink dashboard."
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/register" className="font-bold text-gold hover:text-gold-dark transition-colors">
            Sign up
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-content mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            maxLength={LIMITS.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-2.5 rounded-xl bg-line/5 border border-line/15 text-sm text-content placeholder:text-content/30 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
            placeholder="you@example.com"
          />
        </div>

        <PasswordInput
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Your password"
          autoComplete="current-password"
          labelAction={
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-content/40 hover:text-gold transition-colors"
            >
              Forgot password?
            </Link>
          }
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gold text-navy-dark font-extrabold text-sm shadow-lg shadow-gold/20 hover:bg-gold-dark hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:translate-y-0 mt-2"
        >
          {loading ? (waking ? 'Waking the server…' : 'Logging in…') : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  )
}
