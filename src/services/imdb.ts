/**
 * imdbapi.dev REST client + adapter to TMDB-compatible shapes.
 * Base URL: https://api.imdbapi.dev
 * No API key required.
 *
 * TMDB-only features that imdbapi.dev does NOT provide:
 *  - YouTube trailer keys (videos exist but aren't YouTube)
 *  - Taglines
 *  - Language-localized metadata (English only)
 *  - Similar/recommended titles
 */

import type {
  TMDBMovieDetail,
  TMDBCredits,
  TMDBVideosResponse,
  TMDBImagesResponse,
  TMDBSeasonDetail,
  TMDBEpisode,
} from '../types'

// Always use the Vite proxy path — imdbapi.dev does not send CORS headers,
// so direct browser requests are blocked. Works with both `vite dev` and `vite preview`.
const BASE_URL = '/imdbapi'

// ─── Raw imdbapi.dev types ────────────────────────────────────────────────────

interface IMDBTitle {
  id: string
  type?: string
  primaryTitle?: string
  originalTitle?: string
  primaryImage?: { url: string; width?: number; height?: number }
  startYear?: number
  endYear?: number
  runtimeSeconds?: number
  genres?: string[]
  rating?: { aggregateRating?: number; voteCount?: number }
  plot?: string
  directors?: IMDBNameRef[]
  writers?: IMDBNameRef[]
  stars?: IMDBNameRef[]
  originCountries?: { code: string; text: string }[]
}

interface IMDBNameRef {
  id: string
  displayName?: string
  primaryImage?: { url: string }
}

interface IMDBCredit {
  name?: IMDBNameRef
  category?: string
  characters?: string[]
}

interface IMDBImage {
  url: string
  type?: string
  width?: number
  height?: number
}

interface IMDBSeasonEntry {
  number: number
  episodeCount?: number
}

interface IMDBEpisodeRaw {
  id?: string
  primaryTitle?: string
  plot?: string
  primaryImage?: { url: string }
  runtime?: { seconds?: number }
  rating?: { aggregateRating?: number }
  season?: number
  episode?: number
  releaseDate?: { day?: number; month?: number; year?: number }
}

// ─── HTTP client ──────────────────────────────────────────────────────────────

