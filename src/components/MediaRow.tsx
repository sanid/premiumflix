import { useRef } from 'react'
import type { Movie, TVShow } from '../types'
import { MovieCard, ShowCard } from './MediaCard'
import { useNavigate } from 'react-router-dom'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { movieMainFile } from '../types'

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
  const { getProgressFraction } = useWatchProgress()

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
