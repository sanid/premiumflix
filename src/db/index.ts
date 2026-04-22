import Dexie, { type Table } from 'dexie'
import type { Movie, TVShow, WatchProgress } from '../types'

export interface FavoriteRecord {
  id: string
  type: 'movie' | 'show'
  addedAt: number
}

export interface WatchlistRecord {
  id: string
  type: 'movie' | 'show'
  addedAt: number
}

class PremiumflixDB extends Dexie {
  movies!: Table<Movie>
  tvShows!: Table<TVShow>
  watchProgress!: Table<WatchProgress>
  favorites!: Table<FavoriteRecord>
  watchlist!: Table<WatchlistRecord>

  constructor() {
    super('PremiumflixDB')
    this.version(1).stores({
      movies: 'id, title, addedAt, tmdbId',
      tvShows: 'id, title, tmdbId',
      watchProgress: 'fileId, lastWatched',
      favorites: 'id, type, addedAt',
      watchlist: 'id, type, addedAt',
    })
  }
}

export const db = new PremiumflixDB()

// ─── Library helpers ──────────────────────────────────────────────────────────

export async function saveLibrary(movies: Movie[], tvShows: TVShow[]): Promise<void> {
  await db.transaction('rw', db.movies, db.tvShows, async () => {
    await db.movies.clear()
    await db.tvShows.clear()
    await db.movies.bulkAdd(movies)
    await db.tvShows.bulkAdd(tvShows)
  })
}

export async function loadLibrary(): Promise<{ movies: Movie[]; tvShows: TVShow[] }> {
  const [movies, tvShows] = await Promise.all([db.movies.toArray(), db.tvShows.toArray()])
  return { movies, tvShows }
}

export async function appendMovie(movie: Movie): Promise<void> {
  await db.movies.put(movie)
}

export async function clearLibrary(): Promise<void> {
  await db.transaction('rw', db.movies, db.tvShows, async () => {
    await db.movies.clear()
    await db.tvShows.clear()
  })
}

// ─── Watch progress helpers ───────────────────────────────────────────────────

export async function getProgress(fileId: string): Promise<WatchProgress | undefined> {
  return db.watchProgress.get(fileId)
}

export async function saveProgress(fileId: string, position: number, duration: number): Promise<void> {
  await db.watchProgress.put({ fileId, position, duration, lastWatched: Date.now() })
}

export async function getAllProgress(): Promise<WatchProgress[]> {
  return db.watchProgress.orderBy('lastWatched').reverse().toArray()
}

export async function clearProgress(fileId: string): Promise<void> {
  await db.watchProgress.delete(fileId)
}

// ─── Favorites helpers ────────────────────────────────────────────────────────

export async function isFavorite(id: string): Promise<boolean> {
  return (await db.favorites.get(id)) !== undefined
}

export async function toggleFavorite(id: string, type: 'movie' | 'show'): Promise<boolean> {
  const existing = await db.favorites.get(id)
  if (existing) {
    await db.favorites.delete(id)
    return false
  } else {
    await db.favorites.add({ id, type, addedAt: Date.now() })
    return true
  }
}

export async function getFavoriteIds(): Promise<Set<string>> {
  const all = await db.favorites.toArray()
  return new Set(all.map((f) => f.id))
}

// ─── Watchlist helpers ────────────────────────────────────────────────────────

export async function isOnWatchlist(id: string): Promise<boolean> {
  return (await db.watchlist.get(id)) !== undefined
}

export async function toggleWatchlist(id: string, type: 'movie' | 'show'): Promise<boolean> {
  const existing = await db.watchlist.get(id)
  if (existing) {
    await db.watchlist.delete(id)
    return false
  } else {
    await db.watchlist.add({ id, type, addedAt: Date.now() })
    return true
  }
}

export async function getWatchlistIds(): Promise<Set<string>> {
  const all = await db.watchlist.toArray()
  return new Set(all.map((w) => w.id))
}

export async function getWatchlistRecords(): Promise<WatchlistRecord[]> {
  return db.watchlist.orderBy('addedAt').reverse().toArray()
}
