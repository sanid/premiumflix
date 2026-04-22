import type {
  TMDBSearchResult,
  TMDBMovieDetail,
  TMDBCredits,
  TMDBVideosResponse,
  TMDBImagesResponse,
  TMDBSeasonDetail,
  TMDBMovie,
  TMDBImageInfo,
} from '../types'

const BASE_URL = 'https://api.themoviedb.org/3'

function getApiKey(): string {
  return localStorage.getItem('tmdb_api_key') || import.meta.env.VITE_TMDB_API_KEY || ''
}

function getLang(): string {
  return localStorage.getItem('tmdb_language') ?? 'en-US'
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}, retries = 3): Promise<T> {
  const url = new URL(`${BASE_URL}/${path}`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', getLang())
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString())
  if (res.status === 429 && retries > 0) {
    // Rate limited — exponential backoff
    const delay = (4 - retries) * 1500
    await new Promise((r) => setTimeout(r, delay))
    return tmdbFetch(path, params, retries - 1)
  }
  if (!res.ok) throw new Error(`TMDB ${path}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export async function searchMovie(query: string, year?: string): Promise<TMDBSearchResult> {
  const params: Record<string, string> = { query }
  if (year) params.year = year
  return tmdbFetch<TMDBSearchResult>('search/movie', params)
}

export async function searchTV(query: string, year?: string): Promise<TMDBSearchResult> {
  const params: Record<string, string> = { query }
  if (year) params.first_air_date_year = year ?? ''
  return tmdbFetch<TMDBSearchResult>('search/tv', params)
}

export async function movieDetail(id: number): Promise<TMDBMovieDetail> {
  return tmdbFetch<TMDBMovieDetail>(`movie/${id}`)
}

export async function tvDetail(id: number): Promise<TMDBMovieDetail> {
  return tmdbFetch<TMDBMovieDetail>(`tv/${id}`)
}

export async function movieCredits(id: number): Promise<TMDBCredits> {
  return tmdbFetch<TMDBCredits>(`movie/${id}/credits`)
}

export async function tvCredits(id: number): Promise<TMDBCredits> {
  return tmdbFetch<TMDBCredits>(`tv/${id}/credits`)
}

export async function movieVideos(id: number): Promise<TMDBVideosResponse> {
  return tmdbFetch<TMDBVideosResponse>(`movie/${id}/videos`)
}

export async function tvVideos(id: number): Promise<TMDBVideosResponse> {
  return tmdbFetch<TMDBVideosResponse>(`tv/${id}/videos`)
}

export async function movieImages(id: number): Promise<TMDBImagesResponse> {
  return tmdbFetch<TMDBImagesResponse>(`movie/${id}/images`, { include_image_language: 'en,de,null' })
}

export async function tvImages(id: number): Promise<TMDBImagesResponse> {
  return tmdbFetch<TMDBImagesResponse>(`tv/${id}/images`, { include_image_language: 'en,de,null' })
}

export async function seasonDetail(tvId: number, season: number): Promise<TMDBSeasonDetail> {
  return tmdbFetch<TMDBSeasonDetail>(`tv/${tvId}/season/${season}`)
}

export async function similarMovies(id: number): Promise<TMDBSearchResult> {
  return tmdbFetch<TMDBSearchResult>(`movie/${id}/similar`)
}

export async function similarTV(id: number): Promise<TMDBSearchResult> {
  return tmdbFetch<TMDBSearchResult>(`tv/${id}/similar`)
}

// ─── Best-match search logic ──────────────────────────────────────────────────

function scoreMatch(result: TMDBMovie, query: string, year?: string): number {
  const resultTitle = (result.title ?? result.name ?? '').toLowerCase()
  const resultOrig = (result.original_title ?? result.original_name ?? '').toLowerCase()
  const q = query.toLowerCase()
  let score = 0

  if (resultTitle === q || resultOrig === q) score += 100
  else if (resultTitle.startsWith(q) || resultOrig.startsWith(q)) score += 80
  else if (resultTitle.includes(q) || resultOrig.includes(q)) score += 60
  else {
    // Word overlap
    const qWords = q.split(/\s+/).filter((w) => w.length > 2)
    const tWords = resultTitle.split(/\s+/)
    const overlap = qWords.filter((w) => tWords.includes(w)).length
    score += Math.floor((overlap / Math.max(qWords.length, 1)) * 40)
  }

  if (year) {
    const resultDate = result.release_date ?? result.first_air_date ?? ''
    const resultYear = resultDate.slice(0, 4)
    if (resultYear === year) score += 30
    else if (Math.abs(parseInt(resultYear) - parseInt(year)) === 1) score += 10
    else if (resultYear && resultYear !== year) score -= 15
  }

  score += Math.min((result.popularity ?? 0) / 50, 20)
  return score
}

export async function searchMovieBest(
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
      const res = await searchMovie(q, y)
      if (!res.results.length) continue
      const best = res.results
        .map((r) => ({ r, s: scoreMatch(r, q, y) }))
        .filter(({ s }) => s >= 40)
        .sort((a, b) => b.s - a.s)[0]
      if (best) return movieDetail(best.r.id)
    } catch {
      // ignore and try next
    }
  }
  return null
}

export async function searchTVBest(
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
      const res = await searchTV(q, y)
      if (!res.results.length) continue
      const best = res.results
        .map((r) => ({ r, s: scoreMatch(r, q, y) }))
        .filter(({ s }) => s >= 40)
        .sort((a, b) => b.s - a.s)[0]
      if (best) return tvDetail(best.r.id)
    } catch {
      // ignore and try next
    }
  }
  return null
}

export function bestLogoPath(logos: TMDBImageInfo[]): string | undefined {
  const preferred: Array<string | null | undefined> = ['en', 'de', null, undefined]
  for (const lang of preferred) {
    const candidates = logos.filter((l) => l.iso_639_1 === lang)
    if (candidates.length) {
      return candidates.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))[0].file_path
    }
  }
  return logos[0]?.file_path
}

export function bestTrailerKey(videos: TMDBVideosResponse): string | undefined {
  const trailers = videos.results.filter(
    (v) => v.site === 'YouTube' && v.type === 'Trailer',
  )
  return (
    trailers.find((v) => v.official)?.key ??
    trailers[0]?.key
  )
}
