import { API_URL } from './config'

/**
 * Token storage and renewal, in one place.
 *
 * Nothing else in the app reads or writes these keys. Previously AuthContext owned
 * them, which meant the only check for an expired token happened once, at page load —
 * a token that expired while the tab was open turned every request into a silent 401
 * and the UI just showed empty lists as if the data were gone.
 */
const ACCESS_KEY = 'accessToken'
const REFRESH_KEY = 'refreshToken'

export type Session = { accessToken: string; refreshToken?: string }

/** localStorage throws in Safari private mode rather than returning null. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // A browser refusing to persist is not worth breaking the session over; the
    // in-memory React state carries it for the life of the tab.
  }
}

export const getAccessToken = () => read(ACCESS_KEY)
export const getRefreshToken = () => read(REFRESH_KEY)

export function setSession(session: Session) {
  write(ACCESS_KEY, session.accessToken)
  // Renewal returns a rotated refresh token; a profile update returns only an access
  // token, and must not wipe the refresh token that is still perfectly good.
  if (session.refreshToken) write(REFRESH_KEY, session.refreshToken)
}

export function clearSession() {
  write(ACCESS_KEY, null)
  write(REFRESH_KEY, null)
}

/* -------------------------------------------------------------- expiry signal */

type Listener = () => void
const expiryListeners = new Set<Listener>()

/** AuthContext subscribes so React state clears when a renewal finally fails. */
export function onSessionExpired(listener: Listener) {
  expiryListeners.add(listener)
  return () => expiryListeners.delete(listener)
}

function sessionExpired() {
  clearSession()
  expiryListeners.forEach((l) => l())
}

/* -------------------------------------------------------------- renewal */

/**
 * Shared across callers on purpose. A dashboard mount fires several requests at once,
 * and without this every one of them would 401 together and then race to spend the
 * same refresh token — the server rotates on use, so the first would win and the rest
 * would look like replays and kill the session.
 */
let inFlight: Promise<string | null> | null = null

export function refreshAccessToken(): Promise<string | null> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return null

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return null

      const data = (await res.json()) as Session
      if (!data?.accessToken) return null

      setSession(data)
      return data.accessToken
    } catch {
      // Offline, or the server is down. Not an expired session — see apiFetch.
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/* -------------------------------------------------------------- sign-out */

/** Best-effort revocation. The local session is cleared either way. */
export async function revokeSession() {
  const refreshToken = getRefreshToken()
  clearSession()
  if (!refreshToken) return
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    // Nothing useful to do — the token expires on its own within 30 days.
  }
}

/* -------------------------------------------------------------- the choke point */

/** Endpoints where a 401 is the real answer, not an expired token. */
const NO_RETRY = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']

/**
 * fetch, plus one silent renewal attempt on 401.
 *
 * Every authenticated call in api.ts goes through here, so a token that expires
 * mid-session is renewed and the original request retried without the user seeing
 * anything. Only when renewal itself fails does the session actually end.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, init)

  if (res.status !== 401) return res
  if (NO_RETRY.some((path) => url.includes(path))) return res

  const fresh = await refreshAccessToken()
  if (!fresh) {
    sessionExpired()
    return res
  }

  const retried = await fetch(url, withToken(init, fresh))
  // Renewal worked but the server still says no: the account is gone or disabled.
  if (retried.status === 401) sessionExpired()
  return retried
}

/** Swaps the Authorization header for the renewed token, leaving the rest intact. */
function withToken(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}
