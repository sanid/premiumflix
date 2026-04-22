import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { MovieCard, ShowCard } from '../components/MediaCard'
import { movieDisplayTitle, showDisplayTitle } from '../types'
import { useI18n } from '../contexts/I18nContext'

export function Search() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const { movies, tvShows } = useLibrary()
  const { t } = useI18n()

  const q = query.toLowerCase()

  const matchedMovies = useMemo(() => {
    if (!q) return []
    return movies.filter(
      (m) =>
        movieDisplayTitle(m).toLowerCase().includes(q) ||
        m.tmdbDetail?.overview?.toLowerCase().includes(q) ||
        m.tmdbDetail?.genres?.some((g) => g.name.toLowerCase().includes(q)),
    )
  }, [movies, q])

  const matchedShows = useMemo(() => {
    if (!q) return []
    return tvShows.filter(
      (s) =>
        showDisplayTitle(s).toLowerCase().includes(q) ||
        s.tmdbDetail?.overview?.toLowerCase().includes(q) ||
        s.tmdbDetail?.genres?.some((g) => g.name.toLowerCase().includes(q)),
    )
  }, [tvShows, q])

  const total = matchedMovies.length + matchedShows.length

  return (
    <div className="min-h-screen bg-premiumflix-dark pt-20 pb-16">
      <div className="px-4 sm:px-8 lg:px-12">
        <h1 className="text-white text-2xl font-bold mb-2">
          {t.search.resultsFor} &ldquo;{query}&rdquo;
        </h1>
        <p className="text-premiumflix-muted text-sm mb-8">{total} {t.search.results}</p>

        {total === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-premiumflix-muted text-xl mb-2">{t.search.noResults}</p>
            <p className="text-premiumflix-muted/60 text-sm">{t.search.tryDifferent}</p>
          </div>
        )}

        {matchedMovies.length > 0 && (
          <section className="mb-10">
            <h2 className="text-white font-bold text-lg mb-4">{t.nav.movies} ({matchedMovies.length})</h2>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {matchedMovies.map((m) => <MovieCard key={m.id} movie={m} />)}
            </div>
          </section>
        )}

        {matchedShows.length > 0 && (
          <section>
            <h2 className="text-white font-bold text-lg mb-4">{t.nav.shows} ({matchedShows.length})</h2>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {matchedShows.map((s) => <ShowCard key={s.id} show={s} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
