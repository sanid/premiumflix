import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { useCollection } from '../hooks/useCollection'
import { MovieCard } from '../components/MediaCard'
import { movieDisplayTitle, movieMainFile } from '../types'
import type { Movie } from '../types'
import { useI18n } from '../contexts/I18nContext'

type SortKey = 'title' | 'year' | 'rating' | 'added'
type FilterKey = 'all' | 'favorites' | 'watchlist'

export function Movies() {
  const { movies } = useLibrary()
  const { favoriteIds, watchlistIds } = useCollection()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [sort, setSort] = useState<SortKey>('added')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState('')

  const allGenres = useMemo(() => {
    const set = new Set<string>()
    for (const m of movies) {
      m.tmdbDetail?.genres?.forEach((g) => set.add(g.name))
    }
    return Array.from(set).sort()
  }, [movies])

  const filtered = useMemo(() => {
    let list = [...movies]

    // Filter
    if (filter === 'favorites') list = list.filter((m) => favoriteIds.has(m.id))
    if (filter === 'watchlist') list = list.filter((m) => watchlistIds.has(m.id))

    // Genre
    if (genre) {
      list = list.filter((m) => m.tmdbDetail?.genres?.some((g) => g.name === genre))
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) =>
          movieDisplayTitle(m).toLowerCase().includes(q) ||
          m.tmdbDetail?.overview?.toLowerCase().includes(q),
      )
    }

    // Sort
    list.sort((a, b) => {
      switch (sort) {
        case 'title':
          return movieDisplayTitle(a).localeCompare(movieDisplayTitle(b))
        case 'year': {
          const ay = parseInt(a.tmdbDetail?.release_date?.slice(0, 4) ?? a.year ?? '0')
          const by = parseInt(b.tmdbDetail?.release_date?.slice(0, 4) ?? b.year ?? '0')
          return by - ay
        }
        case 'rating':
          return (b.tmdbDetail?.vote_average ?? 0) - (a.tmdbDetail?.vote_average ?? 0)
        case 'added':
          return (b.addedAt ?? 0) - (a.addedAt ?? 0)
      }
    })

    return list
  }, [movies, filter, genre, search, sort, favoriteIds, watchlistIds])

  function playMovie(movie: Movie) {
    const file = movieMainFile(movie)
    if (file) navigate(`/play/movie/${movie.id}/${file.id}`)
    else navigate(`/movie/${movie.id}`)
  }

  return (
    <div className="min-h-screen bg-premiumflix-dark pt-20 pb-16">
      {/* Header */}
      <div className="px-4 sm:px-8 lg:px-12 mb-6">
        <h1 className="text-white text-3xl font-black mb-6">{t.nav.movies}</h1>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder={t.media.searchMovies}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-premiumflix-surface border border-white/10 text-white text-sm px-3 py-2 pl-9 rounded-md outline-none focus:border-white/40 w-52"
            />
            <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-premiumflix-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Filter tabs */}
          <div className="flex bg-premiumflix-surface rounded-md overflow-hidden border border-white/10">
            {(['all', 'favorites', 'watchlist'] as FilterKey[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 text-sm capitalize transition-colors ${
                  filter === f ? 'bg-premiumflix-red text-white' : 'text-premiumflix-muted hover:text-white'
                }`}
              >
                {f === 'all' ? t.media.all : f === 'favorites' ? t.media.favorites : t.media.myList}
              </button>
            ))}
          </div>

          {/* Genre filter */}
          {allGenres.length > 0 && (
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="bg-premiumflix-surface border border-white/10 text-premiumflix-muted text-sm px-3 py-2 rounded-md outline-none focus:border-white/40 cursor-pointer"
            >
              <option value="">{t.media.allGenres}</option>
              {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-premiumflix-surface border border-white/10 text-premiumflix-muted text-sm px-3 py-2 rounded-md outline-none focus:border-white/40 cursor-pointer ml-auto"
          >
            <option value="added">{t.media.sortAdded}</option>
            <option value="title">{t.media.sortTitle}</option>
            <option value="year">{t.media.sortYear}</option>
            <option value="rating">{t.media.sortRating}</option>
          </select>
        </div>

        <p className="text-premiumflix-muted text-sm mt-3">{filtered.length} {t.media.moviesCount}</p>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <p className="text-premiumflix-muted text-xl mb-2">{t.media.noMoviesFound}</p>
          <p className="text-premiumflix-muted/60 text-sm">{t.media.tryAdjusting}</p>
        </div>
      ) : (
        <div
          className="px-4 sm:px-8 lg:px-12 grid gap-3"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          }}
        >
          {filtered.map((movie) => (
            <MovieCard key={movie.id} movie={movie} onPlay={() => playMovie(movie)} />
          ))}
        </div>
      )}
    </div>
  )
}
