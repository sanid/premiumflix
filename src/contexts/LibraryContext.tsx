import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { Movie, TVShow, ScanFolderSelection } from '../types'
import { scanLibrary, type ScanProgress } from '../services/scanner'
import { saveLibrary, loadLibrary, clearLibrary, appendMovie } from '../db'

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

  // Load from IndexedDB on mount
  useEffect(() => {
    loadLibrary().then(({ movies: m, tvShows: s }) => {
      setMovies(m)
      setTVShows(s)
      setInitialized(true)
    })
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
      // Replace if already exists (by id), otherwise prepend
      const exists = prev.some(m => m.id === movie.id)
      const updated = exists ? prev.map(m => m.id === movie.id ? movie : m) : [movie, ...prev]
      appendMovie(movie)
      return updated
    })
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
      }}
    >
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider')
  return ctx
}
