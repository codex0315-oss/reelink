import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { registerAgent } from '../lib/api'
import AuthLayout from '../components/AuthLayout'
import PasswordInput from '../components/PasswordInput'
import { LIMITS } from '../lib/limits'

const MIN_PASSWORD_LENGTH = 6

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const longEnough = password.length >= MIN_PASSWORD_LENGTH

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await registerAgent({ name, email, password })
      login(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start listing properties in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-gold hover:text-gold-dark transition-colors">
            Log in
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
          <label htmlFor="name" className="block text-sm font-semibold text-content mb-1.5">
            Full name
          </label>
          <input
            id="name"
            type="text"
            maxLength={LIMITS.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="w-full px-4 py-2.5 rounded-xl bg-line/5 border border-line/15 text-sm text-content placeholder:text-content/30 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
            placeholder="Juan Dela Cruz"
          />
        </div>

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

        <div>
          <PasswordInput
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="Create a password"
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
          {/* Shows the rule up front instead of only failing on submit */}
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

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gold text-navy-dark font-extrabold text-sm shadow-lg shadow-gold/20 hover:bg-gold-dark hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:translate-y-0 mt-2"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-center text-[11px] text-content/30 leading-relaxed">
          Anyone can list a property on Reelink — no broker licence required.
        </p>
      </form>
    </AuthLayout>
  )
}
