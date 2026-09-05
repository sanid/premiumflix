import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { Movie, TVShow, ScanFolderSelection } from '../types'
import { scanLibrary, type ScanProgress } from '../services/scanner'
import { saveLibrary, loadLibrary, clearLibrary, appendMovie, appendTVShow, deleteMovie, deleteTVShow, toggleFavorite as dbToggleFavorite, toggleWatchlist as dbToggleWatchlist, getFavoriteIds, getWatchlistIds } from '../db'
import { ingestItem, ingestEpisode } from '../services/autoIngest'
import { listTransfers } from '../services/premiumize'
import { syncLibraryToCloud, loadLibraryFromCloud } from '../services/cloudSync'
import {
  SparklesIcon, CheckCircleIcon, XCircleIcon, DownloadIcon, CloudDownloadIcon, InboxIcon, XIcon,
} from '../components/icons'


export type NotificationKind = 'info' | 'success' | 'error' | 'download' | 'cloud' | 'empty' | 'new'

export interface AppNotification {
  id: number
  kind: NotificationKind
  text: string
}

const NOTIFICATION_ICONS: Record<NotificationKind, { Icon: (p: { className?: string }) => JSX.Element; color: string }> = {
  info: { Icon: SparklesIcon, color: 'text-premiumflix-muted' },
  success: { Icon: CheckCircleIcon, color: 'text-green-400' },
  error: { Icon: XCircleIcon, color: 'text-red-400' },
  download: { Icon: DownloadIcon, color: 'text-blue-400' },
  cloud: { Icon: CloudDownloadIcon, color: 'text-sky-300' },
  empty: { Icon: InboxIcon, color: 'text-premiumflix-muted' },
  new: { Icon: SparklesIcon, color: 'text-premiumflix-red' },
}

/** Icon for a toast / notification-centre entry, coloured by its kind. */
export function NotificationIcon({ kind, className = 'w-4 h-4' }: { kind: NotificationKind; className?: string }) {
  const { Icon, color } = NOTIFICATION_ICONS[kind]
  return <span className={color}><Icon className={className} /></span>
}

interface LibraryContextValue {
  movies: Movie[]
  tvShows: TVShow[]
  isLoading: boolean
  scanProgress: ScanProgress | null
  error: string | null
  hasLibrary: boolean
  scan: (customRoots?: ScanFolderSelection[]) => Promise<void>
  clearAndRescan: (customRoots?: ScanFolderSelection[]) => Promise<void>
  appendMovieToLibrary: (movie: Movie) => void
  appendShowToLibrary: (show: TVShow) => void
  removeMovieFromLibrary: (id: string) => Promise<void>
  removeShowFromLibrary: (id: string) => Promise<void>
  updateMovieInLibrary: (movie: Movie) => void
  updateShowInLibrary: (show: TVShow) => void
  monitorTransfer: (transferId: string, name: string, metadata?: { tmdbId: number; type: 'movie' | 'show'; season?: number; episode?: number }) => void
  notifications: AppNotification[]
  dismissNotification: (index: number) => void
  restoreFromCloud: () => Promise<boolean>
  favoriteIds: Set<string>
  watchlistIds: Set<string>
  isFavorite: (id: string) => boolean
  isOnWatchlist: (id: string) => boolean
  toggleFavorite: (id: string, type: 'movie' | 'show') => Promise<void>
  toggleWatchlist: (id: string, type: 'movie' | 'show') => Promise<void>
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [movies, setMovies] = useState<Movie[]>([])
  const [tvShows, setTVShows] = useState<TVShow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const scanningRef = useRef(false)

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const nextNotificationId = useRef(0)
  const [pendingTransfers, setPendingTransfers] = useState<{ id: string; name: string; tmdbId?: number; type?: 'movie' | 'show'; season?: number; episode?: number }[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set())

