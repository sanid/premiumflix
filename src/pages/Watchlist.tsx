import { useState, useMemo } from 'react'
import { useLibrary } from '../contexts/LibraryContext'
import { useCollection } from '../hooks/useCollection'
import { MovieCard, ShowCard } from '../components/MediaCard'
import { useI18n } from '../contexts/I18nContext'
import { movieDisplayTitle, showDisplayTitle } from '../types'

type SortKey = 'title' | 'year' | 'rating' | 'added'
type FilterKey = 'all' | 'watchlist' | 'favorites'

export function Watchlist() {
  const { movies, tvShows } = useLibrary()
  const { watchlistIds, favoriteIds } = useCollection()
  const { t } = useI18n()

  const [sort, setSort] = useState<SortKey>('added')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')

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

  const filteredMovies = useMemo(() => {
    let list: typeof movies = []
    if (filter === 'all' || filter === 'watchlist') list = [...list, ...watchlistMovies]
    if (filter === 'all' || filter === 'favorites') list = [...list, ...favoriteMovies]
    const seen = new Set<string>()
    list = list.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        movieDisplayTitle(m).toLowerCase().includes(q) ||
        m.tmdbDetail?.overview?.toLowerCase().includes(q)
      )
    }

    list.sort((a, b) => {
      switch (sort) {
        case 'title': return movieDisplayTitle(a).localeCompare(movieDisplayTitle(b))
        case 'year': return (b.tmdbDetail?.release_date?.slice(0,4) ?? b.year ?? '').localeCompare(a.tmdbDetail?.release_date?.slice(0,4) ?? a.year ?? '')
        case 'rating': return (b.tmdbDetail?.vote_average ?? 0) - (a.tmdbDetail?.vote_average ?? 0)
        case 'added': return (b.addedAt ?? 0) - (a.addedAt ?? 0)
      }
    })
    return list
  }, [watchlistMovies, favoriteMovies, filter, search, sort])

  const filteredShows = useMemo(() => {
    let list: typeof tvShows = []
    if (filter === 'all' || filter === 'watchlist') list = [...list, ...watchlistShows]
    if (filter === 'all' || filter === 'favorites') list = [...list, ...favoriteShows]
    const seen = new Set<string>()
    list = list.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true })

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        showDisplayTitle(s).toLowerCase().includes(q) ||
        s.tmdbDetail?.overview?.toLowerCase().includes(q)
      )
    }

    list.sort((a, b) => {
      switch (sort) {
        case 'title': return showDisplayTitle(a).localeCompare(showDisplayTitle(b))
        case 'year': return (b.tmdbDetail?.first_air_date?.slice(0,4) ?? b.year ?? '').localeCompare(a.tmdbDetail?.first_air_date?.slice(0,4) ?? a.year ?? '')
        case 'rating': return (b.tmdbDetail?.vote_average ?? 0) - (a.tmdbDetail?.vote_average ?? 0)
        case 'added': return (b.tmdbDetail?.number_of_seasons ?? 0) - (a.tmdbDetail?.number_of_seasons ?? 0)
      }
    })
    return list
  }, [watchlistShows, favoriteShows, filter, search, sort])

  const hasItems = filteredMovies.length > 0 || filteredShows.length > 0
  const totalItems = filteredMovies.length + filteredShows.length

  if (!hasItems && !search && filter === 'all' && watchlistMovies.length === 0 && favoriteMovies.length === 0 && watchlistShows.length === 0 && favoriteShows.length === 0) {
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
        <h1 className="text-white text-3xl font-black mb-6">{t.nav.myList}</h1>

        <div className="flex flex-wrap gap-3 items-center mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder={t.watchlist.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-premiumflix-surface border border-white/10 text-white text-sm px-3 py-2 pl-9 rounded-md outline-none focus:border-white/40 w-52"
            />
            <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-premiumflix-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex bg-premiumflix-surface rounded-md overflow-hidden border border-white/10">
            {(['all', 'watchlist', 'favorites'] as FilterKey[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 text-sm transition-colors ${
                  filter === f ? 'bg-premiumflix-red text-white' : 'text-premiumflix-muted hover:text-white'
                }`}
              >
                {f === 'all' ? 'All' : f === 'watchlist' ? t.watchlist.watchlist : t.watchlist.favorites}
              </button>
            ))}
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-premiumflix-surface border border-white/10 text-premiumflix-muted text-sm px-3 py-2 rounded-md outline-none focus:border-white/40 cursor-pointer ml-auto"
          >
            <option value="added">Recently Added</option>
            <option value="title">Title A–Z</option>
            <option value="year">Newest First</option>
            <option value="rating">Top Rated</option>
          </select>
        </div>

        <p className="text-premiumflix-muted text-sm mb-6">{totalItems} items</p>

        {!hasItems && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-premiumflix-muted text-lg">No matches found</p>
          </div>
        )}

        {filteredMovies.length > 0 && (
          <section className="mb-10">
            <h2 className="text-white font-bold text-lg mb-4">{t.nav.movies} ({filteredMovies.length})</h2>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {filteredMovies.map((m) => <MovieCard key={m.id} movie={m} />)}
            </div>
          </section>
        )}

        {filteredShows.length > 0 && (
          <section>
            <h2 className="text-white font-bold text-lg mb-4">{t.nav.shows} ({filteredShows.length})</h2>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {filteredShows.map((s) => <ShowCard key={s.id} show={s} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