async function imdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`imdbapi.dev ${path}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

// Convert "tt1234567" → numeric (strip "tt" prefix). Used as a stable fake TMDB-compatible id.
function ttToInt(id: string): number {
  return parseInt(id.replace(/^[a-z]+/i, ''), 10) || 0
}

// ─── Title adapter ────────────────────────────────────────────────────────────

function adaptTitle(t: IMDBTitle): TMDBMovieDetail {
  const isTV = t.type === 'tvSeries' || t.type === 'tvMiniSeries' || t.type === 'tvSpecial'
  const year = t.startYear ? String(t.startYear) : undefined
  const dateStr = year ? `${year}-01-01` : undefined

  return {
    id: ttToInt(t.id),
    imdb_id: t.id,
    title: isTV ? undefined : (t.primaryTitle ?? ''),
    name: isTV ? (t.primaryTitle ?? '') : undefined,
    overview: t.plot,
    // Full URL stored directly — posterUrl() handles both full URLs and TMDB paths
    poster_path: t.primaryImage?.url ?? undefined,
    backdrop_path: undefined, // fetched separately in getImagesIMDB
    release_date: isTV ? undefined : dateStr,
    first_air_date: isTV ? dateStr : undefined,
    vote_average: t.rating?.aggregateRating,
    runtime: t.runtimeSeconds ? Math.round(t.runtimeSeconds / 60) : undefined,
    genres: t.genres?.map((g, i) => ({ id: i, name: g })) ?? [],
    tagline: undefined, // not available on imdbapi.dev
    status: undefined,
  }
}

// ─── Search ────────────────────────────────────────────────────────────────────

interface IMDBSearchResponse {
  titles?: IMDBTitle[]
}

async function searchTitles(query: string, limit = 20): Promise<IMDBTitle[]> {
  const res = await imdbFetch<IMDBSearchResponse>('/search/titles', { query, limit: String(limit) })
  return res.titles ?? []
}

function scoreIMDB(t: IMDBTitle, query: string, year?: string): number {
  const pt = (t.primaryTitle ?? '').toLowerCase()
  const ot = (t.originalTitle ?? '').toLowerCase()
  const q = query.toLowerCase()
  let score = 0

  if (pt === q || ot === q) score += 100
  else if (pt.startsWith(q) || ot.startsWith(q)) score += 80
  else if (pt.includes(q) || ot.includes(q)) score += 60
  else {
    const qWords = q.split(/\s+/).filter((w) => w.length > 2)
    const tWords = pt.split(/\s+/)
    const overlap = qWords.filter((w) => tWords.includes(w)).length
    score += Math.floor((overlap / Math.max(qWords.length, 1)) * 40)
  }

  if (year && t.startYear) {
    const diff = Math.abs(t.startYear - parseInt(year))
    if (diff === 0) score += 30
    else if (diff === 1) score += 10
    else score -= 15
  }

  return score
}

const MOVIE_TYPES = new Set(['movie', 'short', 'tvMovie'])
const TV_TYPES = new Set(['tvSeries', 'tvMiniSeries', 'tvSpecial'])

export async function searchMovieBestIMDB(
  title: string,
  year?: string,
  altTitle?: string,
): Promise<TMDBMovieDetail | null> {
  const attempts = [
    { q: title, y: year },
    { q: title, y: undefined },
    ...(altTitle ? [{ q: altTitle, y: year }, { q: altTitle, y: undefined }] : []),
  ]

  for (const { q, y } of attempts) {
    if (!q) continue
    try {
      const results = await searchTitles(q)
      const movies = results.filter((r) => !r.type || MOVIE_TYPES.has(r.type))
      if (!movies.length) continue
      const best = movies
        .map((r) => ({ r, s: scoreIMDB(r, q, y) }))
        .filter(({ s }) => s >= 40)
        .sort((a, b) => b.s - a.s)[0]
      if (best) return adaptTitle(best.r)
    } catch {
      // try next attempt
    }
  }
  return null
}

export async function searchTVBestIMDB(
  title: string,
  year?: string,
  altTitle?: string,
): Promise<TMDBMovieDetail | null> {
  const attempts = [
    { q: title, y: year },
    { q: title, y: undefined },
    ...(altTitle ? [{ q: altTitle, y: year }, { q: altTitle, y: undefined }] : []),
  ]

  for (const { q, y } of attempts) {
    if (!q) continue
    try {
      const results = await searchTitles(q)
      const shows = results.filter((r) => !r.type || TV_TYPES.has(r.type))
      if (!shows.length) continue
      const best = shows
        .map((r) => ({ r, s: scoreIMDB(r, q, y) }))
        .filter(({ s }) => s >= 40)
        .sort((a, b) => b.s - a.s)[0]
      if (best) {
        // For TV shows, fetch full detail to get seasons
        return getTVDetailIMDB(best.r.id)
      }
    } catch {
      // try next attempt
    }
  }
  return null
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export async function getTitleByIdIMDB(imdbId: string): Promise<TMDBMovieDetail | null> {
  try {
    const t = await imdbFetch<IMDBTitle>(`/titles/${imdbId}`)
    return adaptTitle(t)
  } catch {
    return null
  }
}

export async function getTVDetailIMDB(imdbId: string): Promise<TMDBMovieDetail | null> {
  try {
    const t = await imdbFetch<IMDBTitle>(`/titles/${imdbId}`)
    const detail = adaptTitle(t)

    // Fetch seasons to populate number_of_seasons and seasons[]
    try {
      const res = await imdbFetch<{ seasons?: IMDBSeasonEntry[] }>(`/titles/${imdbId}/seasons`)
      const seasons = res.seasons ?? []
      detail.number_of_seasons = seasons.length
      detail.number_of_episodes = seasons.reduce((sum, s) => sum + (s.episodeCount ?? 0), 0)
      detail.seasons = seasons.map((s) => ({
        id: s.number,
        name: `Season ${s.number}`,
        season_number: s.number,
        episode_count: s.episodeCount,
      }))
    } catch {
      // seasons unavailable — continue without them
    }

    return detail
  } catch {
    return null
  }
}

// ─── Credits ──────────────────────────────────────────────────────────────────

interface IMDBCreditsResponse {
  credits?: IMDBCredit[]
}

const CATEGORY_TO_JOB: Record<string, string> = {
  director: 'Director',
  writer: 'Writer',
  producer: 'Producer',
  composer: 'Original Music Composer',
  cinematographer: 'Director of Photography',
  editor: 'Editor',
}

const CATEGORY_TO_DEPT: Record<string, string> = {
  director: 'Directing',
  writer: 'Writing',
  producer: 'Production',
  composer: 'Sound',
  cinematographer: 'Camera',
  editor: 'Editing',
}

export async function getCreditsIMDB(imdbId: string): Promise<TMDBCredits> {
  try {
    const res = await imdbFetch<IMDBCreditsResponse>(`/titles/${imdbId}/credits`, { pageSize: '60' })
    const credits = res.credits ?? []

    const cast = credits
      .filter((c) => c.category === 'actor' || c.category === 'actress')
      .map((c, i) => ({
        id: ttToInt(c.name?.id ?? `nm${i}`),
        name: c.name?.displayName ?? '',
        character: c.characters?.[0],
        profile_path: c.name?.primaryImage?.url ?? undefined,
        order: i,
      }))

    const crew = credits
      .filter((c) => c.category !== 'actor' && c.category !== 'actress')
      .map((c, i) => ({
        id: ttToInt(c.name?.id ?? `nm${i}`),
        name: c.name?.displayName ?? '',
        job: CATEGORY_TO_JOB[c.category ?? ''] ?? c.category ?? 'Unknown',
        department: CATEGORY_TO_DEPT[c.category ?? ''] ?? 'Crew',
        profile_path: c.name?.primaryImage?.url ?? undefined,
      }))

    return { cast, crew }
  } catch {
    return { cast: [], crew: [] }
  }
}

// ─── Videos ───────────────────────────────────────────────────────────────────

// imdbapi.dev videos are IMDb-hosted, not YouTube — trailers won't embed.
export async function getVideosIMDB(_imdbId: string): Promise<TMDBVideosResponse> {
  return { results: [] }
}

// ─── Images ───────────────────────────────────────────────────────────────────

interface IMDBImagesResponse {
  images?: IMDBImage[]
}

export async function getImagesIMDB(imdbId: string): Promise<TMDBImagesResponse> {
  try {
    const res = await imdbFetch<IMDBImagesResponse>(`/titles/${imdbId}/images`, { pageSize: '20' })
    const images = res.images ?? []

    // Map by type. IMDb type names may vary — try common ones.
    const byType = (types: string[]) =>
      images
        .filter((i) => !i.type || types.includes(i.type))
        .map((i) => ({ file_path: i.url, iso_639_1: null as string | null }))

    return {
      backdrops: byType(['background', 'backdrop', 'still_frame', 'production_art']),
      posters: byType(['poster', 'primary']),
      logos: byType(['logo']),
    }
  } catch {
    return {}
  }
}

// ─── Season detail ────────────────────────────────────────────────────────────

interface IMDBEpisodesResponse {
  episodes?: IMDBEpisodeRaw[]
}

export async function getSeasonDetailIMDB(imdbId: string, season: number): Promise<TMDBSeasonDetail> {
  try {
    const res = await imdbFetch<IMDBEpisodesResponse>(`/titles/${imdbId}/episodes`, {
      season: String(season),
    })
    const episodes: TMDBEpisode[] = (res.episodes ?? []).map((e) => {
      const rd = e.releaseDate
      const airDate = rd?.year
        ? `${rd.year}-${String(rd.month ?? 1).padStart(2, '0')}-${String(rd.day ?? 1).padStart(2, '0')}`
        : undefined
      return {
        id: ttToInt(e.id ?? ''),
        name: e.primaryTitle ?? `Episode ${e.episode ?? '?'}`,
        overview: e.plot,
        episode_number: e.episode ?? 0,
        season_number: e.season ?? season,
        air_date: airDate,
        still_path: e.primaryImage?.url ?? undefined,
        vote_average: e.rating?.aggregateRating,
        runtime: e.runtime?.seconds ? Math.round(e.runtime.seconds / 60) : undefined,
      }
    })
    return { id: season, name: `Season ${season}`, season_number: season, episodes }
  } catch {
    return { id: season, name: `Season ${season}`, season_number: season, episodes: [] }
  }
}
