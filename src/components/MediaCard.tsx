import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Movie, TVShow } from '../types'
import { movieDisplayTitle, showDisplayTitle, moviePosterUrl, showPosterUrl } from '../types'

interface MovieCardProps {
  movie: Movie
  progressFraction?: number
  onPlay?: () => void
}

interface ShowCardProps {
  show: TVShow
  onPlay?: () => void
}

export function MovieCard({ movie, progressFraction, onPlay }: MovieCardProps) {
  const navigate = useNavigate()
  const [imgError, setImgError] = useState(false)
  const poster = moviePosterUrl(movie)
  const title = movieDisplayTitle(movie)
  const year = movie.tmdbDetail?.release_date?.slice(0, 4) ?? movie.year
  const rating = movie.tmdbDetail?.vote_average

  return (
    <div
      className="group relative flex-shrink-0 cursor-pointer"
      style={{ width: 'var(--card-width, 180px)' }}
      onClick={() => navigate(`/movie/${movie.id}`)}
    >
      <div className="relative overflow-hidden rounded-md bg-premiumflix-surface aspect-[2/3] transition-transform duration-200 group-hover:scale-105 group-hover:z-10 group-hover:shadow-2xl">
        {/* Poster image */}
        {poster && !imgError ? (
          <img
            src={poster}
            alt={title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <PlaceholderPoster title={title} />
        )}

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Info on hover */}
        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200">
          <p className="text-white text-xs font-semibold truncate">{title}</p>
          <div className="flex items-center gap-2 mt-1">
            {year && <span className="text-premiumflix-muted text-xs">{year}</span>}
            {rating && rating > 0 && (
              <span className="text-yellow-400 text-xs">★ {rating.toFixed(1)}</span>
            )}
          </div>
        </div>

        {/* Play button on hover */}
        {onPlay && (
          <button
            onClick={(e) => { e.stopPropagation(); onPlay() }}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 hover:bg-white/30 transition-colors">
              <PlayIcon className="w-5 h-5 text-white" />
            </div>
          </button>
        )}

        {/* Progress bar */}
        {progressFraction !== undefined && progressFraction > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div
              className="h-full bg-premiumflix-red transition-all"
              style={{ width: `${progressFraction * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Title below card (visible always on mobile, hidden on desktop - shown in hover) */}
      <p className="mt-2 text-premiumflix-muted text-xs truncate group-hover:text-white transition-colors md:hidden">
        {title}
      </p>
    </div>
  )
}

export function ShowCard({ show, onPlay }: ShowCardProps) {
  const navigate = useNavigate()
  const [imgError, setImgError] = useState(false)
  const poster = showPosterUrl(show)
  const title = showDisplayTitle(show)
  const year = show.tmdbDetail?.first_air_date?.slice(0, 4) ?? show.year
  const rating = show.tmdbDetail?.vote_average
  const seasons = show.tmdbDetail?.number_of_seasons

  return (
    <div
      className="group relative flex-shrink-0 cursor-pointer"
      style={{ width: 'var(--card-width, 180px)' }}
      onClick={() => navigate(`/show/${show.id}`)}
    >
      <div className="relative overflow-hidden rounded-md bg-premiumflix-surface aspect-[2/3] transition-transform duration-200 group-hover:scale-105 group-hover:z-10 group-hover:shadow-2xl">
        {poster && !imgError ? (
          <img
            src={poster}
            alt={title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <PlaceholderPoster title={title} />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200">
          <p className="text-white text-xs font-semibold truncate">{title}</p>
          <div className="flex items-center gap-2 mt-1">
            {year && <span className="text-premiumflix-muted text-xs">{year}</span>}
            {seasons && <span className="text-premiumflix-muted text-xs">{seasons}S</span>}
            {rating && rating > 0 && (
              <span className="text-yellow-400 text-xs">★ {rating.toFixed(1)}</span>
            )}
          </div>
        </div>

        {onPlay && (
          <button
            onClick={(e) => { e.stopPropagation(); onPlay() }}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 hover:bg-white/30 transition-colors">
              <PlayIcon className="w-5 h-5 text-white" />
            </div>
          </button>
        )}
      </div>

      <p className="mt-2 text-premiumflix-muted text-xs truncate group-hover:text-white transition-colors md:hidden">
        {title}
      </p>
    </div>
  )
}

function PlaceholderPoster({ title }: { title: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-premiumflix-surface to-premiumflix-dark p-3">
      <div className="text-premiumflix-red mb-2">
        <FilmIcon />
      </div>
      <p className="text-white text-xs text-center font-medium line-clamp-3">{title}</p>
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

function FilmIcon() {
  return (
    <svg className="w-8 h-8 opacity-40" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z" />
    </svg>
  )
}
