import Dexie, { type Table } from 'dexie'
import type { Movie, TVShow, WatchProgress, MetadataCacheEntry } from '../types'

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
  metaCache!: Table<MetadataCacheEntry, string>

  constructor() {
    super('NotflixDB')
    this.version(1).stores({
      movies: 'id, title, addedAt, tmdbId',
      tvShows: 'id, title, tmdbId',
      watchProgress: 'fileId, lastWatched',
      favorites: 'id, type, addedAt',
      watchlist: 'id, type, addedAt',
    })
    // Upgrade from older schemas that may not have had these tables
    this.version(2).stores({
      movies: 'id, title, addedAt, tmdbId',
      tvShows: 'id, title, tmdbId',
      watchProgress: 'fileId, lastWatched',
      favorites: 'id, type, addedAt',
      watchlist: 'id, type, addedAt',
    })
    // Metadata cache for faster rescans
    this.version(3).stores({
      metaCache: 'key, cachedAt',
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

export async function appendTVShow(show: TVShow): Promise<void> {
  await db.tvShows.put(show)
}

export async function clearLibrary(): Promise<void> {
  await db.transaction('rw', db.movies, db.tvShows, async () => {
    await db.movies.clear()
    await db.tvShows.clear()
  })
}

export async function deleteMovie(id: string): Promise<void> {
  await db.movies.delete(id)
}

export async function deleteTVShow(id: string): Promise<void> {
  await db.tvShows.delete(id)
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

// ─── Metadata cache helpers ───────────────────────────────────────────────────

export async function getCachedMeta(key: string): Promise<MetadataCacheEntry | undefined> {
  return db.metaCache.get(key)
}

export async function putCachedMeta(entry: MetadataCacheEntry): Promise<void> {
  await db.metaCache.put(entry)
}

export async function clearMetaCache(): Promise<void> {
  await db.metaCache.clear()
}

// ─── Mark watched helpers ─────────────────────────────────────────────────────

export async function setFileWatched(fileId: string): Promise<void> {
  await db.watchProgress.put({ fileId, position: 1, duration: 1, lastWatched: Date.now() })
}

export async function setFilesWatched(fileIds: string[]): Promise<void> {
  const now = Date.now()
  await db.watchProgress.bulkPut(fileIds.map(fileId => ({ fileId, position: 1, duration: 1, lastWatched: now })))
}

// ─── Export / import helpers ──────────────────────────────────────────────────

export interface LibraryBackup {
  version: number
  exportedAt: number
  movies: Movie[]
  tvShows: TVShow[]
  favorites: FavoriteRecord[]
  watchlist: WatchlistRecord[]
  watchProgress: WatchProgress[]
}

export async function exportLibraryData(): Promise<LibraryBackup> {
  const [movies, tvShows, favorites, watchlist, watchProgress] = await Promise.all([
    db.movies.toArray(),
    db.tvShows.toArray(),
    db.favorites.toArray(),
    db.watchlist.toArray(),
    db.watchProgress.toArray(),
  ])
  return { version: 1, exportedAt: Date.now(), movies, tvShows, favorites, watchlist, watchProgress }
}

export async function importLibraryData(backup: LibraryBackup): Promise<void> {
  await db.transaction('rw', db.movies, db.tvShows, db.favorites, db.watchlist, db.watchProgress, async () => {
    await db.movies.clear()
    await db.tvShows.clear()
    if (backup.favorites?.length) await db.favorites.bulkPut(backup.favorites)
    if (backup.watchlist?.length) await db.watchlist.bulkPut(backup.watchlist)
    if (backup.watchProgress?.length) await db.watchProgress.bulkPut(backup.watchProgress)
    if (backup.movies?.length) await db.movies.bulkPut(backup.movies)
    if (backup.tvShows?.length) await db.tvShows.bulkPut(backup.tvShows)
  })
}
