/**
 * Trakt.tv sync: OAuth device flow, scrobbling, and watched-history import.
 * The user supplies their own application client_id (trakt.tv/oauth/applications);
 * it can be set via Settings or the VITE_TRAKT_CLIENT_ID env var.
 */

const API = 'https://api.trakt.tv'
const CLIENT_ID_KEY = 'trakt_client_id'
const TOKEN_KEY = 'trakt_access_token'
const REFRESH_KEY = 'trakt_refresh_token'

export interface TraktDeviceCode {
  device_code: string
  user_code: string
  verification_url: string
  expires_in: number
  interval: number
}

export interface TraktScrobbleMedia {
  movie?: { title?: string; year?: number; ids?: { tmdb?: number } }
  show?: { title?: string; year?: number; ids?: { tmdb?: number } }
  episode?: { season: number; number: number }
}

export interface TraktWatchedMovie {
  plays: number
  movie: { title?: string; ids?: { tmdb?: number } }
}

export interface TraktWatchedShow {
  show: { title?: string; ids?: { tmdb?: number } }
  seasons: Array<{
    number: number
    episodes: Array<{ number: number; plays: number }>
  }>
}

export function getTraktClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) || import.meta.env.VITE_TRAKT_CLIENT_ID || ''
}

export function setTraktClientId(id: string): void {
  localStorage.setItem(CLIENT_ID_KEY, id.trim())
}

export function isTraktConnected(): boolean {
  return !!localStorage.getItem(TOKEN_KEY)
}

export function disconnectTrakt(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

function headers(withAuth: boolean): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': getTraktClientId(),
  }
  const token = localStorage.getItem(TOKEN_KEY)
  if (withAuth && token) h.Authorization = `Bearer ${token}`
  return h
}

async function refreshTokens(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh || !getTraktClientId()) return false
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: headers(false),
    body: JSON.stringify({
      refresh_token: refresh,
      client_id: getTraktClientId(),
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return false
  const data = await res.json()
  localStorage.setItem(TOKEN_KEY, data.access_token)
  localStorage.setItem(REFRESH_KEY, data.refresh_token)
  return true
}

async function authorizedFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers: headers(true),
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (res.status === 401) {
    const refreshed = await refreshTokens().catch(() => false)
    if (!refreshed) {
      disconnectTrakt()
      throw new Error('Trakt session expired — reconnect in Settings')
    }
    res = await fetch(`${API}${path}`, {
      method: options.method ?? 'GET',
      headers: headers(true),
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  }
  if (!res.ok) throw new Error(`Trakt ${path}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

// ─── Device auth flow ─────────────────────────────────────────────────────────

export async function startDeviceAuth(): Promise<TraktDeviceCode> {
  if (!getTraktClientId()) throw new Error('Enter your Trakt client ID first')
  const res = await fetch(`${API}/oauth/device/code`, {
    method: 'POST',
    headers: headers(false),
    body: JSON.stringify({ client_id: getTraktClientId() }),
  })
  if (!res.ok) throw new Error(`Device auth failed: HTTP ${res.status}`)
  return res.json()
}

// Polls until the user approves, denies, or the code expires
export async function pollDeviceToken(
  code: TraktDeviceCode,
  signal: { cancelled: boolean },
): Promise<void> {
  const interval = Math.max((code.interval ?? 5) * 1000, 3000)
  const deadline = Date.now() + (code.expires_in ?? 600) * 1000

  while (!signal.cancelled && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval))
    if (signal.cancelled) return

    const res = await fetch(`${API}/oauth/device/token`, {
      method: 'POST',
      headers: headers(false),
      body: JSON.stringify({ code: code.device_code, client_id: getTraktClientId() }),
    })

    if (res.status === 200) {
      const data = await res.json()
      localStorage.setItem(TOKEN_KEY, data.access_token)
      localStorage.setItem(REFRESH_KEY, data.refresh_token)
      return
    }
    if (res.status === 400) continue // pending authorization
    if (res.status === 409) continue // already used — keep waiting for another
    if (res.status === 418) throw new Error('Authorization denied')
    if (res.status === 410) throw new Error('Device code expired — try again')
    // 429 or transient errors — keep polling
  }
  throw new Error('Timed out waiting for authorization')
}

// ─── Scrobbling ───────────────────────────────────────────────────────────────

export async function scrobble(
  action: 'start' | 'pause' | 'stop',
  media: TraktScrobbleMedia,
  progressPercent: number,
): Promise<void> {
  if (!isTraktConnected()) return
  await authorizedFetch(`/scrobble/${action}`, {
    method: 'POST',
    body: { progress: Math.max(0, Math.min(100, Math.round(progressPercent))), ...media },
  })
}

// ─── Watched history ──────────────────────────────────────────────────────────

export async function fetchWatchedMovies(): Promise<TraktWatchedMovie[]> {
  return authorizedFetch<TraktWatchedMovie[]>('/sync/watched/movies')
}

export async function fetchWatchedShows(): Promise<TraktWatchedShow[]> {
  return authorizedFetch<TraktWatchedShow[]>('/sync/watched/shows')
}
