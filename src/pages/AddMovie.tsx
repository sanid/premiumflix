import { useState, useEffect } from 'react'
import { searchYTS, getMovieTorrents, generateMagnet } from '../services/yts'
import type { YTSMovie, YTSTorrent } from '../services/yts'
import { createTransfer, getOrCreateMoviesFolder, getOrCreateShowsFolder } from '../services/premiumize'
import { ingestNewMovie } from '../services/ingest'
import { useI18n } from '../contexts/I18nContext'
import { useLibrary } from '../contexts/LibraryContext'

type MediaTypeFilter = 'movie' | 'show'

export function AddMovie() {
  const { t } = useI18n()
  const { appendMovieToLibrary } = useLibrary()
  const [search, setSearch] = useState('')
  const [mediaType, setMediaType] = useState<MediaTypeFilter>('movie')
  const [movies, setMovies] = useState<YTSMovie[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMovie, setSelectedMovie] = useState<YTSMovie | null>(null)
  const [torrents, setTorrents] = useState<YTSTorrent[]>([])
  const [loadingTorrents, setLoadingTorrents] = useState(false)
  const [status, setStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({})
  const [statusMsg, setStatusMsg] = useState<Record<string, string>>({})

  // Fetch popular movies by default
  useEffect(() => {
    fetchMovies(search, mediaType)
  }, [])

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchMovies(search, mediaType)
    }, 500)
    return () => clearTimeout(delayDebounceFn)
  }, [search, mediaType])

  async function fetchMovies(query = '', type: MediaTypeFilter = 'movie') {
    setLoading(true)
    try {
      // YTS only has movies; for shows we still search YTS but they're rare —
      // show a note if type is 'show'. In future this could integrate EZTV.
      const data = await searchYTS(query)
      setMovies(data.movies ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectMovie(movie: YTSMovie) {
    if (selectedMovie?.id === movie.id) {
      setSelectedMovie(null)
      return
    }
    setSelectedMovie(movie)
    setTorrents(movie.torrents ?? [])
    
    // YTS search doesn't always return all torrents, sometimes we need to fetch details
    if (!movie.torrents || movie.torrents.length === 0) {
      setLoadingTorrents(true)
      try {
        const details = await getMovieTorrents(movie.id)
        setTorrents(details.torrents ?? [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingTorrents(false)
      }
    }
  }

  async function handleAddTorrent(torrent: YTSTorrent, movie: YTSMovie) {
    const id = `${movie.id}-${torrent.hash}`
    setStatus(prev => ({ ...prev, [id]: 'loading' }))
    setStatusMsg(prev => ({ ...prev, [id]: 'Sending to Premiumize...' }))
    try {
      const magnet = generateMagnet(torrent.hash, movie.title)
      let folderId: string | undefined
      if (mediaType === 'show') {
        folderId = await getOrCreateShowsFolder()
      } else {
        folderId = await getOrCreateMoviesFolder()
      }
      const transfer = await createTransfer(magnet, folderId)
      setStatusMsg(prev => ({ ...prev, [id]: 'Queued — waiting for download...' }))

      if (mediaType === 'movie') {
        // Kick off background ingest — does NOT block the UI
        ingestNewMovie(
          transfer.id,
          movie.title,
          movie.year,
          folderId,
          (msg) => setStatusMsg(prev => ({ ...prev, [id]: msg })),
          (ingestedMovie) => {
            appendMovieToLibrary(ingestedMovie)
            setStatus(prev => ({ ...prev, [id]: 'success' }))
            setStatusMsg(prev => ({ ...prev, [id]: 'Added to library! Rescan to see it.' }))
          },
          (err) => {
            console.error('Ingest error:', err)
            setStatus(prev => ({ ...prev, [id]: 'error' }))
            setStatusMsg(prev => ({ ...prev, [id]: err }))
          },
          {
            quality: torrent.quality,
            videoCodec: torrent.video_codec,
            audioCodec: 'aac', // Or infer from somewhere else if YTS provides it
            language: movie.language,
          }
        )
      } else {
        // For TV shows we can't auto-ingest the same way (need episode structure)
        // — the user should rescan after the download finishes
        setStatus(prev => ({ ...prev, [id]: 'success' }))
        setStatusMsg(prev => ({ ...prev, [id]: 'Sent to Premiumize! Rescan library once download finishes.' }))
      }
    } catch (e) {
      console.error(e)
      setStatus(prev => ({ ...prev, [id]: 'error' }))
      setStatusMsg(prev => ({ ...prev, [id]: 'Failed to send to Premiumize' }))
    }
  }

  return (
    <div className="min-h-screen bg-premiumflix-dark pt-20 pb-16">
      <div className="px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
        <h1 className="text-white text-3xl font-black mb-2">Add to Library</h1>
        <p className="text-premiumflix-muted text-sm mb-6">
          Source: <span className="text-white/60">YTS (movies-api.accel.li)</span>
          {' '}— torrents are sent to Premiumize for cloud download.
          {' '}<span className="text-yellow-400">Storage full?</span> Delete unused titles from their detail page first.
        </p>

        {/* Type toggle + search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Type switcher */}
          <div className="flex bg-premiumflix-surface border border-white/10 rounded-md overflow-hidden flex-shrink-0">
            <button
              onClick={() => setMediaType('movie')}
              className={`px-5 py-2.5 text-sm font-bold transition-colors ${
                mediaType === 'movie' ? 'bg-premiumflix-red text-white' : 'text-premiumflix-muted hover:text-white'
              }`}
            >
              🎬 Movies
            </button>
            <button
              onClick={() => setMediaType('show')}
              className={`px-5 py-2.5 text-sm font-bold transition-colors ${
                mediaType === 'show' ? 'bg-premiumflix-red text-white' : 'text-premiumflix-muted hover:text-white'
              }`}
            >
              📺 TV Shows
            </button>
          </div>

          <input
            type="text"
            placeholder={mediaType === 'show' ? 'Search for TV shows...' : t.addMovie.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-premiumflix-surface border border-white/10 text-white text-sm px-4 py-3 rounded-md outline-none focus:border-white/40"
          />
        </div>

        {mediaType === 'show' && (
          <div className="mb-6 bg-yellow-900/30 border border-yellow-600/40 rounded-lg px-4 py-3 text-sm text-yellow-200">
            <strong>Note:</strong> YTS primarily lists movies. TV show results may be limited. After adding, wait for the download to finish on Premiumize, then do a library rescan to see the series.
          </div>
        )}

        {loading && movies.length === 0 ? (
          <p className="text-premiumflix-muted">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {movies.map(movie => (
              <div key={movie.id} className="bg-premiumflix-surface rounded-md overflow-hidden relative group">
                <div 
                  className="aspect-[2/3] relative cursor-pointer"
                  onClick={() => handleSelectMovie(movie)}
                >
                  <img 
                    src={movie.large_cover_image} 
                    alt={movie.title} 
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white font-bold bg-premiumflix-red px-3 py-1.5 rounded text-sm">
                      Select
                    </span>
                  </div>
                </div>
                
                <div className="p-3">
                  <h3 className="text-white font-bold text-sm truncate">{movie.title}</h3>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-premiumflix-muted text-xs">{movie.year}</span>
                    <span className="text-yellow-400 text-xs font-medium">★ {movie.rating}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Global Torrent Selection Modal */}
        {selectedMovie && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-premiumflix-surface rounded-xl overflow-hidden shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col sm:flex-row">
              {/* Poster side */}
              <div className="sm:w-2/5 md:w-1/3 bg-black flex-shrink-0 relative hidden sm:block">
                <img 
                  src={selectedMovie.large_cover_image} 
                  alt={selectedMovie.title} 
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* Content side */}
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-white text-2xl font-black mb-1 pr-8">{selectedMovie.title}</h2>
                    <div className="flex gap-3 text-sm text-premiumflix-muted">
                      <span>{selectedMovie.year}</span>
                      <span className="text-yellow-400 font-medium">★ {selectedMovie.rating}</span>
                      {selectedMovie.genres && <span>{selectedMovie.genres.slice(0, 3).join(', ')}</span>}
                    </div>
                    <div className="mt-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${mediaType === 'show' ? 'bg-blue-700 text-white' : 'bg-premiumflix-red text-white'}`}>
                        {mediaType === 'show' ? '📺 TV Show' : '🎬 Movie'}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedMovie(null)}
                    className="text-white/60 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                  {loadingTorrents ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-premiumflix-muted">Loading torrents...</p>
                    </div>
                  ) : torrents.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-premiumflix-muted">{t.addMovie.noTorrents}</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {torrents.map(tData => {
                        const id = `${selectedMovie.id}-${tData.hash}`
                        const s = status[id] ?? 'idle'
                        return (
                          <div key={tData.hash} className="bg-black/40 border border-white/10 rounded-lg p-4 flex flex-col">
                            <div className="flex justify-between items-start mb-3">
                              <span className="font-bold text-white text-lg">{tData.quality}</span>
                              <span className="text-premiumflix-muted text-sm">{tData.size}</span>
                            </div>
                            <div className="flex gap-4 mb-4 text-sm text-premiumflix-muted">
                              <span className="flex items-center gap-1">
                                <span className="text-green-400 font-medium">{tData.seeds}</span> {t.addMovie.seeds}
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="text-red-400 font-medium">{tData.peers}</span> {t.addMovie.peers}
                              </span>
                            </div>
                            <button
                              onClick={() => handleAddTorrent(tData, selectedMovie)}
                              disabled={s === 'loading' || s === 'success'}
                              className={`mt-auto w-full py-2.5 rounded font-bold transition-all text-sm ${
                                s === 'success' ? 'bg-green-600 text-white' :
                                s === 'error' ? 'bg-red-600 text-white cursor-pointer' :
                                s === 'loading' ? 'bg-white/20 text-white/60' :
                                'bg-premiumflix-red hover:bg-premiumflix-red-hover text-white hover:scale-[1.02]'
                              }`}
                            >
                              {s === 'loading' || s === 'success'
                                ? (statusMsg[id] || (s === 'loading' ? t.addMovie.adding : t.addMovie.added))
                                : s === 'error'
                                  ? (statusMsg[id] || t.addMovie.failed)
                                  : t.addMovie.add}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
