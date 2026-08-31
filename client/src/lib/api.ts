import { API_URL } from './config'
import { apiFetch } from './session'

export async function registerAgent(data: { name: string; email: string; password: string }) {
  const res = await apiFetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Registration failed')
  }
  return res.json()
}

export async function loginAgent(data: { email: string; password: string }) {
  const res = await apiFetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Login failed')
  }
  return res.json()
}

export async function getMe(token: string) {
  const res = await apiFetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch profile')
  return res.json()
}

export async function fetchNotifications(token: string) {
  const res = await apiFetch(`${API_URL}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch notifications')
  return res.json()
}

export async function markNotificationRead(token: string, id: string) {
  return fetch(`${API_URL}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function markAllNotificationsRead(token: string) {
  return fetch(`${API_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function sendTestNotification(token: string) {
  return fetch(`${API_URL}/notifications/test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
export async function createListing(token: string, formData: FormData) {
  const res = await apiFetch(`${API_URL}/listings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Failed to create listing')
  }
  return res.json()
}

export async function fetchMyListings(token: string) {
  const res = await apiFetch(`${API_URL}/listings/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch listings')
  return res.json()
}
export async function generateDescription(
  token: string,
  data: { title: string; price: number; lotArea?: number; floorArea?: number; status: string; amenities: string[] },
) {
  const res = await apiFetch(`${API_URL}/ai/generate-description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Failed to generate description')
  }
  return res.json()
}
export async function fetchAllListings() {
  const res = await apiFetch(`${API_URL}/listings`)
  if (!res.ok) throw new Error('Failed to fetch listings')
  return res.json()
}

export async function fetchListing(id: string, token?: string | null) {
  // The token is optional and the route stays public; it is sent so the server can tell
  // whose view this is, which is what lets it skip the owner's own visits.
  const res = await apiFetch(`${API_URL}/listings/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'This property is no longer listed' : 'Failed to load property')
  }
  return res.json()
}

export async function deleteListing(token: string, id: string) {
  const res = await apiFetch(`${API_URL}/listings/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to delete listing')
  return res.json()
}

export async function updateListing(token: string, id: string, formData: FormData) {
  const res = await apiFetch(`${API_URL}/listings/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Failed to update listing')
  }
  return res.json()
}

export async function fetchReelTemplates(token: string) {
  const res = await apiFetch(`${API_URL}/reels/templates`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not load templates')
  return res.json()
}

export async function generateReel(
  token: string,
  listingId: string,
  template?: string,
  cinematic = false,
) {
  const res = await apiFetch(`${API_URL}/reels/generate/${listingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ template, cinematic }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Failed to generate reel')
  }
  return res.json()
}

export async function fetchMyReels(token: string) {
  const res = await apiFetch(`${API_URL}/reels/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch reels')
  return res.json()
}

/* -------------------------------------------------------------- password reset */

/** Always resolves the same way, whether or not the address is registered. */
export async function requestPasswordReset(email: string) {
  const res = await apiFetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error('Could not send the reset link. Try again in a moment.')
  return res.json()
}

export async function resetPassword(token: string, password: string) {
  const res = await apiFetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'This reset link is no longer valid')
  }
  return res.json()
}

/* ------------------------------------------------------------------ messages */

const authJson = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})

export async function fetchConversations(token: string) {
  const res = await apiFetch(`${API_URL}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load conversations')
  return res.json()
}

/**
 * Removes a thread from your own inbox.
 *
 * The other participant keeps theirs — the server hides it per side rather than
 * deleting the shared row, so this never destroys someone else's history.
 */
export async function deleteConversation(token: string, id: string) {
  const res = await apiFetch(`${API_URL}/messages/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not remove that conversation')
  return res.json()
}

export async function fetchConversation(token: string, id: string) {
  const res = await apiFetch(`${API_URL}/messages/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load this conversation')
  return res.json()
}

/** Opens (or reuses) the thread with a property's owner. */
export async function openConversation(token: string, listingId: string) {
  const res = await apiFetch(`${API_URL}/messages/open/${listingId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Could not start this conversation')
  }
  return res.json()
}

export async function sendMessage(token: string, conversationId: string, content: string) {
  const res = await apiFetch(`${API_URL}/messages/${conversationId}`, {
    method: 'POST',
    headers: authJson(token),
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Message could not be sent')
  }
  return res.json()
}

export async function markConversationRead(token: string, conversationId: string) {
  const res = await apiFetch(`${API_URL}/messages/${conversationId}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to mark as read')
  return res.json()
}

/** Everyone's finished reels, for the browsing feed. */
export async function fetchReelsFeed(token: string) {
  const res = await apiFetch(`${API_URL}/reels/feed`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch the reels feed')
  return res.json()
}

export async function updateProfile(token: string, formData: FormData) {
  const res = await apiFetch(`${API_URL}/auth/profile`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(Array.isArray(err.message) ? err.message[0] : err.message || 'Update failed')
  }
  return res.json()
}

export async function changePassword(
  token: string,
  data: { currentPassword: string; newPassword: string },
) {
  const res = await apiFetch(`${API_URL}/auth/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(Array.isArray(err.message) ? err.message[0] : err.message || 'Update failed')
  }
  return res.json()
}

export async function updateNotificationPrefs(
  token: string,
  prefs: Record<string, boolean>,
) {
  const res = await apiFetch(`${API_URL}/auth/notifications`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(prefs),
  })
  if (!res.ok) throw new Error('Could not save notification settings')
  return res.json()
}

export async function fetchChatHistory(token: string) {
  const res = await apiFetch(`${API_URL}/ai/chat`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load conversation')
  return res.json()
}

export async function sendChatMessage(token: string, formData: FormData) {
  const res = await apiFetch(`${API_URL}/ai/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Amicus could not reply')
  }
  return res.json()
}

export async function clearChatHistory(token: string) {
  const res = await apiFetch(`${API_URL}/ai/chat`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to clear conversation')
  return res.json()
}

export async function generateQuickReel(token: string, formData: FormData) {
  const res = await apiFetch(`${API_URL}/reels/quick`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Failed to generate reel')
  }
  return res.json()
}

export async function regenerateReel(token: string, id: string) {
  const res = await apiFetch(`${API_URL}/reels/${id}/regenerate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Could not regenerate this reel')
  }
  return res.json()
}

export async function deleteReel(token: string, id: string) {
  const res = await apiFetch(`${API_URL}/reels/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not delete this reel')
  return res.json()
}

// The download route is auth-guarded, so it can't just be an <a href>. Pull the file
// as a blob with the token attached, then hand it to the browser as a save.
export async function downloadReel(token: string, id: string) {
  const res = await apiFetch(`${API_URL}/reels/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to download reel')

  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : 'reelink-reel.mp4'

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
/** Daily view counts for the signed-in agent's listings, for the dashboard trend. */
export async function fetchViewStats(token: string) {
  const res = await apiFetch(`${API_URL}/listings/stats/views`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not load view stats')
  return res.json() as Promise<{
    series: { date: string; count: number }[]
    total: number
    recent: number
    previous: number
    trendPct: number | null
  }>
}

/** Remaining reel allowances for today, so the UI can show them rather than assume. */
export async function fetchReelQuota(token: string) {
  const res = await apiFetch(`${API_URL}/reels/quota`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not load your reel allowance')
  return res.json() as Promise<{
    cinematic: { used: number; limit: number; remaining: number; available: boolean }
    reels: {
      usedToday: number
      limitPerDay: number
      usedThisHour: number
      limitPerHour: number
    }
  }>
}

/* --------------------------------------------------------------------- admin */

const adminHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})

/** Every admin call 403s for non-staff; the UI never sees the data to begin with. */
async function adminRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}/admin${path}`, {
    ...init,
    headers: adminHeaders(token),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'That action was not allowed')
  }
  return res.json() as Promise<T>
}

export type AdminMetrics = {
  users: { total: number; newThisWeek: number; verified: number; suspended: number }
  listings: { total: number; newThisWeek: number }
  reels: { total: number; ready: number; failed: number }
  renders: { today: number; aiThisWeek: number }
  aiSpend: { clipsThisWeek: number; estimatedUsd: number }
  engagement: { viewsThisWeek: number; conversations: number }
  queue: { pendingVerifications: number }
}

export type AdminUser = {
  id: string
  name: string
  email: string
  phone?: string | null
  avatarUrl?: string | null
  role: string
  isVerified: boolean
  suspendedAt?: string | null
  suspendedReason?: string | null
  createdAt: string
  lastSeenAt?: string | null
  _count: { listings: number; reels: number }
}

export type VerificationRequest = {
  id: string
  licenseNumber: string
  status: string
  reviewNote?: string | null
  createdAt: string
  reviewedAt?: string | null
  user: AdminUser
}

export const fetchAdminMetrics = (token: string) =>
  adminRequest<AdminMetrics>('/metrics', token)

export const fetchAdminUsers = (token: string, search = '', page = 0) =>
  adminRequest<{ items: AdminUser[]; total: number; page: number; pageSize: number }>(
    `/users?search=${encodeURIComponent(search)}&page=${page}`,
    token,
  )

export const setUserSuspension = (
  token: string,
  userId: string,
  suspended: boolean,
  reason?: string,
) =>
  adminRequest<AdminUser>(`/users/${userId}/suspension`, token, {
    method: 'PATCH',
    body: JSON.stringify({ suspended, reason }),
  })

export const fetchVerifications = (token: string, status = 'pending') =>
  adminRequest<VerificationRequest[]>(`/verifications?status=${status}`, token)

export const reviewVerification = (
  token: string,
  id: string,
  approve: boolean,
  note?: string,
) =>
  adminRequest(`/verifications/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ approve, note }),
  })

/* ------------------------------------------------ verification (agent side) */

export async function fetchMyVerification(token: string) {
  const res = await apiFetch(`${API_URL}/verification/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not load your verification status')
  return res.json() as Promise<{
    id: string
    status: string
    licenseNumber: string
    reviewNote?: string | null
    createdAt: string
    reviewedAt?: string | null
  } | null>
}

export async function submitVerification(token: string, licenseNumber: string) {
  const res = await apiFetch(`${API_URL}/verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ licenseNumber }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Could not submit your request')
  }
  return res.json()
}
