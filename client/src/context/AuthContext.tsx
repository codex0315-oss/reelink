import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe } from '../lib/api'
import {
  getAccessToken,
  setSession,
  clearSession,
  revokeSession,
  onSessionExpired,
  type Session,
} from '../lib/session'

export type User = {
  id: string
  name: string
  email: string
  phone?: string | null
  avatarUrl?: string | null
  isVerified: boolean
  /** 'agent' | 'admin'. Decides only whether the admin link is offered. */
  role?: string
  notifyNewListings: boolean
  notifyNewReels: boolean
  notifyMyActivity: boolean
  notifyEmailMessages: boolean
  createdAt?: string
}

type AuthContextType = {
  user: User | null
  token: string | null
  login: (session: Session | string) => void
  logout: () => (void)
  loading: boolean
  /** Push an updated user into context so the top bar reflects Settings changes at once. */
  setUser: (user: User) => void
  /** Swap in a new token, e.g. after an email change reissues one. */
  setToken: (token: string) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const storedToken = getAccessToken()
    if (storedToken) {
      setToken(storedToken)
      // getMe renews silently behind the scenes, so this only rejects when the session
      // is genuinely unrecoverable — the expiry listener below clears state either way.
      getMe(storedToken)
        .then(setUser)
        .catch(() => {
          clearSession()
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // Fired when a token expires mid-session and renewal fails. Without this the app
  // kept rendering a signed-in shell over data it could no longer fetch.
  useEffect(
    () =>
      onSessionExpired(() => {
        setToken(null)
        setUser(null)
        navigate('/login', { replace: true })
      }),
    [navigate],
  )

  function login(session: Session | string) {
    // Accepts the whole response so the refresh token travels with it; the bare-string
    // form is kept for callers that only ever had an access token.
    const next: Session = typeof session === 'string' ? { accessToken: session } : session
    setSession(next)
    setToken(next.accessToken)
    getMe(next.accessToken).then(setUser).catch(() => {})
    navigate('/dashboard')
  }

  function logout() {
    void revokeSession()
    setToken(null)
    setUser(null)
    navigate('/')
  }

  function replaceToken(newToken: string) {
    setSession({ accessToken: newToken })
    setToken(newToken)
  }

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, loading, setUser, setToken: replaceToken }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}