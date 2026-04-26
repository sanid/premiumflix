import { useRef } from 'react'
import type { Movie, TVShow } from '../types'
import { MovieCard, ShowCard } from './MediaCard'
import { useNavigate } from 'react-router-dom'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { movieDisplayTitle, showDisplayTitle, movieMainFile, moviePosterUrl, showPosterUrl } from '../types'

interface MovieRowProps {
  title: string
  movies: Movie[]
  showViewAll?: string
}

interface ShowRowProps {
  title: string
  shows: TVShow[]
  showViewAll?: string
}

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

interface ContinueWatchingRowProps {
  title: string
  items: ContinueItem[]
  onRemove: (fileId: string) => void
}

function RowShell({
  title,
  showViewAll,
  children,
}: {
  title: string
  showViewAll?: string
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)

  function scrollBy(dir: number) {
    scrollRef.current?.scrollBy({ left: dir * 400, behavior: 'smooth' })
  }

  return (
    <section className="py-4 group/row">
      <div className="px-4 sm:px-8 lg:px-12 flex items-center gap-3 mb-3">
        <h2 className="text-white font-bold text-base sm:text-lg">{title}</h2>
        {showViewAll && (
          <button
            onClick={() => navigate(showViewAll)}
            className="text-premiumflix-red text-sm font-medium opacity-0 group-hover/row:opacity-100 transition-opacity hover:text-white"
          >
            See all →
          </button>
        )}
      </div>

      <div className="relative">
        {/* Left scroll button */}
        <button
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-0 bottom-0 z-10 px-2 flex items-center bg-gradient-to-r from-premiumflix-dark to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <div className="bg-black/60 rounded-full p-1.5 hover:bg-black/80">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </button>

        {/* Card list */}
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide px-4 sm:px-8 lg:px-12 pb-2"
          style={
            {
              '--card-width': '160px',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            } as React.CSSProperties
          }
        >
          {children}
        </div>

        {/* Right scroll button */}
        <button
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-0 bottom-0 z-10 px-2 flex items-center bg-gradient-to-l from-premiumflix-dark to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <div className="bg-black/60 rounded-full p-1.5 hover:bg-black/80">
            <ChevronRight className="w-5 h-5 text-white" />
          </div>
        </button>
      </div>
    </section>
  )
}

export function MovieRow({ title, movies, showViewAll }: MovieRowProps) {
  const { getProgressFraction, isFinished } = useWatchProgress()

  return (
    <RowShell title={title} showViewAll={showViewAll}>
      {movies.map((movie) => {
        const mainFile = movieMainFile(movie)
        const fraction = mainFile ? getProgressFraction(mainFile.id) : 0
        return (
          <MovieCard
            key={movie.id}
            movie={movie}
            progressFraction={fraction > 0 ? fraction : undefined}
            isWatched={movie.files.some(f => isFinished(f.id))}
          />
        )
      })}
    </RowShell>
  )
}

export function ShowRow({ title, shows, showViewAll }: ShowRowProps) {
  return (
    <RowShell title={title} showViewAll={showViewAll}>
      {shows.map((show) => (
        <ShowCard key={show.id} show={show} />
      ))}
    </RowShell>
  )
}

export function ContinueWatchingRow({ title, items, onRemove }: ContinueWatchingRowProps) {
  const navigate = useNavigate()
  const { getProgressFraction } = useWatchProgress()
  const scrollRef = useRef<HTMLDivElement>(null)

  function scrollBy(dir: number) {
    scrollRef.current?.scrollBy({ left: dir * 400, behavior: 'smooth' })
  }

  return (
    <section className="py-4 group/row">
      <div className="px-4 sm:px-8 lg:px-12 flex items-center gap-3 mb-3">
        <h2 className="text-white font-bold text-base sm:text-lg">{title}</h2>
      </div>

      <div className="relative">
        <button
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-0 bottom-0 z-10 px-2 flex items-center bg-gradient-to-r from-premiumflix-dark to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <div className="bg-black/60 rounded-full p-1.5 hover:bg-black/80">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </button>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-8 lg:px-12 pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          {items.map((item) => {
            const fraction = getProgressFraction(item.fileId)
            const isMovie = item.type === 'movie'
            const poster = isMovie ? moviePosterUrl(item.movie) : showPosterUrl(item.show)
            const title = isMovie ? movieDisplayTitle(item.movie) : showDisplayTitle(item.show)
            const sub = isMovie
              ? (item.movie.tmdbDetail?.release_date?.slice(0, 4) ?? item.movie.year)
              : (item as any).episodeLabel

            function handleClick() {
              if (item.type === 'movie') {
                navigate(`/movie/${item.movie.id}`)
              } else {
                navigate(`/show/${item.show.id}`)
              }
            }

            function handlePlay(e: React.MouseEvent) {
              e.stopPropagation()
              if (item.type === 'movie') {
                navigate(`/play/movie/${item.movie.id}/${item.fileId}`)
              } else {
                navigate(`/play/show/${item.show.id}/${item.fileId}`)
              }
            }

            function handleRemove(e: React.MouseEvent) {
              e.stopPropagation()
              onRemove(item.fileId)
            }

            return (
              <div
                key={`${item.type}-${item.fileId}`}
                className="group/cw relative flex-shrink-0 cursor-pointer"
                style={{ width: '220px' }}
                onClick={handleClick}
              >
                {/* Poster */}
                <div className="relative overflow-hidden rounded-md bg-premiumflix-surface aspect-video transition-transform duration-200 group-hover/cw:scale-105 group-hover/cw:z-10 group-hover/cw:shadow-2xl">
                  {poster ? (
                    <img
                      src={poster}
                      alt={title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-premiumflix-surface to-premiumflix-dark">
                      <span className="text-premiumflix-muted text-xs text-center px-2">{title}</span>
                    </div>
                  )}

                  {/* Gradient + play button on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/cw:opacity-100 transition-opacity duration-200" />

                  {/* Play button */}
                  <button
                    onClick={handlePlay}
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cw:opacity-100 transition-opacity duration-200"
                  >
                    <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 hover:bg-white/30 transition-colors">
                      <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </button>

                  {/* Remove button */}
                  <button
                    onClick={handleRemove}
                    className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover/cw:opacity-100 transition-opacity hover:bg-black/80"
                    title="Remove from Continue Watching"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Progress bar */}
                  {fraction > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                      <div
                        className="h-full bg-premiumflix-red transition-all"
                        style={{ width: `${fraction * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Title + sub below */}
                <p className="mt-1.5 text-white text-xs font-semibold truncate">{title}</p>
                {sub && <p className="text-premiumflix-muted text-xs truncate">{sub}</p>}
              </div>
            )
          })}
        </div>

        <button
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-0 bottom-0 z-10 px-2 flex items-center bg-gradient-to-l from-premiumflix-dark to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <div className="bg-black/60 rounded-full p-1.5 hover:bg-black/80">
            <ChevronRight className="w-5 h-5 text-white" />
          </div>
        </button>
      </div>
    </section>
  )
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}
