import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { useI18n } from '../contexts/I18nContext'
import { movieDisplayTitle, showDisplayTitle, moviePosterUrl, showPosterUrl, movieMainFile } from '../types'
import type { Movie, TVShow } from '../types'

export function Stats() {
  const { movies, tvShows } = useLibrary()
  const { progressMap, isFinished } = useWatchProgress()
  const { t } = useI18n()
  const navigate = useNavigate()

  const stats = useMemo(() => {
    let totalSeconds = 0
    let moviesWatchedCount = 0
    let episodesWatchedCount = 0
    const genreMap = new Map<string, number>()
    const recentlyFinished: Array<{
      type: 'movie' | 'show'
      title: string
      poster?: string
      id: string
      lastWatched: number
    }> = []

    for (const movie of movies) {
      const mainFile = movieMainFile(movie)
      const fileIds = movie.files.map(f => f.id)
      const isWatched = fileIds.some(fId => isFinished(fId))

      if (isWatched) {
        moviesWatchedCount++
        for (const fId of fileIds) {
          const p = progressMap.get(fId)
          if (p) totalSeconds += p.position
        }
        recentlyFinished.push({
          type: 'movie',
          title: movieDisplayTitle(movie),
          poster: moviePosterUrl(movie),
          id: movie.id,
          lastWatched: Math.max(...fileIds.map(fId => progressMap.get(fId)?.lastWatched ?? 0)),
        })
      }

      const genres = movie.tmdbDetail?.genres ?? []
      if (isWatched) {
        for (const g of genres) {
          genreMap.set(g.name, (genreMap.get(g.name) ?? 0) + 1)
        }
      }
    }

    for (const show of tvShows) {
      for (const season of show.seasons) {
        for (const ep of season.episodes) {
          const fId = ep.file.id
          if (isFinished(fId)) {
            episodesWatchedCount++
            const p = progressMap.get(fId)
            if (p) totalSeconds += p.position
          }
        }
      }

      const hasWatchedEp = show.seasons.some(s =>
        s.episodes.some(e => isFinished(e.file.id))
      )
      if (hasWatchedEp) {
        recentlyFinished.push({
          type: 'show',
          title: showDisplayTitle(show),
          poster: showPosterUrl(show),
          id: show.id,
          lastWatched: Math.max(
            ...show.seasons.flatMap(s =>
              s.episodes
                .filter(e => isFinished(e.file.id))
                .map(e => progressMap.get(e.file.id)?.lastWatched ?? 0)
            )
          ),
        })
        const genres = show.tmdbDetail?.genres ?? []
        for (const g of genres) {
          genreMap.set(g.name, (genreMap.get(g.name) ?? 0) + 1)
        }
      }
    }

    const topGenres = Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)

    recentlyFinished.sort((a, b) => b.lastWatched - a.lastWatched)

    const totalHours = (totalSeconds / 3600).toFixed(1)
    const maxGenreCount = topGenres.length > 0 ? topGenres[0][1] : 1

    return {
      totalHours,
      moviesWatchedCount,
      episodesWatchedCount,
      topGenres,
      recentlyFinished: recentlyFinished.slice(0, 12),
      maxGenreCount,
      totalLibraryItems: movies.length + tvShows.length,
    }
  }, [movies, tvShows, progressMap, isFinished])

  const hasData = stats.moviesWatchedCount > 0 || stats.episodesWatchedCount > 0

  return (
    <div className="min-h-screen bg-premiumflix-dark pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-8">
        <h1 className="text-white text-3xl font-black mb-8">{t.stats.title}</h1>

        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-6xl opacity-20 mb-4">📊</div>
            <p className="text-premiumflix-muted text-lg">{t.stats.noData}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
              <StatCard label={t.stats.totalWatchTime} value={stats.totalHours} unit={t.stats.totalTime} color="text-premiumflix-red" />
              <StatCard label={t.stats.moviesWatched} value={String(stats.moviesWatchedCount)} unit={`of ${movies.length}`} />
              <StatCard label={t.stats.episodesWatched} value={String(stats.episodesWatchedCount)} unit="episodes" color="text-blue-400" />
              <StatCard label={t.stats.librarySize} value={String(stats.totalLibraryItems)} unit="items" color="text-green-400" />
            </div>

            {stats.topGenres.length > 0 && (
              <section className="mb-10">
                <h2 className="text-white font-bold text-lg mb-4">{t.stats.topGenres}</h2>
                <div className="space-y-2">
                  {stats.topGenres.map(([genre, count]) => (
                    <div key={genre} className="flex items-center gap-3">
                      <span className="text-white text-sm w-32 truncate">{genre}</span>
                      <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-premiumflix-red/70 rounded-full transition-all"
                          style={{ width: `${(count / stats.maxGenreCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-premiumflix-muted text-sm w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {stats.recentlyFinished.length > 0 && (
              <section>
                <h2 className="text-white font-bold text-lg mb-4">{t.stats.recentlyWatched}</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {stats.recentlyFinished.map(item => (
                    <button
                      key={item.id}
                      onClick={() => navigate(`/${item.type === 'movie' ? 'movie' : 'show'}/${item.id}`)}
                      className="group text-left"
                    >
                      <div className="aspect-[2/3] rounded-md overflow-hidden bg-premiumflix-surface mb-1.5">
                        {item.poster ? (
                          <img src={item.poster} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-premiumflix-muted text-xs p-2 text-center">{item.title}</div>
                        )}
                      </div>
                      <p className="text-white text-xs truncate">{item.title}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit: string; color?: string }) {
  return (
    <div className="bg-premiumflix-surface border border-white/10 rounded-lg p-4">
      <p className="text-premiumflix-muted text-xs mb-1">{label}</p>
      <p className={`text-2xl font-black ${color ?? 'text-white'}`}>{value}</p>
      <p className="text-premiumflix-muted text-xs">{unit}</p>
    </div>
  )
}
