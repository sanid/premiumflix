import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useLibrary } from '../contexts/LibraryContext'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { itemDetails } from '../services/premiumize'
import { getCredits } from '../services/metadata'
import {
  movieDisplayTitle,
  showDisplayTitle,
  backdropUrl,
  posterUrl,
  profileUrl,
  stillUrl,
  formatRuntime,
  movieMainFile,
  formatFileSize,
} from '../types'
import type { Movie, TVShow, Season, Episode } from '../types'
import { useI18n } from '../contexts/I18nContext'

export function MovieDetail() {
  const { id } = useParams<{ id: string }>()
  const { movies, removeMovieFromLibrary, isLoading, updateMovieInLibrary, isFavorite, isOnWatchlist, toggleFavorite, toggleWatchlist } = useLibrary()
  const { getProgressFraction, isFinished } = useWatchProgress()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const movie = movies.find((m) => m.id === id)

  const [localCredits, setLocalCredits] = useState(movie?.credits)

  useEffect(() => {
    if (movie) setLocalCredits(movie.credits)
    if (movie && !movie.credits && movie.tmdbDetail) {
      getCredits(movie.tmdbDetail, 'movie').then((c) => {
        setLocalCredits(c)
        updateMovieInLibrary({ ...movie, credits: c })
      }).catch(console.error)
    }
  }, [movie])

  if (!movie) {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-premiumflix-dark flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-premiumflix-dark flex items-center justify-center">
        <p className="text-premiumflix-muted">{t.detail.movieNotFound}</p>
      </div>
    )
  }

  const title = movieDisplayTitle(movie)
  const backdrop = backdropUrl(movie.tmdbDetail?.backdrop_path)
  const poster = posterUrl(movie.tmdbDetail?.poster_path)
  const year = movie.tmdbDetail?.release_date?.slice(0, 4) ?? movie.year
  const runtime = formatRuntime(movie.tmdbDetail?.runtime)
  const rating = movie.tmdbDetail?.vote_average
  const genres = movie.tmdbDetail?.genres
  const overview = movie.tmdbDetail?.overview
  const tagline = movie.tmdbDetail?.tagline
  const cast = localCredits?.cast.slice(0, 12) ?? []
  const director = localCredits?.crew.find((c) => c.job === 'Director')
  const mainFile = movieMainFile(movie)
  const fav = isFavorite(movie.id)
  const wl = isOnWatchlist(movie.id)
  const progress = mainFile ? getProgressFraction(mainFile.id) : 0

  function play(fileId?: string) {
    const fid = fileId ?? mainFile?.id
    if (!fid) return
    navigate(`/play/movie/${movie!.id}/${fid}`)
  }

  return (
    <DetailShell
      backdrop={backdrop}
      poster={poster}
      title={title}
      year={year}
      rating={rating}
      genres={genres?.map((g) => g.name)}
      runtime={formatRuntime(movie.tmdbDetail?.runtime)}
      overview={overview}
      tagline={tagline}
      cast={cast}
      director={director?.name}
      trailerKey={movie.trailerKey}
      isFavorite={fav}
      isOnWatchlist={wl}
      progressFraction={progress}
      onPlay={() => play()}
      onToggleFavorite={() => toggleFavorite(movie!.id, 'movie')}
      onToggleWatchlist={() => toggleWatchlist(movie!.id, 'movie')}
      onDelete={() => {
        if (deleteConfirm) {
          removeMovieFromLibrary(movie!.id).then(() => navigate('/'))
        } else {
          setDeleteConfirm(true)
          setTimeout(() => setDeleteConfirm(false), 4000)
        }
      }}
      deleteConfirm={deleteConfirm}
    >
      {/* Files section */}
      {movie.files.length > 0 && (
        <section className="mt-8">
          <h3 className="text-white font-bold text-lg mb-3">{t.detail.files}</h3>
          <div className="space-y-2">
            {movie.files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between bg-premiumflix-surface rounded-md px-4 py-3 cursor-pointer hover:bg-premiumflix-card transition-colors"
                onClick={() => play(file.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm truncate">{file.fileName}</p>
                  <div className="flex gap-3 mt-1 text-premiumflix-muted text-xs">
                    {file.resolution && <span>{file.resolution}</span>}
                    {file.videoCodec && <span>{file.videoCodec.toUpperCase()}</span>}
                    {file.audioCodec && <span>{file.audioCodec.toUpperCase()}</span>}
                    {file.language && <span>{file.language.toUpperCase()}</span>}
                    {file.size > 0 && <span>{formatFileSize(file.size)}</span>}
                  </div>
                </div>
                <PlayButtonSmall />
              </div>
            ))}
          </div>
        </section>
      )}
    </DetailShell>
  )
}

