import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { MovieCard, ShowCard } from '../components/MediaCard'
import { movieDisplayTitle, showDisplayTitle, posterUrl } from '../types'
import type { TMDBMovie } from '../types'
import { searchMovieRaw, searchTVRaw } from '../services/metadata'
import { useI18n } from '../contexts/I18nContext'

export function Search() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const { movies, tvShows } = useLibrary()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [discoverResults, setDiscoverResults] = useState<TMDBMovie[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)

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

  // TMDB discovery for titles not in the library — links into the Add flow
  useEffect(() => {
    if (!query.trim()) {
      setDiscoverResults([])
      return
    }
    let cancelled = false
    setDiscoverLoading(true)
    Promise.allSettled([searchMovieRaw(query), searchTVRaw(query)])
      .then(([movieRes, tvRes]) => {
        if (cancelled) return
        const results: TMDBMovie[] = []
        if (movieRes.status === 'fulfilled') results.push(...movieRes.value.results.slice(0, 8))
        if (tvRes.status === 'fulfilled') results.push(...tvRes.value.results.slice(0, 8))
        results.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        setDiscoverResults(results.slice(0, 12))
      })
      .finally(() => { if (!cancelled) setDiscoverLoading(false) })
    return () => { cancelled = true }
  }, [query])

  const libraryTmdbIds = useMemo(() => {
    const ids = new Set<number>()
    for (const m of movies) if (m.tmdbId) ids.add(m.tmdbId)
    for (const s of tvShows) if (s.tmdbId) ids.add(s.tmdbId)
    return ids
  }, [movies, tvShows])

  const discoverNew = discoverResults.filter((r) => !libraryTmdbIds.has(r.id))

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
          <section className="mb-10">
            <h2 className="text-white font-bold text-lg mb-4">{t.nav.shows} ({matchedShows.length})</h2>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {matchedShows.map((s) => <ShowCard key={s.id} show={s} />)}
            </div>
          </section>
        )}

        {/* TMDB discovery — titles not in the library yet */}
        {(discoverNew.length > 0 || discoverLoading) && (
          <section>
            <h2 className="text-white font-bold text-lg mb-4">{t.search.discover}</h2>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {discoverNew.map((r) => {
                const isMovie = r.title !== undefined
                const title = r.title ?? r.name ?? ''
                const year = (r.release_date ?? r.first_air_date ?? '').slice(0, 4)
                const poster = posterUrl(r.poster_path)
                return (
                  <button
                    key={`${isMovie ? 'm' : 's'}-${r.id}`}
                    onClick={() => navigate(`/add-movie?tmdbId=${r.id}&type=${isMovie ? 'movie' : 'show'}`)}
                    className="group text-left cursor-pointer"
                  >
                    <div className="relative overflow-hidden rounded-md bg-premiumflix-surface aspect-[2/3] transition-transform duration-200 group-hover:scale-105 group-hover:shadow-2xl">
                      {poster ? (
                        <img src={poster} alt={title} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-premiumflix-muted/30 text-xs">?</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
                        <p className="text-white text-xs font-semibold truncate">{title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {year && <span className="text-premiumflix-muted text-xs">{year}</span>}
                          {r.vote_average ? <span className="text-yellow-400 text-xs">★ {r.vote_average.toFixed(1)}</span> : null}
                        </div>
                      </div>
                      <div className="absolute top-2 right-2 bg-premiumflix-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {t.search.grab}
                      </div>
                    </div>
                    <p className="mt-2 text-premiumflix-muted text-xs truncate group-hover:text-white transition-colors md:hidden">
                      {title}
                    </p>
                  </button>
                )
              })}
              {discoverLoading && discoverNew.length === 0 && (
                <div className="col-span-full flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
