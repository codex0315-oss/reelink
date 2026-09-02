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

/** `reason` is set only when the server explained itself — today, a suspension. */
type Listener = (reason?: string) => void
const expiryListeners = new Set<Listener>()

/** AuthContext subscribes so React state clears when a renewal finally fails. */
export function onSessionExpired(listener: Listener): () => void {
  expiryListeners.add(listener)
  // Braces, not a concise body: Set.delete returns a boolean, and this is used
  // directly as a useEffect cleanup, which must return void or another cleanup.
  // Returning a boolean there is a type error that fails the production build.
  return () => {
    expiryListeners.delete(listener)
  }
}

function sessionExpired(reason?: string) {
  clearSession()
  expiryListeners.forEach((l) => l(reason))
}

/**
 * Whether a 403 is "your account is suspended" rather than "not your listing".
 *
 * Read from the body, and from a clone so the original response is still readable by
 * whoever called us — a Response body can only be consumed once, and quietly draining
 * it here would break every caller that expects to parse its own error.
 */
async function isSuspensionResponse(res: Response): Promise<string | null> {
  try {
    const data = (await res.clone().json()) as { message?: unknown }
    const message = typeof data.message === 'string' ? data.message : ''
    return /suspended/i.test(message) ? message : null
  } catch {
    return null
  }
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

  // A suspension is a 403, not a 401, so none of the renewal machinery below applies —
  // and without this the session simply carried on with every request refused. What the
  // suspended person saw was an app that opened and then showed nothing, because the
  // dashboard's loaders swallow their errors. Ending the session here is what turns
  // that into being told.
  if (res.status === 403 && !NO_RETRY.some((path) => url.includes(path))) {
    const suspended = await isSuspensionResponse(res)
    if (suspended) {
      sessionExpired(suspended)
      return res
    }
  }

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
