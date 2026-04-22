import { useNavigate } from 'react-router-dom'
import type { Movie, TVShow } from '../types'
import {
  movieDisplayTitle,
  showDisplayTitle,
  movieBackdropUrl,
  showBackdropUrl,
  backdropUrl,
  formatRuntime,
} from '../types'
import { useI18n } from '../contexts/I18nContext'

interface HeroMovieProps {
  movie: Movie
  onPlay: () => void
}

interface HeroShowProps {
  show: TVShow
  onPlay: () => void
}

export function HeroMovie({ movie, onPlay }: HeroMovieProps) {
  const navigate = useNavigate()
  const title = movieDisplayTitle(movie)
  const backdrop = movieBackdropUrl(movie)
  const overview = movie.tmdbDetail?.overview
  const year = movie.tmdbDetail?.release_date?.slice(0, 4) ?? movie.year
  const rating = movie.tmdbDetail?.vote_average
  const runtime = formatRuntime(movie.tmdbDetail?.runtime)
  const genres = movie.tmdbDetail?.genres?.slice(0, 3).map((g) => g.name)
  const logoUrl = movie.logoPath ? `https://image.tmdb.org/t/p/w500${movie.logoPath}` : undefined

  return (
    <HeroShell
      backdrop={backdrop}
      logoUrl={logoUrl}
      title={title}
      overview={overview}
      year={year}
      rating={rating}
      runtime={runtime}
      genres={genres}
      onPlay={onPlay}
      onInfo={() => navigate(`/movie/${movie.id}`)}
    />
  )
}

export function HeroShow({ show, onPlay }: HeroShowProps) {
  const navigate = useNavigate()
  const title = showDisplayTitle(show)
  const backdrop = showBackdropUrl(show)
  const overview = show.tmdbDetail?.overview
  const year = show.tmdbDetail?.first_air_date?.slice(0, 4) ?? show.year
  const rating = show.tmdbDetail?.vote_average
  const seasons = show.tmdbDetail?.number_of_seasons
  const genres = show.tmdbDetail?.genres?.slice(0, 3).map((g) => g.name)
  const logoUrl = show.logoPath ? `https://image.tmdb.org/t/p/w500${show.logoPath}` : undefined

  return (
    <HeroShell
      backdrop={backdrop}
      logoUrl={logoUrl}
      title={title}
      overview={overview}
      year={year}
      rating={rating}
      runtime={seasons ? `${seasons} Season${seasons !== 1 ? 's' : ''}` : undefined}
      genres={genres}
      onPlay={onPlay}
      onInfo={() => navigate(`/show/${show.id}`)}
    />
  )
}

interface HeroShellProps {
  backdrop?: string
  logoUrl?: string
  title: string
  overview?: string
  year?: string
  rating?: number
  runtime?: string
  genres?: string[]
  onPlay: () => void
  onInfo: () => void
}

function HeroShell({
  backdrop,
  logoUrl,
  title,
  overview,
  year,
  rating,
  runtime,
  genres,
  onPlay,
  onInfo,
}: HeroShellProps) {
  const { t } = useI18n()
  return (
    <div className="relative w-full" style={{ height: 'min(80vh, 700px)' }}>
      {/* Backdrop */}
      {backdrop ? (
        <img
          src={backdrop}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-premiumflix-surface to-premiumflix-dark" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-premiumflix-dark via-transparent to-transparent" />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end pb-16 px-4 sm:px-8 lg:px-12 max-w-3xl">
        {/* Logo or title */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={title}
            className="max-h-24 sm:max-h-32 w-auto max-w-xs sm:max-w-sm object-contain mb-4 drop-shadow-2xl"
          />
        ) : (
          <h1 className="text-3xl sm:text-5xl font-black text-white mb-4 drop-shadow-lg leading-tight">
            {title}
          </h1>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {rating && rating > 0 && (
            <span className="text-green-400 font-semibold text-sm">
              {Math.round(rating * 10)}{t.home.match}
            </span>
          )}
          {year && <span className="text-premiumflix-muted text-sm">{year}</span>}
          {runtime && <span className="text-premiumflix-muted text-sm">{runtime}</span>}
          {genres?.map((g) => (
            <span key={g} className="text-premiumflix-muted text-sm border border-premiumflix-muted/40 px-2 py-0.5 rounded">
              {g}
            </span>
          ))}
        </div>

        {/* Overview */}
        {overview && (
          <p className="text-white/80 text-sm sm:text-base line-clamp-3 mb-6 max-w-lg">
            {overview}
          </p>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onPlay}
            className="flex items-center gap-2 bg-white text-black font-bold px-6 py-2.5 rounded hover:bg-white/80 transition-colors text-sm sm:text-base"
          >
            <PlayIcon className="w-5 h-5" />
            {t.home.play}
          </button>
          <button
            onClick={onInfo}
            className="flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white font-bold px-6 py-2.5 rounded hover:bg-white/30 transition-colors text-sm sm:text-base"
          >
            <InfoIcon className="w-5 h-5" />
            {t.home.moreInfo}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
