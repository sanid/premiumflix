/**
 * Metadata facade — routes requests to TMDB (when the Vercel proxy is active or
 * the user has set their own key in Settings) or imdbapi.dev as a fallback.
 *
 * Features only available with TMDB:
 *  - YouTube trailer keys
 *  - Taglines
 *  - Language-localized metadata
 *  - Logo images (more reliable)
 *  - Similar/recommended titles
 */

import type { TMDBMovieDetail, TMDBCredits, TMDBVideosResponse, TMDBImagesResponse, TMDBSeasonDetail } from '../types'
import * as tmdb from './tmdb'
import * as imdb from './imdb'

export function isTMDB(): boolean {
  // Server-side proxy active (Vercel deployment with TMDB_API_KEY set server-side)
  if (import.meta.env.VITE_TMDB_USE_PROXY === 'true') return true
  // User's own key set in Settings
  return !!(localStorage.getItem('tmdb_api_key')?.trim())
}

// ─── Search ────────────────────────────────────────────────────────────────────

export async function searchMovieBest(
  title: string,
  year?: string,
  altTitle?: string,
): Promise<TMDBMovieDetail | null> {
  return isTMDB()
    ? tmdb.searchMovieBest(title, year, altTitle)
    : imdb.searchMovieBestIMDB(title, year, altTitle)
}

export async function searchTVBest(
  title: string,
  year?: string,
  altTitle?: string,
): Promise<TMDBMovieDetail | null> {
  return isTMDB()
    ? tmdb.searchTVBest(title, year, altTitle)
    : imdb.searchTVBestIMDB(title, year, altTitle)
}

/** Direct TMDB search — returns raw paginated results for manual selection */
export async function searchMovieRaw(query: string, year?: string) {
  return isTMDB() ? tmdb.searchMovie(query, year) : { results: [] }
}

export async function searchTVRaw(query: string, year?: string) {
  return isTMDB() ? tmdb.searchTV(query, year) : { results: [] }
}

export async function getMovieDetailByTmdbId(tmdbId: number): Promise<TMDBMovieDetail> {
  return tmdb.movieDetail(tmdbId)
}

export async function getTVDetailByTmdbId(tmdbId: number): Promise<TMDBMovieDetail> {
  return tmdb.tvDetail(tmdbId)
}

// ─── Detail (fetch by stored ID) ──────────────────────────────────────────────

export async function getMovieDetailById(
  tmdbId: number | undefined,
  imdbId: string | undefined,
): Promise<TMDBMovieDetail | null> {
  try {
    if (isTMDB() && tmdbId) return await tmdb.movieDetail(tmdbId)
    if (imdbId) return await imdb.getTitleByIdIMDB(imdbId)
  } catch {
    // fall through
  }
  return null
}

export async function getTVDetailById(
  tmdbId: number | undefined,
  imdbId: string | undefined,
): Promise<TMDBMovieDetail | null> {
  try {
    if (isTMDB() && tmdbId) return await tmdb.tvDetail(tmdbId)
    if (imdbId) return await imdb.getTVDetailIMDB(imdbId)
  } catch {
    // fall through
  }
  return null
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export async function getCredits(
  detail: TMDBMovieDetail,
  type: 'movie' | 'tv',
): Promise<TMDBCredits> {
  try {
    if (isTMDB()) {
      return type === 'movie'
        ? await tmdb.movieCredits(detail.id)
        : await tmdb.tvCredits(detail.id)
    }
    if (detail.imdb_id) return await imdb.getCreditsIMDB(detail.imdb_id)
  } catch {
    // fall through
  }
  return { cast: [], crew: [] }
}

// ─── Videos ───────────────────────────────────────────────────────────────────

export async function getVideos(
  detail: TMDBMovieDetail,
  type: 'movie' | 'tv',
): Promise<TMDBVideosResponse> {
  try {
    if (isTMDB()) {
      return type === 'movie'
        ? await tmdb.movieVideos(detail.id)
        : await tmdb.tvVideos(detail.id)
    }
    if (detail.imdb_id) return await imdb.getVideosIMDB(detail.imdb_id)
  } catch {
    // fall through
  }
  return { results: [] }
}

// ─── Images ───────────────────────────────────────────────────────────────────

export async function getImages(
  detail: TMDBMovieDetail,
  type: 'movie' | 'tv',
): Promise<TMDBImagesResponse> {
  try {
    if (isTMDB()) {
      return type === 'movie'
        ? await tmdb.movieImages(detail.id)
        : await tmdb.tvImages(detail.id)
    }
    if (detail.imdb_id) return await imdb.getImagesIMDB(detail.imdb_id)
  } catch {
    // fall through
  }
  return {}
}

// ─── Season detail ────────────────────────────────────────────────────────────

export async function getSeasonDetail(
  detail: TMDBMovieDetail,
  season: number,
): Promise<TMDBSeasonDetail> {
  try {
    if (isTMDB()) return await tmdb.seasonDetail(detail.id, season)
    if (detail.imdb_id) return await imdb.getSeasonDetailIMDB(detail.imdb_id, season)
  } catch {
    // fall through
  }
  return { id: season, name: `Season ${season}`, season_number: season, episodes: [] }
}
