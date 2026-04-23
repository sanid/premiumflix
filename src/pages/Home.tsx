import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { useCollection } from '../hooks/useCollection'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { useI18n } from '../contexts/I18nContext'
import { MovieRow, ShowRow, ContinueWatchingRow } from '../components/MediaRow'
import { HeroMovie, HeroShow } from '../components/HeroSection'
import { movieDisplayTitle, showDisplayTitle, movieMainFile } from '../types'
import type { Movie, TVShow } from '../types'

export function Home() {
  const { movies, tvShows, isLoading, scanProgress, hasLibrary, scan } = useLibrary()
  const { favoriteIds, watchlistIds } = useCollection()
  const { inProgress, getProgressFraction, removeProgress } = useWatchProgress()
  const { t } = useI18n()
  const navigate = useNavigate()

  // Pick a random featured item (prefer high-rated with backdrop)
  const featured = useMemo(() => {
    const candidates = [
      ...movies.filter((m) => m.tmdbDetail?.backdrop_path && (m.tmdbDetail.vote_average ?? 0) >= 6),
      ...tvShows.filter((s) => s.tmdbDetail?.backdrop_path && (s.tmdbDetail.vote_average ?? 0) >= 6),
    ]
    if (!candidates.length) return movies[0] ?? tvShows[0] ?? null
    return candidates[Math.floor(Math.random() * Math.min(candidates.length, 20))]
  }, [movies, tvShows])

  // Continue watching: movies/shows with in-progress files
  const continueWatching = useMemo(() => {
    type ContinueItem = {
      type: 'movie'
      movie: Movie
      fileId: string
      lastWatched: number
    } | {
      type: 'show'
      show: TVShow
      fileId: string
      episodeLabel: string
      lastWatched: number
    }

    const results: ContinueItem[] = []
    const seen = new Set<string>()

    for (const p of inProgress.slice(0, 30)) {
      // Check movies
      const movie = movies.find((m) => m.files.some((f) => f.id === p.fileId))
      if (movie && !seen.has(movie.id)) {
        seen.add(movie.id)
        results.push({ type: 'movie', movie, fileId: p.fileId, lastWatched: p.lastWatched })
        continue
      }
      // Check TV shows
      for (const show of tvShows) {
        for (const season of show.seasons) {
          const ep = season.episodes.find((e) => e.file.id === p.fileId)
          if (ep && !seen.has(`show-${show.id}-${ep.id}`)) {
            seen.add(`show-${show.id}-${ep.id}`)
            const epLabel = ep.tmdbEpisode?.name
              ? `S${String(season.number).padStart(2, '0')}E${String(ep.number).padStart(2, '0')} — ${ep.tmdbEpisode.name}`
              : `S${String(season.number).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`
            results.push({ type: 'show', show, fileId: p.fileId, episodeLabel: epLabel, lastWatched: p.lastWatched })
            break
          }
        }
      }
    }

    return results.sort((a, b) => b.lastWatched - a.lastWatched).slice(0, 20)
  }, [movies, tvShows, inProgress])

  // My List
  const myListMovies = useMemo(
    () => movies.filter((m) => watchlistIds.has(m.id)).slice(0, 20),
    [movies, watchlistIds],
  )
  const myListShows = useMemo(
    () => tvShows.filter((s) => watchlistIds.has(s.id)).slice(0, 20),
    [tvShows, watchlistIds],
  )

  // Recently added
  const recentMovies = useMemo(
    () => [...movies].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 20),
    [movies],
  )

  function handleHeroPlay() {
    if (!featured) return
    if ('files' in featured) {
      // Movie
      const movie = featured as Movie
      const file = movieMainFile(movie)
      if (file) navigate(`/play/movie/${movie.id}/${file.id}`)
      else navigate(`/movie/${movie.id}`)
    } else {
      // TV Show
      const show = featured as TVShow
      const firstEp = show.seasons[0]?.episodes[0]
      if (firstEp) navigate(`/play/show/${show.id}/${firstEp.file.id}`)
      else navigate(`/show/${show.id}`)
    }
  }

  // ─── Loading / Empty states ────────────────────────────────────────────────

  if (isLoading && scanProgress) {
    return (
      <div className="min-h-screen bg-premiumflix-dark flex flex-col items-center justify-center gap-8 px-4">
        <div className="text-premiumflix-red font-black text-4xl">PREMIUMFLIX</div>
        <div className="w-full max-w-md">
          <p className="text-white text-center font-medium mb-2">{scanProgress.status}</p>
          <div className="bg-white/10 rounded-full h-2 overflow-hidden">
            {scanProgress.metadataTotal > 0 ? (
              <div
                className="h-full bg-premiumflix-red transition-all duration-500"
                style={{
                  width: `${(scanProgress.metadataFetched / scanProgress.metadataTotal) * 100}%`,
                }}
              />
            ) : (
              <div className="h-full bg-premiumflix-red animate-pulse w-1/3" />
            )}
          </div>
          <div className="flex justify-between mt-2 text-premiumflix-muted text-xs">
            <span>{scanProgress.moviesFound} movies found</span>
            <span>{scanProgress.showsFound} shows found</span>
          </div>
          {scanProgress.metadataTotal > 0 && (
            <p className="text-premiumflix-muted text-xs text-center mt-1">
              Metadata: {scanProgress.metadataFetched} / {scanProgress.metadataTotal}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (!hasLibrary && !isLoading) {
    return (
      <div className="min-h-screen bg-premiumflix-dark flex flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="text-premiumflix-red font-black text-5xl">PREMIUMFLIX</div>
        <h1 className="text-white text-2xl font-bold">{t.home.welcome}</h1>
        <p className="text-premiumflix-muted max-w-md">
          {t.home.welcomeDesc}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => scan()}
            className="bg-premiumflix-red text-white font-bold px-8 py-3 rounded hover:bg-premiumflix-red-hover transition-colors"
          >
            {t.home.scanLibrary}
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="bg-white/10 text-white font-bold px-8 py-3 rounded hover:bg-white/20 transition-colors"
          >
            {t.home.settings}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-premiumflix-dark">
      {/* Hero */}
      {featured && (
        <div className="relative">
          {'files' in featured ? (
            <HeroMovie movie={featured as Movie} onPlay={handleHeroPlay} />
          ) : (
            <HeroShow show={featured as TVShow} onPlay={handleHeroPlay} />
          )}
        </div>
      )}

      {/* Content rows */}
      <div className="-mt-16 relative z-10 pb-16">
        {continueWatching.length > 0 && (
          <ContinueWatchingRow
            title={t.home.continueWatching}
            items={continueWatching}
            onRemove={removeProgress}
          />
        )}

        {(myListMovies.length > 0 || myListShows.length > 0) && (
          <>
            {myListMovies.length > 0 && (
              <MovieRow title={t.home.myListMovies} movies={myListMovies} />
            )}
            {myListShows.length > 0 && (
              <ShowRow title={t.home.myListShows} shows={myListShows} />
            )}
          </>
        )}

        {recentMovies.length > 0 && (
          <MovieRow title={t.home.recentlyAdded} movies={recentMovies} showViewAll="/movies" />
        )}

        {movies.length > 0 && (
          <MovieRow
            title={t.home.allMovies}
            movies={movies.slice(0, 20)}
            showViewAll="/movies"
          />
        )}

        {tvShows.length > 0 && (
          <ShowRow
            title={t.home.allShows}
            shows={tvShows.slice(0, 20)}
            showViewAll="/shows"
          />
        )}
      </div>
    </div>
  )
}
