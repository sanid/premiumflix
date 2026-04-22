import { useMemo } from 'react'
import { useLibrary } from '../contexts/LibraryContext'
import { useCollection } from '../hooks/useCollection'
import { MovieCard, ShowCard } from '../components/MediaCard'
import { useI18n } from '../contexts/I18nContext'

export function Watchlist() {
  const { movies, tvShows } = useLibrary()
  const { watchlistIds, favoriteIds } = useCollection()
  const { t } = useI18n()

  const watchlistMovies = useMemo(
    () => movies.filter((m) => watchlistIds.has(m.id)),
    [movies, watchlistIds],
  )
  const watchlistShows = useMemo(
    () => tvShows.filter((s) => watchlistIds.has(s.id)),
    [tvShows, watchlistIds],
  )
  const favoriteMovies = useMemo(
    () => movies.filter((m) => favoriteIds.has(m.id)),
    [movies, favoriteIds],
  )
  const favoriteShows = useMemo(
    () => tvShows.filter((s) => favoriteIds.has(s.id)),
    [tvShows, favoriteIds],
  )

  const hasWatchlist = watchlistMovies.length > 0 || watchlistShows.length > 0
  const hasFavorites = favoriteMovies.length > 0 || favoriteShows.length > 0

  if (!hasWatchlist && !hasFavorites) {
    return (
      <div className="min-h-screen bg-premiumflix-dark pt-20 flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="text-6xl opacity-20">📋</div>
        <h1 className="text-white text-2xl font-bold">{t.watchlist.emptyTitle}</h1>
        <p className="text-premiumflix-muted max-w-md">
          {t.watchlist.emptyDesc}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-premiumflix-dark pt-20 pb-16">
      <div className="px-4 sm:px-8 lg:px-12">
        <h1 className="text-white text-3xl font-black mb-8">{t.nav.myList}</h1>

        {hasWatchlist && (
          <>
            <h2 className="text-white font-bold text-lg mb-4">{t.watchlist.watchlist}</h2>
            <div
              className="grid gap-3 mb-10"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {watchlistMovies.map((m) => <MovieCard key={m.id} movie={m} />)}
              {watchlistShows.map((s) => <ShowCard key={s.id} show={s} />)}
            </div>
          </>
        )}

        {hasFavorites && (
          <>
            <h2 className="text-white font-bold text-lg mb-4">{t.watchlist.favorites}</h2>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {favoriteMovies.map((m) => <MovieCard key={m.id} movie={m} />)}
              {favoriteShows.map((s) => <ShowCard key={s.id} show={s} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
