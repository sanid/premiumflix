import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { useCollection } from '../hooks/useCollection'
import { ShowCard } from '../components/MediaCard'
import { showDisplayTitle } from '../types'
import { useI18n } from '../contexts/I18nContext'

type SortKey = 'title' | 'year' | 'rating' | 'seasons'
type FilterKey = 'all' | 'favorites' | 'watchlist'

export function TVShows() {
  const { tvShows } = useLibrary()
  const { favoriteIds, watchlistIds } = useCollection()
  const { t } = useI18n()

  const [sort, setSort] = useState<SortKey>('title')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState('')

  const allGenres = useMemo(() => {
    const set = new Set<string>()
    for (const s of tvShows) {
      s.tmdbDetail?.genres?.forEach((g) => set.add(g.name))
    }
    return Array.from(set).sort()
  }, [tvShows])

  const filtered = useMemo(() => {
    let list = [...tvShows]

    if (filter === 'favorites') list = list.filter((s) => favoriteIds.has(s.id))
    if (filter === 'watchlist') list = list.filter((s) => watchlistIds.has(s.id))

    if (genre) {
      list = list.filter((s) => s.tmdbDetail?.genres?.some((g) => g.name === genre))
    }

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          showDisplayTitle(s).toLowerCase().includes(q) ||
          s.tmdbDetail?.overview?.toLowerCase().includes(q),
      )
    }

    list.sort((a, b) => {
      switch (sort) {
        case 'title':
          return showDisplayTitle(a).localeCompare(showDisplayTitle(b))
        case 'year': {
          const ay = parseInt(a.tmdbDetail?.first_air_date?.slice(0, 4) ?? a.year ?? '0')
          const by = parseInt(b.tmdbDetail?.first_air_date?.slice(0, 4) ?? b.year ?? '0')
          return by - ay
        }
        case 'rating':
          return (b.tmdbDetail?.vote_average ?? 0) - (a.tmdbDetail?.vote_average ?? 0)
        case 'seasons':
          return (b.tmdbDetail?.number_of_seasons ?? b.seasons.length) -
            (a.tmdbDetail?.number_of_seasons ?? a.seasons.length)
      }
    })

    return list
  }, [tvShows, filter, genre, search, sort, favoriteIds, watchlistIds])

  return (
    <div className="min-h-screen bg-premiumflix-dark pt-20 pb-16">
      <div className="px-4 sm:px-8 lg:px-12 mb-6">
        <h1 className="text-white text-3xl font-black mb-6">{t.nav.shows}</h1>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <input
              type="text"
              placeholder={t.media.searchShows}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-premiumflix-surface border border-white/10 text-white text-sm px-3 py-2 pl-9 rounded-md outline-none focus:border-white/40 w-52"
            />
            <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-premiumflix-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

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

          {allGenres.length > 0 && (
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="bg-premiumflix-surface border border-white/10 text-premiumflix-muted text-sm px-3 py-2 rounded-md outline-none cursor-pointer"
            >
              <option value="">{t.media.allGenres}</option>
              {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-premiumflix-surface border border-white/10 text-premiumflix-muted text-sm px-3 py-2 rounded-md outline-none cursor-pointer ml-auto"
          >
            <option value="title">{t.media.sortTitle}</option>
            <option value="year">{t.media.sortYear}</option>
            <option value="rating">{t.media.sortRating}</option>
            <option value="seasons">{t.media.sortSeasons}</option>
          </select>
        </div>

        <p className="text-premiumflix-muted text-sm mt-3">{filtered.length} {t.media.showsCount}</p>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <p className="text-premiumflix-muted text-xl mb-2">{t.media.noShowsFound}</p>
          <p className="text-premiumflix-muted/60 text-sm">{t.media.tryAdjusting}</p>
        </div>
      ) : (
        <div
          className="px-4 sm:px-8 lg:px-12 grid gap-4 sm:gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
        >
          {filtered.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </div>
  )
}
