import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { Movie, TVShow, ScanFolderSelection } from '../types'
import { scanLibrary, type ScanProgress } from '../services/scanner'
import { saveLibrary, loadLibrary, clearLibrary, appendMovie, appendTVShow, deleteMovie, deleteTVShow } from '../db'
import { ingestItem } from '../services/autoIngest'
import { listTransfers } from '../services/premiumize'

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
  monitorTransfer: (transferId: string, name: string, metadata?: { tmdbId: number; type: 'movie' | 'show' }) => void
  notifications: string[]
  dismissNotification: (index: number) => void
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

  const [notifications, setNotifications] = useState<string[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<{ id: string; name: string; tmdbId?: number; type?: 'movie' | 'show' }[]>([])

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
    } catch {}
  }, [])

  // Poll pending transfers
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
            setNotifications(prev => [...prev, `✅ Download finished: ${pt.name}. You can now rescan your library!`])
            
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
            setNotifications(prev => [...prev, `❌ Download failed: ${pt.name}`])
          }
        }
        
        if (completed.length > 0) {
          setPendingTransfers(prev => {
            const next = prev.filter(p => !completed.includes(p.id))
            localStorage.setItem('pending_transfers', JSON.stringify(next))
            return next
          })
          
          // Attempt automatic ingestion for completed transfers
          for (const ptId of completed) {
            const pt = pendingTransfers.find(p => p.id === ptId)
            const t = transfers?.find(x => x.id === ptId)
            const itemId = t?.folder_id || t?.file_id
            
            if (itemId && pt) {
              ingestItem(itemId, pt.type).then(result => {
                result.movies.forEach(m => appendMovieToLibrary(m))
                result.shows.forEach(s => appendShowToLibrary(s))
              }).catch(err => console.error('Auto-ingest failed', err))
            }
          }
        }
      } catch (e) {
        console.error('Failed to poll transfers', e)
      }
    }, 10_000)
    
    return () => clearInterval(interval)
  }, [pendingTransfers])

  const monitorTransfer = useCallback((transferId: string, name: string, metadata?: { tmdbId: number; type: 'movie' | 'show' }) => {
    setPendingTransfers(prev => {
      if (prev.some(p => p.id === transferId)) return prev
      const next = [...prev, { id: transferId, name, ...metadata }]
      localStorage.setItem('pending_transfers', JSON.stringify(next))
      setNotifications(prev => [...prev, `⬇️ Download started: ${name}`])
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
    }
  }, [])

  const clearAndRescan = useCallback(async (customRoots?: ScanFolderSelection[]) => {
    await clearLibrary()
    setMovies([])
    setTVShows([])
    await scan(customRoots)
  }, [scan])

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
  }, [])

  const updateShowInLibrary = useCallback((show: TVShow) => {
    setTVShows(prev => prev.map(s => s.id === show.id ? show : s))
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
      }}
    >
      {children}
      {/* Toast Notifications */}
      {notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
          {notifications.map((note, i) => (
            <div key={i} className="bg-premiumflix-surface border border-white/20 shadow-2xl rounded p-4 flex justify-between items-start gap-3">
              <p className="text-white text-sm font-medium">{note}</p>
              <button onClick={() => dismissNotification(i)} className="text-white/50 hover:text-white">✕</button>
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