  const addNotification = useCallback((text: string, kind: NotificationKind = 'info') => {
    const id = nextNotificationId.current++
    setNotifications(prev => [...prev, { id, kind, text }])
    // Each notification dismisses itself after 8s
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 8000)
  }, [])

  // Load from IndexedDB and localStorage on mount
  useEffect(() => {
    loadLibrary().then(({ movies: m, tvShows: s }) => {
      setMovies(m)
      setTVShows(s)
      setInitialized(true)
    })
    try {
      const stored = localStorage.getItem('pending_transfers')
      if (stored) setPendingTransfers(JSON.parse(stored))
    } catch { /* corrupt localStorage — ignore */ }
  }, [])

  // Auto-sync to cloud when library changes (debounced 60s, skip if empty)
  useEffect(() => {
    if (!initialized) return
    if (movies.length === 0 && tvShows.length === 0) return
    const timer = setTimeout(() => {
      syncLibraryToCloud(movies, tvShows).catch(() => {
        // Silently fail — don't block UI
      })
    }, 60000)
    return () => clearTimeout(timer)
  }, [movies, tvShows, initialized])

  // Poll pending transfers (only when there are any)
  useEffect(() => {
    if (pendingTransfers.length === 0) return
    
    const interval = setInterval(async () => {
      try {
        const { transfers } = await listTransfers()
        const completed: string[] = []
        
        for (const pt of pendingTransfers) {
          const t = transfers?.find(x => x.id === pt.id)
          if (!t) continue // Maybe deleted
          
          const status = t.status?.toLowerCase() ?? ''
          if (status === 'success' || status === 'finished' || status === 'seeding') {
            completed.push(pt.id)
            addNotification(`Download finished: ${pt.name}. You can now rescan your library!`, 'success')
            
            // If we have metadata hints, store them for the scanner
            if (pt.tmdbId && pt.type) {
              const itemId = t.folder_id || t.file_id
              if (itemId) {
                const hints = JSON.parse(localStorage.getItem('metadata_hints') || '{}')
                hints[itemId] = { tmdbId: pt.tmdbId, type: pt.type }
                localStorage.setItem('metadata_hints', JSON.stringify(hints))
              }
            }
          } else if (status === 'error' || status === 'failed') {
            completed.push(pt.id)
            addNotification(`Download failed: ${pt.name}`, 'error')
          }
        }
        
        if (completed.length > 0) {
          setPendingTransfers(prev => {
            const next = prev.filter(p => !completed.includes(p.id))
            localStorage.setItem('pending_transfers', JSON.stringify(next))
            // Clean up consumed metadata hints
            if (next.length === 0) {
              try { localStorage.removeItem('metadata_hints') } catch { /* ignore */ }
            }
            return next
          })
          
          // Attempt automatic ingestion for completed transfers
          for (const ptId of completed) {
            const pt = pendingTransfers.find(p => p.id === ptId)
            const t = transfers?.find(x => x.id === ptId)
            const itemId = t?.folder_id || t?.file_id
            
            if (itemId && pt) {
              if (pt.type === 'show' && pt.tmdbId) {
                // For TV episodes, merge into existing show or create a stub
                ingestEpisode(itemId, pt.tmdbId, pt.season, pt.episode).then(result => {
                  if (result) {
                    if (result.isNew) {
                      appendShowToLibrary(result.show)
                    } else {
                      updateShowInLibrary(result.show)
                    }
                  }
                }).catch(err => console.error('Episode ingest failed', err))
              } else {
                ingestItem(itemId, pt.type).then(result => {
                  result.movies.forEach(m => appendMovieToLibrary(m))
                  result.shows.forEach(s => appendShowToLibrary(s))
                }).catch(err => console.error('Auto-ingest failed', err))
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to poll transfers', e)
      }
    }, 10_000)
    
    return () => clearInterval(interval)
  }, [pendingTransfers])

  const monitorTransfer = useCallback((transferId: string, name: string, metadata?: { tmdbId: number; type: 'movie' | 'show'; season?: number; episode?: number }) => {
    setPendingTransfers(prev => {
      if (prev.some(p => p.id === transferId)) return prev
      const next = [...prev, { id: transferId, name, ...metadata }]
      localStorage.setItem('pending_transfers', JSON.stringify(next))
      addNotification(`Download started: ${name}`, 'download')
      return next
    })
  }, [])

  const dismissNotification = useCallback((index: number) => {
    setNotifications(prev => prev.filter((_, i) => i !== index))
  }, [])

  const scan = useCallback(async (customRoots?: ScanFolderSelection[]) => {
    if (scanningRef.current) return
    scanningRef.current = true
    setIsLoading(true)
    setError(null)
    setScanProgress({
      status: 'Starting scan...',
      moviesFound: 0,
      showsFound: 0,
      metadataFetched: 0,
      metadataTotal: 0,
    })

    try {
      const { movies: m, tvShows: s } = await scanLibrary(
        (p) => setScanProgress({ ...p }),
        customRoots,
      )
      setMovies(m)
      setTVShows(s)
      await saveLibrary(m, s)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      setError(msg)
    } finally {
      setIsLoading(false)
      setScanProgress(null)
      scanningRef.current = false
      // Manual scans count as fresh — delay the next auto-rescan
      localStorage.setItem('last_auto_rescan_at', String(Date.now()))
    }
  }, [])

  const clearAndRescan = useCallback(async (customRoots?: ScanFolderSelection[]) => {
    await clearLibrary()
    setMovies([])
    setTVShows([])
    await scan(customRoots)
  }, [scan])

  // ─── Scheduled auto-rescan ───────────────────────────────────────────────
  // Opt-in (Settings): while a tab is open, periodically rescan and toast
  // a summary of what's new. Runs at most every 5 minutes of checking.

  const runAutoRescan = useCallback(async () => {
    if (scanningRef.current) return
    if (document.visibilityState !== 'visible') return
    const before = await loadLibrary()
    await scan()
    const after = await loadLibrary()

    const beforeMovieIds = new Set(before.movies.map(m => m.id))
    const beforeShowIds = new Set(before.tvShows.map(s => s.id))
    const countEps = (lib: { tvShows: TVShow[] }) =>
      lib.tvShows.reduce((n, s) => n + s.seasons.reduce((k, se) => k + se.episodes.length, 0), 0)

    const newMovies = after.movies.filter(m => !beforeMovieIds.has(m.id)).length
    const newShows = after.tvShows.filter(s => !beforeShowIds.has(s.id)).length
    const newEpisodes = countEps(after) - countEps(before)

    const parts: string[] = []
    if (newMovies) parts.push(`${newMovies} new movie${newMovies > 1 ? 's' : ''}`)
    if (newShows) parts.push(`${newShows} new show${newShows > 1 ? 's' : ''}`)
    if (newEpisodes > 0) parts.push(`${newEpisodes} new episode${newEpisodes !== 1 ? 's' : ''}`)
    if (parts.length) addNotification(`Library update: ${parts.join(', ')}`, 'new')
  }, [scan, addNotification])

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const hours = parseFloat(localStorage.getItem('auto_rescan_hours') ?? '0')
        if (!hours || hours <= 0) return
        const last = parseFloat(localStorage.getItem('last_auto_rescan_at') ?? '0')
        if (Date.now() - last < hours * 3_600_000) return
        localStorage.setItem('last_auto_rescan_at', String(Date.now()))
        runAutoRescan().catch(() => { /* non-fatal */ })
      } catch { /* ignore */ }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [runAutoRescan])

  const appendMovieToLibrary = useCallback((movie: Movie) => {
    setMovies(prev => {
      const exists = prev.some(m => m.id === movie.id)
      const updated = exists ? prev.map(m => m.id === movie.id ? movie : m) : [movie, ...prev]
      appendMovie(movie)
      return updated
    })
  }, [])

  const appendShowToLibrary = useCallback((show: TVShow) => {
    setTVShows(prev => {
      const exists = prev.some(s => s.id === show.id)
      const updated = exists ? prev.map(s => s.id === show.id ? show : s) : [show, ...prev]
      appendTVShow(show)
      return updated
    })
  }, [])

  const removeMovieFromLibrary = useCallback(async (id: string) => {
    await deleteMovie(id)
    setMovies(prev => prev.filter(m => m.id !== id))
  }, [])

  const removeShowFromLibrary = useCallback(async (id: string) => {
    await deleteTVShow(id)
    setTVShows(prev => prev.filter(s => s.id !== id))
  }, [])

  const updateMovieInLibrary = useCallback((movie: Movie) => {
    setMovies(prev => prev.map(m => m.id === movie.id ? movie : m))
    appendMovie(movie).catch(e => console.error('Failed to persist movie update', e))
  }, [])

  const updateShowInLibrary = useCallback((show: TVShow) => {
    setTVShows(prev => prev.map(s => s.id === show.id ? show : s))
    appendTVShow(show).catch(e => console.error('Failed to persist show update', e))
  }, [])

  const restoreFromCloud = useCallback(async () => {
    setIsLoading(true)
    try {
      const cloudLib = await loadLibraryFromCloud()
      if (!cloudLib) {
        addNotification('No cloud backup found on Premiumize.', 'empty')
        return false
      }
      
      setMovies(cloudLib.movies)
      setTVShows(cloudLib.tvShows)
      await saveLibrary(cloudLib.movies, cloudLib.tvShows)
      
      addNotification('Library restored from cloud!', 'cloud')
      return true
    } catch (e) {
      console.error(e)
      addNotification('Failed to restore from cloud.', 'error')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load favorites/watchlist from DB on mount
  useEffect(() => {
    Promise.all([getFavoriteIds(), getWatchlistIds()]).then(([fav, wl]) => {
      setFavoriteIds(fav)
      setWatchlistIds(wl)
    })
  }, [])

  const handleToggleFavorite = useCallback(async (id: string, type: 'movie' | 'show') => {
    try {
      await dbToggleFavorite(id, type)
      setFavoriteIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } catch (e) { console.error('toggleFavorite failed:', e) }
  }, [])

  const handleToggleWatchlist = useCallback(async (id: string, type: 'movie' | 'show') => {
    try {
      await dbToggleWatchlist(id, type)
      setWatchlistIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } catch (e) { console.error('toggleWatchlist failed:', e) }
  }, [])

  return (
    <LibraryContext.Provider
      value={{
        movies,
        tvShows,
        isLoading,
        scanProgress,
        error,
        hasLibrary: initialized && (movies.length > 0 || tvShows.length > 0),
        scan,
        clearAndRescan,
        appendMovieToLibrary,
        appendShowToLibrary,
        removeMovieFromLibrary,
        removeShowFromLibrary,
        updateMovieInLibrary,
        updateShowInLibrary,
        monitorTransfer,
        notifications,
        dismissNotification,
        restoreFromCloud,
        favoriteIds,
        watchlistIds,
        isFavorite: (id: string) => favoriteIds.has(id),
        isOnWatchlist: (id: string) => watchlistIds.has(id),
        toggleFavorite: handleToggleFavorite,
        toggleWatchlist: handleToggleWatchlist,
      }}
    >
      {children}
      {/* Toast Notifications */}
      {notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
          {notifications.map((note, i) => (
            <div key={note.id} className="bg-premiumflix-surface border border-white/20 shadow-2xl rounded p-4 flex items-start gap-3">
              <NotificationIcon kind={note.kind} className="w-5 h-5 mt-px" />
              <p className="text-white text-sm font-medium flex-1">{note.text}</p>
              <button onClick={() => dismissNotification(i)} className="text-white/50 hover:text-white">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </LibraryContext.Provider>
  )
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider')
  return ctx
}