export function ShowDetail() {
  const { id } = useParams<{ id: string }>()
  const { tvShows, removeShowFromLibrary, isLoading, updateShowInLibrary, isFavorite, isOnWatchlist, toggleFavorite, toggleWatchlist } = useLibrary()
  const { getProgressFraction } = useWatchProgress()
  const { t } = useI18n()
  const navigate = useNavigate()

  const show = tvShows.find((s) => s.id === id)
  const [selectedSeason, setSelectedSeason] = useState(0)
  const [localCredits, setLocalCredits] = useState(show?.credits)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    if (show?.seasons.length) setSelectedSeason(0)
    if (show) setLocalCredits(show.credits)
    if (show && !show.credits && show.tmdbDetail) {
      getCredits(show.tmdbDetail, 'tv').then((c) => {
        setLocalCredits(c)
        updateShowInLibrary({ ...show, credits: c })
      }).catch(console.error)
    }
  }, [show])

  if (!show) {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-premiumflix-dark flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-premiumflix-dark flex items-center justify-center">
        <p className="text-premiumflix-muted">{t.detail.showNotFound}</p>
      </div>
    )
  }

  const title = showDisplayTitle(show)
  const backdrop = backdropUrl(show.tmdbDetail?.backdrop_path)
  const poster = posterUrl(show.tmdbDetail?.poster_path)
  const year = show.tmdbDetail?.first_air_date?.slice(0, 4) ?? show.year
  const seasons = show.tmdbDetail?.number_of_seasons
  const episodes = show.tmdbDetail?.number_of_episodes
  const rating = show.tmdbDetail?.vote_average
  const genres = show.tmdbDetail?.genres
  const overview = show.tmdbDetail?.overview
  const tagline = show.tmdbDetail?.tagline
  const cast = localCredits?.cast.slice(0, 12) ?? []
  const fav = isFavorite(show.id)
  const wl = isOnWatchlist(show.id)

  const sortedSeasons = [...show.seasons].sort((a, b) => a.number - b.number)
  const currentSeason = sortedSeasons[selectedSeason]

  function playEpisode(ep: Episode) {
    navigate(`/play/show/${show!.id}/${ep.file.id}`)
  }

  return (
    <DetailShell
      backdrop={backdrop}
      poster={poster}
      title={title}
      year={year}
      rating={rating}
      genres={genres?.map((g) => g.name)}
      runtime={seasons ? `${seasons} Season${seasons !== 1 ? 's' : ''}` : undefined}
      overview={overview}
      tagline={tagline}
      cast={cast}
      trailerKey={show.trailerKey}
      isFavorite={fav}
      isOnWatchlist={wl}
      progressFraction={0}
      onPlay={() => {
        const firstEp = sortedSeasons[0]?.episodes[0]
        if (firstEp) playEpisode(firstEp)
      }}
      onToggleFavorite={() => toggleFavorite(show.id, 'show')}
      onToggleWatchlist={() => toggleWatchlist(show.id, 'show')}
      onDelete={() => {
        if (deleteConfirm) {
          removeShowFromLibrary(show!.id).then(() => navigate('/'))
        } else {
          setDeleteConfirm(true)
          setTimeout(() => setDeleteConfirm(false), 4000)
        }
      }}
      deleteConfirm={deleteConfirm}
    >
      {/* Season selector + episodes */}
      {sortedSeasons.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <h3 className="text-white font-bold text-lg">{t.detail.episodes}</h3>
            {sortedSeasons.length > 1 && (
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
                className="ml-4 bg-premiumflix-surface border border-white/10 text-white text-sm px-3 py-1.5 rounded outline-none cursor-pointer"
              >
                {sortedSeasons.map((s, i) => (
                  <option key={s.id} value={i}>
                    {s.tmdbSeason?.name ?? `Season ${s.number}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {currentSeason && (
            <div className="space-y-2">
              {[...currentSeason.episodes]
                .sort((a, b) => a.number - b.number)
                .map((ep) => {
                  const fraction = getProgressFraction(ep.file.id)
                  const tmdbEp = ep.tmdbEpisode
                  const still = stillUrl(tmdbEp?.still_path)

                  return (
                    <div
                      key={ep.id}
                      className="flex gap-3 bg-premiumflix-surface rounded-md overflow-hidden cursor-pointer hover:bg-premiumflix-card transition-colors group"
                      onClick={() => playEpisode(ep)}
                    >
                      {/* Still image */}
                      <div className="relative flex-shrink-0 w-32 sm:w-40 aspect-video bg-premiumflix-dark overflow-hidden">
                        {still ? (
                          <img src={still} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-premiumflix-muted/30 text-xs">
                            Ep {ep.number}
                          </div>
                        )}
                        {/* Progress */}
                        {fraction > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                            <div className="h-full bg-premiumflix-red" style={{ width: `${fraction * 100}%` }} />
                          </div>
                        )}
                        {/* Play overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                          <div className="bg-white/20 rounded-full p-1.5">
                            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 py-3 pr-3">
                        <p className="text-white text-sm font-medium">
                          {tmdbEp ? (
                            <>E{String(ep.number).padStart(2, '0')} — {tmdbEp.name ?? ep.name}</>
                          ) : (
                            `Episode ${ep.number}`
                          )}
                        </p>
                        {tmdbEp?.overview && (
                          <p className="text-premiumflix-muted text-xs mt-1 line-clamp-2">{tmdbEp.overview}</p>
                        )}
                        <div className="flex gap-2 mt-1 text-premiumflix-muted text-xs flex-wrap">
                          {tmdbEp?.air_date && <span>{tmdbEp.air_date.slice(0, 4)}</span>}
                          {ep.file.resolution && <span>{ep.file.resolution}</span>}
                          {ep.file.videoCodec && <span>{ep.file.videoCodec.toUpperCase()}</span>}
                          {ep.file.audioCodec && <span>{ep.file.audioCodec.toUpperCase()}</span>}
                          {ep.file.language && <span>{ep.file.language.toUpperCase()}</span>}
                          {ep.file.size > 0 && <span>{formatFileSize(ep.file.size)}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </section>
      )}
    </DetailShell>
  )
}

// ─── Shared detail shell ──────────────────────────────────────────────────────

interface DetailShellProps {
  backdrop?: string
  poster?: string
  title: string
  year?: string
  rating?: number
  genres?: string[]
  runtime?: string
  overview?: string
  tagline?: string
  cast: Array<{ id: number; name: string; character?: string; profile_path?: string }>
  director?: string
  trailerKey?: string
  isFavorite: boolean
  isOnWatchlist: boolean
  progressFraction: number
  onPlay: () => void
  onToggleFavorite: () => void
  onToggleWatchlist: () => void
  onDelete?: () => void
  deleteConfirm?: boolean
  children?: React.ReactNode
}

function DetailShell({
  backdrop,
  poster,
  title,
  year,
  rating,
  genres,
  runtime,
  overview,
  tagline,
  cast,
  director,
  trailerKey,
  isFavorite,
  isOnWatchlist,
  progressFraction,
  onPlay,
  onToggleFavorite,
  onToggleWatchlist,
  onDelete,
  deleteConfirm,
  children,
}: DetailShellProps) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [trailerOpen, setTrailerOpen] = useState(false)

  return (
    <div className="min-h-screen bg-premiumflix-dark">
      {/* Backdrop hero */}
      <div className="relative w-full" style={{ height: 'min(55vh, 500px)' }}>
        {backdrop ? (
          <img src={backdrop} alt={title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-premiumflix-surface to-premiumflix-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-premiumflix-dark via-premiumflix-dark/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-premiumflix-dark/80 to-transparent" />

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-4 sm:left-8 text-white/70 hover:text-white transition-colors flex items-center gap-2 text-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t.detail.back}
        </button>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-8 lg:px-12 -mt-32 relative z-10 max-w-6xl pb-24">
        <div className="flex gap-6 sm:gap-8">
          {/* Poster */}
          {poster && (
            <div className="hidden sm:block flex-shrink-0 w-40 lg:w-52 rounded-lg overflow-hidden shadow-2xl">
              <img src={poster} alt={title} className="w-full" />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-white text-2xl sm:text-3xl lg:text-4xl font-black leading-tight mb-2">
              {title}
            </h1>

            {tagline && <p className="text-premiumflix-muted italic text-sm mb-3">{tagline}</p>}

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
              {year && <span className="text-premiumflix-muted">{year}</span>}
              {runtime && <span className="text-premiumflix-muted">{runtime}</span>}
              {rating && rating > 0 && (
                <span className="flex items-center gap-1 text-yellow-400 font-medium">
                  <span>★</span> {rating.toFixed(1)}
                </span>
              )}
              {genres?.map((g) => (
                <span key={g} className="border border-white/20 text-premiumflix-muted px-2 py-0.5 rounded text-xs">
                  {g}
                </span>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={onPlay}
                className="flex items-center gap-2 bg-white text-black font-bold px-6 py-2.5 rounded hover:bg-white/80 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {progressFraction > 0.05 ? t.detail.resume : t.detail.play}
              </button>

              <button
                onClick={onToggleWatchlist}
                className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded transition-colors ${
                  isOnWatchlist
                    ? 'bg-white/20 text-white'
                    : 'bg-premiumflix-surface border border-white/20 text-white hover:bg-premiumflix-card'
                }`}
              >
                {isOnWatchlist ? (
                  <><CheckIcon className="w-5 h-5" /> {t.detail.inMyList}</>
                ) : (
                  <><PlusIcon className="w-5 h-5" /> {t.detail.addToList}</>
                )}
              </button>

              <button
                onClick={onToggleFavorite}
                className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded transition-colors ${
                  isFavorite
                    ? 'bg-premiumflix-red text-white'
                    : 'bg-premiumflix-surface border border-white/20 text-white hover:bg-premiumflix-card'
                }`}
              >
                <HeartIcon className="w-5 h-5" filled={isFavorite} />
                {isFavorite ? t.detail.liked : t.detail.like}
              </button>

              {trailerKey && (
                <button
                  onClick={() => setTrailerOpen(true)}
                  className="flex items-center gap-2 bg-premiumflix-surface border border-white/20 text-white font-bold px-5 py-2.5 rounded hover:bg-premiumflix-card transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                  </svg>
                  {t.detail.trailer}
                </button>
              )}

              {onDelete && (
                <button
                  onClick={onDelete}
                  className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded transition-colors ${
                    deleteConfirm
                      ? 'bg-red-700 text-white animate-pulse'
                      : 'bg-premiumflix-surface border border-red-700/50 text-red-400 hover:bg-red-700/20'
                  }`}
                  title="Remove from library"
                >
                  <TrashIcon className="w-5 h-5" />
                  {deleteConfirm ? 'Tap again to confirm' : 'Remove'}
                </button>
              )}

              {/* Trailer modal */}
              {trailerOpen && trailerKey && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                  onClick={() => setTrailerOpen(false)}
                >
                  <div
                    className="relative w-full max-w-3xl aspect-video"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setTrailerOpen(false)}
                      className="absolute -top-9 right-0 text-white/70 hover:text-white text-sm font-medium"
                    >
                      ✕ Close
                    </button>
                    <iframe
                      src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
                      allow="autoplay; encrypted-media; fullscreen"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>

            {progressFraction > 0 && (
              <div className="mb-4">
                <div className="h-1 bg-white/20 rounded-full overflow-hidden w-64">
                  <div className="h-full bg-premiumflix-red" style={{ width: `${progressFraction * 100}%` }} />
                </div>
                <p className="text-premiumflix-muted text-xs mt-1">
                  {Math.round(progressFraction * 100)}% {t.detail.watched}
                </p>
              </div>
            )}

            {/* Overview */}
            {overview && (
              <p className="text-white/80 text-sm sm:text-base leading-relaxed max-w-2xl">{overview}</p>
            )}

            {/* Director */}
            {director && (
              <p className="text-premiumflix-muted text-sm mt-3">
                <span className="text-white/60">{t.detail.director} </span>{director}
              </p>
            )}
          </div>
        </div>

        {/* Cast */}
        {cast.length > 0 && (
          <section className="mt-10">
            <h3 className="text-white font-bold text-lg mb-4">{t.detail.cast}</h3>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {cast.map((actor) => (
                <a
                  key={actor.id}
                  href={`/person/${actor.id}`}
                  onClick={(e) => { e.preventDefault(); navigate(`/person/${actor.id}`) }}
                  className="flex-shrink-0 w-24 text-center cursor-pointer group"
                >
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-premiumflix-surface mx-auto mb-2 ring-2 ring-transparent group-hover:ring-premiumflix-red/50 transition-all">
                    {actor.profile_path ? (
                      <img
                        src={profileUrl(actor.profile_path)}
                        alt={actor.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-premiumflix-muted text-2xl">
                        {actor.name[0]}
                      </div>
                    )}
                  </div>
                  <p className="text-white text-xs font-medium truncate group-hover:text-premiumflix-red transition-colors">{actor.name}</p>
                  {actor.character && (
                    <p className="text-premiumflix-muted text-xs truncate">{actor.character}</p>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Children (files list for movies, episodes for shows) */}
        {children}
      </div>
    </div>
  )
}

function PlayButtonSmall() {
  return (
    <svg className="w-8 h-8 text-premiumflix-red flex-shrink-0 ml-2" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function HeartIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

