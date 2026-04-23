import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { deleteItem, deleteFolder } from '../services/premiumize'
import {
  searchMovieRaw, searchTVRaw,
  getMovieDetailByTmdbId, getTVDetailByTmdbId,
  getVideos, getImages, isTMDB,
  getSeasonDetail,
} from '../services/metadata'
import { bestLogoPath, bestTrailerKey } from '../services/tmdb'
import { db } from '../db'
import { movieDisplayTitle, showDisplayTitle, moviePosterUrl, showPosterUrl, formatFileSize } from '../types'
import type { Movie, TVShow, TMDBMovie } from '../types'

type Tab = 'movies' | 'shows'
type ConfirmAction = { type: 'lib' | 'cloud' | 'both'; id: string; mediaType: Tab } | null

export function Management() {
  const { movies, tvShows, removeMovieFromLibrary, removeShowFromLibrary, updateMovieInLibrary, updateShowInLibrary } = useLibrary()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('movies')
  const [search, setSearch] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (tab === 'movies') return movies.filter(m => movieDisplayTitle(m).toLowerCase().includes(q))
    return tvShows.filter(s => showDisplayTitle(s).toLowerCase().includes(q))
  }, [tab, search, movies, tvShows])

  async function handleDelete(id: string, pmId: string, action: 'lib' | 'cloud' | 'both') {
    setActionStatus(p => ({ ...p, [id]: 'Deleting...' }))
    setConfirmAction(null)
    try {
      if (action === 'cloud' || action === 'both') {
        try { await deleteFolder(pmId) } catch { try { await deleteItem(pmId) } catch { /* may not exist */ } }
      }
      if (action === 'lib' || action === 'both') {
        if (tab === 'movies') await removeMovieFromLibrary(id)
        else await removeShowFromLibrary(id)
      }
      setActionStatus(p => ({ ...p, [id]: action === 'cloud' ? '☁ Deleted from cloud' : '✓ Removed' }))
    } catch (e) {
      setActionStatus(p => ({ ...p, [id]: '✗ Error: ' + (e instanceof Error ? e.message : 'failed') }))
    }
  }

  const items = filtered as (Movie | TVShow)[]

  return (
    <div className="min-h-screen bg-premiumflix-dark pt-20 pb-16">
      <div className="px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-white text-3xl font-black mb-1">Library Management</h1>
          <p className="text-premiumflix-muted text-sm">
            Edit metadata · Delete from library · Delete from Premiumize cloud
          </p>
        </div>

        {/* Search + tabs */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex bg-premiumflix-surface border border-white/10 rounded-md overflow-hidden flex-shrink-0">
            {(['movies', 'shows'] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setSearch('') }}
                className={`px-5 py-2.5 text-sm font-bold transition-colors capitalize ${tab === t ? 'bg-premiumflix-red text-white' : 'text-premiumflix-muted hover:text-white'}`}>
                {t === 'movies' ? `🎬 Movies (${movies.length})` : `📺 Shows (${tvShows.length})`}
              </button>
            ))}
          </div>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab}...`}
            className="flex-1 bg-premiumflix-surface border border-white/10 text-white text-sm px-4 py-2.5 rounded-md outline-none focus:border-white/40"
          />
        </div>

        {/* Items list */}
        <div className="space-y-2">
          {items.map(item => {
            const id = item.id
            const isMovie = 'files' in item
            const title = isMovie ? movieDisplayTitle(item as Movie) : showDisplayTitle(item as TVShow)
            const poster = isMovie ? moviePosterUrl(item as Movie) : showPosterUrl(item as TVShow)
            const year = item.tmdbDetail?.release_date?.slice(0, 4) ?? item.tmdbDetail?.first_air_date?.slice(0, 4) ?? item.year
            const hasPoster = !!item.tmdbDetail?.poster_path
            const hasMeta = !!item.tmdbDetail
            const status = actionStatus[id]
            const isEditing = editingId === id

            return (
              <div key={id} className={`bg-premiumflix-surface rounded-lg border transition-colors ${isEditing ? 'border-premiumflix-red/50' : 'border-white/5 hover:border-white/15'}`}>
                <div className="flex items-center gap-4 p-4">
                  {/* Poster */}
                  <div className="w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-premiumflix-dark">
                    {poster ? <img src={poster} alt={title} className="w-full h-full object-cover" /> :
                      <div className="w-full h-full flex items-center justify-center text-premiumflix-muted/30 text-xs">?</div>}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold text-sm truncate">{title}</p>
                      {year && <span className="text-premiumflix-muted text-xs">{year}</span>}
                      {!hasMeta && <span className="text-xs bg-yellow-800/60 text-yellow-300 px-1.5 py-0.5 rounded">No metadata</span>}
                      {!hasPoster && hasMeta && <span className="text-xs bg-orange-800/60 text-orange-300 px-1.5 py-0.5 rounded">No poster</span>}
                    </div>
                    {isMovie && (
                      <p className="text-premiumflix-muted text-xs mt-0.5">
                        {(item as Movie).files.length} file{(item as Movie).files.length !== 1 ? 's' : ''}
                        {(item as Movie).files[0]?.resolution && ` · ${(item as Movie).files[0].resolution}`}
                        {(item as Movie).files[0]?.videoCodec && ` · ${(item as Movie).files[0].videoCodec?.toUpperCase()}`}
                        {(item as Movie).files[0]?.audioCodec && ` · ${(item as Movie).files[0].audioCodec?.toUpperCase()}`}
                        {(item as Movie).files[0]?.language && ` · ${(item as Movie).files[0].language?.toUpperCase()}`}
                        {(item as Movie).files[0]?.size > 0 && ` · ${formatFileSize((item as Movie).files[0].size)}`}
                      </p>
                    )}
                    {!isMovie && (
                      <p className="text-premiumflix-muted text-xs mt-0.5">
                        {(item as TVShow).seasons.length} season{(item as TVShow).seasons.length !== 1 ? 's' : ''} ·{' '}
                        {(item as TVShow).seasons.reduce((n, s) => n + s.episodes.length, 0)} episodes
                      </p>
                    )}
                    {status && <p className="text-xs mt-1 text-green-400">{status}</p>}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => navigate(isMovie ? `/movie/${id}` : `/show/${id}`)}
                      className="text-premiumflix-muted hover:text-white transition-colors p-1.5 rounded hover:bg-white/10"
                      title="View detail">
                      <EyeIcon />
                    </button>
                    <button
                      onClick={() => setEditingId(isEditing ? null : id)}
                      className={`transition-colors p-1.5 rounded hover:bg-white/10 ${isEditing ? 'text-premiumflix-red' : 'text-premiumflix-muted hover:text-white'}`}
                      title="Edit metadata">
                      <EditIcon />
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: 'lib', id, mediaType: tab })}
                      className="text-premiumflix-muted hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-900/20"
                      title="Remove from library">
                      <LibTrashIcon />
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: 'both', id, mediaType: tab })}
                      className="text-premiumflix-muted hover:text-red-500 transition-colors p-1.5 rounded hover:bg-red-900/20"
                      title="Delete from library + Premiumize cloud">
                      <CloudTrashIcon />
                    </button>
                  </div>
                </div>

                {/* Inline metadata editor */}
                {isEditing && (
                  <MetadataEditor
                    item={item}
                    mediaType={tab}
                    onClose={() => setEditingId(null)}
                    onUpdated={(updated) => {
                      setEditingId(null)
                      if (tab === 'movies') updateMovieInLibrary(updated as Movie)
                      else updateShowInLibrary(updated as TVShow)
                      setActionStatus(p => ({ ...p, [id]: '✓ Metadata updated' }))
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>

        {items.length === 0 && (
          <div className="text-center py-24 text-premiumflix-muted">
            <p className="text-4xl mb-3">📭</p>
            <p>{search ? `No results for "${search}"` : `No ${tab} in library`}</p>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
          <div className="bg-premiumflix-surface rounded-xl border border-white/10 shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-black text-lg mb-2">
              {confirmAction.type === 'lib' ? 'Remove from library?' : 'Delete everywhere?'}
            </h3>
            <p className="text-premiumflix-muted text-sm mb-6">
              {confirmAction.type === 'lib'
                ? 'Removes the title from Premiumflix. The files stay on Premiumize.'
                : 'Removes from Premiumflix AND permanently deletes the files from your Premiumize cloud storage. This cannot be undone.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 bg-premiumflix-dark border border-white/10 text-white py-2.5 rounded font-bold hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmAction.id, confirmAction.id, confirmAction.type)}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2.5 rounded font-bold transition-colors">
                {confirmAction.type === 'lib' ? 'Remove' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Metadata Editor ──────────────────────────────────────────────────────────

interface MetadataEditorProps {
  item: Movie | TVShow
  mediaType: Tab
  onClose: () => void
  onUpdated: (updated: Movie | TVShow) => void
}

function MetadataEditor({ item, mediaType, onClose, onUpdated }: MetadataEditorProps) {
  const isMovie = mediaType === 'movies'
  const [query, setQuery] = useState(
    isMovie ? movieDisplayTitle(item as Movie) : showDisplayTitle(item as TVShow)
  )
  const [year, setYear] = useState(item.year ?? '')
  const [results, setResults] = useState<TMDBMovie[]>([])
  const [searching, setSearching] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  async function doSearch() {
    if (!isTMDB()) { setError('TMDB API key required — configure in Settings.'); return }
    setSearching(true); setError(''); setResults([])
    try {
      const data = isMovie
        ? await searchMovieRaw(query, year || undefined)
        : await searchTVRaw(query, year || undefined)
      setResults(data.results.slice(0, 8))
      if (!data.results.length) setError('No results found.')
    } catch (e) { setError('Search failed: ' + (e instanceof Error ? e.message : 'unknown')) }
    finally { setSearching(false) }
  }

  async function applyResult(r: TMDBMovie) {
    setApplying(true); setError('')
    try {
      const detail = isMovie
        ? await getMovieDetailByTmdbId(r.id)
        : await getTVDetailByTmdbId(r.id)

      const [videosRes, imagesRes] = await Promise.allSettled([
        getVideos(detail, isMovie ? 'movie' : 'tv'),
        getImages(detail, isMovie ? 'movie' : 'tv'),
      ])
      const trailerKey = videosRes.status === 'fulfilled' ? bestTrailerKey(videosRes.value) : item.trailerKey
      const logoPath = imagesRes.status === 'fulfilled' ? bestLogoPath(imagesRes.value.logos ?? []) : item.logoPath

      const updates: any = { tmdbId: detail.id, tmdbDetail: detail, trailerKey, logoPath }
      if (isMovie) {
        await db.movies.update(item.id, updates)
      } else {
        // For TV shows, also fetch and assign episode metadata
        const show = item as TVShow
        const updatedSeasons = await Promise.all(show.seasons.map(async (s) => {
          const tmdbSeason = detail.seasons?.find(ts => ts.season_number === s.number)
          const seasonDetail = await getSeasonDetail(detail, s.number)
          
          return {
            ...s,
            tmdbSeason,
            episodes: s.episodes.map(e => {
              const tmdbEp = seasonDetail.episodes?.find(te => te.episode_number === e.number)
              return { ...e, tmdbEpisode: tmdbEp }
            })
          }
        }))
        updates.seasons = updatedSeasons
        await db.tvShows.update(item.id, updates)
      }
      onUpdated({ ...item, ...updates } as Movie | TVShow)
    } catch (e) { setError('Apply failed: ' + (e instanceof Error ? e.message : 'unknown')) }
    finally { setApplying(false) }
  }

  return (
    <div className="border-t border-white/10 p-4 bg-black/20">
      <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Edit Metadata — TMDB Search</p>
      {!isTMDB() && (
        <p className="text-yellow-400 text-sm mb-3">⚠ No TMDB API key configured. Go to Settings to add one.</p>
      )}
      <div className="flex gap-2 mb-3">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Title..." className="flex-1 bg-premiumflix-dark border border-white/10 text-white text-sm px-3 py-2 rounded outline-none focus:border-white/30" />
        <input value={year} onChange={e => setYear(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Year" className="w-20 bg-premiumflix-dark border border-white/10 text-white text-sm px-3 py-2 rounded outline-none focus:border-white/30" />
        <button onClick={doSearch} disabled={searching}
          className="bg-premiumflix-red text-white px-4 py-2 rounded text-sm font-bold hover:bg-premiumflix-red-hover transition-colors disabled:opacity-50">
          {searching ? '...' : 'Search'}
        </button>
      </div>

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {results.map(r => {
            const rTitle = r.title ?? r.name ?? ''
            const rYear = (r.release_date ?? r.first_air_date ?? '').slice(0, 4)
            const rPoster = r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null
            return (
              <button key={r.id} onClick={() => applyResult(r)} disabled={applying}
                className="bg-premiumflix-dark rounded-lg overflow-hidden border border-white/10 hover:border-premiumflix-red transition-colors text-left group">
                <div className="aspect-[2/3] bg-black">
                  {rPoster ? <img src={rPoster} alt={rTitle} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                    : <div className="w-full h-full flex items-center justify-center text-premiumflix-muted/30 text-xs">No image</div>}
                </div>
                <div className="p-2">
                  <p className="text-white text-xs font-semibold line-clamp-2">{rTitle}</p>
                  <p className="text-premiumflix-muted text-xs">{rYear} · ★{r.vote_average?.toFixed(1)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {applying && <p className="text-blue-400 text-xs">Applying metadata...</p>}

      <div className="flex justify-end mt-2">
        <button onClick={onClose} className="text-premiumflix-muted hover:text-white text-sm transition-colors">Close</button>
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function EyeIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
}
function EditIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
}
function LibTrashIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
}
function CloudTrashIcon() {
  return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
}
