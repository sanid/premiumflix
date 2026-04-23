import { useState, useEffect } from 'react'
import { searchYTS, getMovieTorrents, generateMagnet } from '../services/yts'
import type { YTSMovie, YTSTorrent } from '../services/yts'
import { searchMovieNzb, searchShowNzb, type SceneNzbItem } from '../services/scenenzbs'
import { createTransfer, getOrCreateMoviesFolder, getOrCreateShowsFolder } from '../services/premiumize'
import { ingestNewMovie } from '../services/ingest'
import { useI18n } from '../contexts/I18nContext'
import { useLibrary } from '../contexts/LibraryContext'
import { searchMovieRaw, searchTVRaw } from '../services/metadata'
import type { TMDBMovieDetail } from '../types'

type MediaTypeFilter = 'movie' | 'show'

export function AddMovie() {
  const { t } = useI18n()
  const { appendMovieToLibrary, monitorTransfer } = useLibrary()
  const [search, setSearch] = useState('')
  const [mediaType, setMediaType] = useState<MediaTypeFilter>('movie')
  const [source, setSource] = useState<'yts' | 'usenet'>('yts')
  const [movies, setMovies] = useState<YTSMovie[]>([])
  const [nzbItems, setNzbItems] = useState<SceneNzbItem[]>([])
  const [tmdbResults, setTmdbResults] = useState<TMDBMovieDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMovie, setSelectedMovie] = useState<YTSMovie | null>(null)
  const [selectedTmdbItem, setSelectedTmdbItem] = useState<TMDBMovieDetail | null>(null)
  const [torrents, setTorrents] = useState<YTSTorrent[]>([])
  const [loadingTorrents, setLoadingTorrents] = useState(false)
  const [status, setStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({})
  const [statusMsg, setStatusMsg] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchMedia(search, mediaType, source)
  }, [])

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchMedia(search, mediaType, source)
    }, 500)
    return () => clearTimeout(delayDebounceFn)
  }, [search, mediaType, source])

  async function fetchMedia(query = '', type: MediaTypeFilter = 'movie', src: 'yts' | 'usenet' = 'yts') {
    setLoading(true)
    try {
      if (src === 'yts') {
        const data = await searchYTS(query)
        setMovies(data.movies ?? [])
        setNzbItems([])
        setTmdbResults([])
      } else {
        setMovies([])
        if (!query) {
          setTmdbResults([])
          setNzbItems([])
          return
        }
        const data = type === 'movie' ? await searchMovieRaw(query) : await searchTVRaw(query)
        setTmdbResults(data.results as TMDBMovieDetail[] || [])
        setNzbItems([])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectTmdbItem(item: TMDBMovieDetail) {
    if (selectedTmdbItem?.id === item.id) {
      setSelectedTmdbItem(null)
      return
    }
    setSelectedTmdbItem(item)
    setLoadingTorrents(true)
    setNzbItems([])
    try {
      const data = mediaType === 'movie' ? await searchMovieNzb(item.id) : await searchShowNzb(item.id)
      setNzbItems(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingTorrents(false)
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

  async function handleAddNzb(item: SceneNzbItem) {
    const id = item.guid
    setStatus(prev => ({ ...prev, [id]: 'loading' }))
    setStatusMsg(prev => ({ ...prev, [id]: 'Sending NZB to Premiumize...' }))
    try {
      let folderId: string | undefined
      if (mediaType === 'show') {
        folderId = await getOrCreateShowsFolder()
      } else {
        folderId = await getOrCreateMoviesFolder()
      }
      const transfer = await createTransfer(item.link, folderId)
      setStatusMsg(prev => ({ ...prev, [id]: 'Queued — waiting for download...' }))
      setStatus(prev => ({ ...prev, [id]: 'success' }))
      
      // Monitor this transfer globally
      if (selectedTmdbItem) {
        monitorTransfer(transfer.id, item.title, { tmdbId: selectedTmdbItem.id, type: mediaType as 'movie' | 'show' })
      } else {
        monitorTransfer(transfer.id, item.title)
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
          <span className="text-yellow-400">Storage full?</span> Delete unused titles from their detail page first.
        </p>

        {/* Source toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setSource('yts'); setMediaType('movie') }}
            className={`px-4 py-2 text-sm font-bold rounded transition-colors ${
              source === 'yts' ? 'bg-premiumflix-red text-white' : 'bg-white/10 text-premiumflix-muted hover:text-white hover:bg-white/20'
            }`}
          >
            YTS (Movies only)
          </button>
          <button
            onClick={() => setSource('usenet')}
            className={`px-4 py-2 text-sm font-bold rounded transition-colors ${
              source === 'usenet' ? 'bg-premiumflix-red text-white' : 'bg-white/10 text-premiumflix-muted hover:text-white hover:bg-white/20'
            }`}
          >
            SceneNZBs (Usenet)
          </button>
        </div>

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
              disabled={source === 'yts'}
              className={`px-5 py-2.5 text-sm font-bold transition-colors ${
                source === 'yts' ? 'opacity-50 cursor-not-allowed bg-black/20 text-white/20' :
                mediaType === 'show' ? 'bg-premiumflix-red text-white' : 'text-premiumflix-muted hover:text-white'
              }`}
            >
              📺 TV Shows
            </button>
          </div>

          <input
            type="text"
            placeholder={source === 'usenet' ? 'Search by title or TMDB ID...' : t.addMovie.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-premiumflix-surface border border-white/10 text-white text-sm px-4 py-3 rounded-md outline-none focus:border-white/40"
          />
        </div>

        {source === 'yts' && mediaType === 'show' && (
          <div className="mb-6 bg-yellow-900/30 border border-yellow-600/40 rounded-lg px-4 py-3 text-sm text-yellow-200">
            <strong>Note:</strong> YTS primarily lists movies. TV show results may be limited. Try using SceneNZBs for shows.
          </div>
        )}

        {loading && movies.length === 0 && tmdbResults.length === 0 ? (
          <p className="text-premiumflix-muted">Loading...</p>
        ) : source === 'yts' ? (
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
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {tmdbResults.map(item => (
              <div key={item.id} className="bg-premiumflix-surface rounded-md overflow-hidden relative group">
                <div 
                  className="aspect-[2/3] relative cursor-pointer"
                  onClick={() => handleSelectTmdbItem(item)}
                >
                  <img 
                    src={item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '/no-poster.png'} 
                    alt={item.title || item.name} 
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
                  <h3 className="text-white font-bold text-sm truncate">{item.title || item.name}</h3>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-premiumflix-muted text-xs">{(item.release_date || item.first_air_date || '').split('-')[0]}</span>
                    <span className="text-yellow-400 text-xs font-medium">★ {item.vote_average?.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Global Selection Modal */}
        {(selectedMovie || selectedTmdbItem) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-premiumflix-surface rounded-xl overflow-hidden shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col sm:flex-row">
              {/* Poster side */}
              <div className="sm:w-2/5 md:w-1/3 bg-black flex-shrink-0 relative hidden sm:block">
                <img 
                  src={selectedMovie ? selectedMovie.large_cover_image : (selectedTmdbItem?.poster_path ? `https://image.tmdb.org/t/p/w500${selectedTmdbItem.poster_path}` : '/no-poster.png')} 
                  alt={selectedMovie?.title || selectedTmdbItem?.title || selectedTmdbItem?.name} 
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* Content side */}
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-white text-2xl font-black mb-1 pr-8">
                      {selectedMovie?.title || selectedTmdbItem?.title || selectedTmdbItem?.name}
                    </h2>
                    <div className="flex gap-3 text-sm text-premiumflix-muted">
                      <span>{selectedMovie?.year || (selectedTmdbItem?.release_date || selectedTmdbItem?.first_air_date || '').split('-')[0]}</span>
                      <span className="text-yellow-400 font-medium">★ {selectedMovie?.rating || selectedTmdbItem?.vote_average?.toFixed(1)}</span>
                    </div>
                    <div className="mt-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${mediaType === 'show' ? 'bg-blue-700 text-white' : 'bg-premiumflix-red text-white'}`}>
                        {mediaType === 'show' ? '📺 TV Show' : '🎬 Movie'}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setSelectedMovie(null); setSelectedTmdbItem(null); }}
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
                      <p className="text-premiumflix-muted">Loading releases...</p>
                    </div>
                  ) : (source === 'yts' ? torrents : nzbItems).length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-premiumflix-muted">No releases found on {source === 'yts' ? 'YTS' : 'Usenet'}.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {source === 'yts' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          {torrents.map(tData => {
                            const id = `${selectedMovie!.id}-${tData.hash}`
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
                                  onClick={() => handleAddTorrent(tData, selectedMovie!)}
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
                      ) : (
                        nzbItems.map(item => {
                          const id = item.guid
                          const s = status[id] ?? 'idle'
                          return (
                            <div key={item.guid} className="bg-black/40 border border-white/10 rounded-lg p-4 flex flex-col md:flex-row gap-4 items-start md:items-center">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-white font-bold text-sm break-words leading-tight">{item.title}</h3>
                                </div>
                                <div className="flex gap-2 flex-wrap text-[10px] mt-1">
                                  {item.resolution && <span className="bg-premiumflix-red text-white px-1 rounded font-bold">{item.resolution}</span>}
                                  {item.codec && <span className="bg-white/20 text-white px-1 rounded">{item.codec}</span>}
                                  {item.language && <span className="text-premiumflix-muted">{item.language}</span>}
                                  {item.size > 0 && <span className="text-premiumflix-muted">{(item.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>}
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                <button 
                                  onClick={() => handleAddNzb(item)}
                                  disabled={s === 'loading' || s === 'success'}
                                  className={`px-4 py-2 rounded text-xs font-bold transition-colors ${
                                    s === 'success' ? 'bg-green-700 text-white' :
                                    s === 'error' ? 'bg-red-700 text-white' :
                                    s === 'loading' ? 'bg-white/10 text-white/50' :
                                    'bg-premiumflix-red hover:bg-premiumflix-red-hover text-white'
                                  }`}
                                >
                                  {s === 'loading' ? 'Adding...' : s === 'success' ? 'Added ✓' : s === 'error' ? 'Failed' : 'Add NZB'}
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
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
