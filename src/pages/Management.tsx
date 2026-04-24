import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { deleteItem, deleteFolder, getOrCreateMoviesFolder, getOrCreateShowsFolder, createTransfer } from '../services/premiumize'
import { searchMovieNzb, searchShowNzb } from '../services/scenenzbs'
import {
  searchMovieRaw, searchTVRaw,
  getMovieDetailByTmdbId, getTVDetailByTmdbId,
  getVideos, getImages, isTMDB,
  getSeasonDetail,
} from '../services/metadata'
import { bestLogoPath, bestTrailerKey } from '../services/tmdb'
import { db, getAllProgress } from '../db'
import { movieDisplayTitle, showDisplayTitle, moviePosterUrl, showPosterUrl, formatFileSize } from '../types'
import type { Movie, TVShow, TMDBMovie, WatchProgress } from '../types'

type Tab = 'movies' | 'shows'
type Filter = 'all' | 'unwatched' | 'cloudRemoved'
type ConfirmAction = { type: 'lib' | 'cloud' | 'both' | 'cloudOnly'; ids: string[]; mediaType: Tab } | null

export function Management() {
  const { movies, tvShows, removeMovieFromLibrary, removeShowFromLibrary, updateMovieInLibrary, updateShowInLibrary, monitorTransfer } = useLibrary()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('movies')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)

  // Multi-select
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)

  // Watch progress for "never watched" detection
  const [watchedFileIds, setWatchedFileIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    getAllProgress().then((all: WatchProgress[]) => {
      setWatchedFileIds(new Set(all.map(p => p.fileId)))
    })
  }, [])

  function isNeverWatched(item: Movie | TVShow): boolean {
    if ('files' in item) {
      return (item as Movie).files.every(f => !watchedFileIds.has(f.premiumizeId))
    }
    return (item as TVShow).seasons.every(s =>
      s.episodes.every(e => !watchedFileIds.has(e.file.premiumizeId))
    )
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const base = tab === 'movies' ? movies : tvShows
    let items = base.filter(item => {
      const title = tab === 'movies'
        ? movieDisplayTitle(item as Movie)
        : showDisplayTitle(item as TVShow)
      return title.toLowerCase().includes(q)
    })
    if (filter === 'unwatched') items = items.filter(i => isNeverWatched(i))
    if (filter === 'cloudRemoved') items = items.filter(i => !!(i as Movie | TVShow).cloudRemoved)
    return items
  }, [tab, search, filter, movies, tvShows, watchedFileIds])

  // Toggle selection
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.map(i => i.id)))
  }

  function selectNone() {
    setSelected(new Set())
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  // Get PM id(s) for a library item
  function getPmIds(item: Movie | TVShow): string[] {
    if ('files' in item) {
      return (item as Movie).files.map(f => f.premiumizeId)
    }
    const show = item as TVShow
    return show.seasons.flatMap(s => s.episodes.map(e => e.file.premiumizeId))
  }

  async function handleDelete(ids: string[], action: 'lib' | 'cloud' | 'both' | 'cloudOnly') {
    const items = ids.map(id => (tab === 'movies' ? movies : tvShows).find(i => i.id === id)).filter(Boolean) as (Movie | TVShow)[]
    setConfirmAction(null)

    for (const item of items) {
      setActionStatus(p => ({ ...p, [item.id]: 'Processing...' }))
    }

    for (const item of items) {
      try {
        if (action === 'cloud' || action === 'both') {
          // Delete the item/folder from Premiumize
          try { await deleteFolder(item.id) } catch { try { await deleteItem(item.id) } catch { /* may not exist */ } }
        }
        if (action === 'cloudOnly') {
          // Delete from cloud but keep in library
          try { await deleteFolder(item.id) } catch { try { await deleteItem(item.id) } catch { /* may not exist */ } }
          const updated = { ...item, cloudRemoved: true }
          if (tab === 'movies') {
            await db.movies.update(item.id, { cloudRemoved: true })
            updateMovieInLibrary(updated as Movie)
          } else {
            await db.tvShows.update(item.id, { cloudRemoved: true })
            updateShowInLibrary(updated as TVShow)
          }
        }
        if (action === 'lib' || action === 'both') {
          if (tab === 'movies') await removeMovieFromLibrary(item.id)
          else await removeShowFromLibrary(item.id)
        }
        setActionStatus(p => ({
          ...p,
          [item.id]: action === 'cloudOnly'
            ? '☁ Removed from cloud (kept in library)'
            : action === 'cloud'
              ? '☁ Deleted from cloud'
              : '✓ Removed',
        }))
      } catch (e) {
        setActionStatus(p => ({ ...p, [item.id]: '✗ Error: ' + (e instanceof Error ? e.message : 'failed') }))
      }
    }
    exitSelectMode()
  }

  // Re-download a cloud-removed item
  async function handleRedownload(item: Movie | TVShow) {
    const tmdbId = item.tmdbId ?? item.tmdbDetail?.id
    if (!tmdbId) {
      setActionStatus(p => ({ ...p, [item.id]: '✗ No TMDB ID — cannot re-download' }))
      return
    }

    setActionStatus(p => ({ ...p, [item.id]: 'Searching NZBs...' }))
    try {
      const results = tab === 'movies'
        ? await searchMovieNzb(tmdbId)
        : await searchShowNzb(tmdbId)

      if (results.length === 0) {
        setActionStatus(p => ({ ...p, [item.id]: '✗ No NZBs found for this title' }))
        return
      }

      // Pick the largest release (best quality)
      const best = results.reduce((a, b) => (b.size > a.size ? b : a), results[0])

      const folderId = tab === 'movies'
        ? await getOrCreateMoviesFolder()
        : await getOrCreateShowsFolder()

      const transfer = await createTransfer(best.link, folderId)
      monitorTransfer(transfer.id, best.title, { tmdbId, type: tab === 'movies' ? 'movie' : 'show' as const })

      // Mark as no longer cloud-removed
      await db.movies.update(item.id, { cloudRemoved: false })
      const updated = { ...item, cloudRemoved: false }
      if (tab === 'movies') updateMovieInLibrary(updated as Movie)
      else updateShowInLibrary(updated as TVShow)

      setActionStatus(p => ({ ...p, [item.id]: '⬇ Re-download started!' }))
    } catch (e) {
      setActionStatus(p => ({ ...p, [item.id]: '✗ ' + (e instanceof Error ? e.message : 'Failed') }))
    }
  }

  const items = filtered as (Movie | TVShow)[]
  const unwatchedCount = (tab === 'movies' ? movies : tvShows).filter(i => isNeverWatched(i)).length
  const cloudRemovedCount = (tab === 'movies' ? movies : tvShows).filter(i => i.cloudRemoved).length

  return (
    <div className="min-h-screen bg-premiumflix-dark pt-20 pb-16">
      <div className="px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-white text-3xl font-black mb-1">Library Management</h1>
              <p className="text-premiumflix-muted text-sm">
                Edit metadata · Delete from library · Remove from cloud to save space
              </p>
            </div>
            <button
              onClick={() => { setSelectMode(!selectMode); setSelected(new Set()) }}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${
                selectMode
                  ? 'bg-premiumflix-red text-white'
                  : 'bg-white/10 text-premiumflix-muted hover:text-white hover:bg-white/20'
              }`}
            >
              {selectMode ? '✕ Cancel' : '☐ Select'}
            </button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectMode && selected.size > 0 && (
          <div className="mb-4 bg-premiumflix-surface border border-blue-500/30 rounded-xl px-5 py-3 flex flex-wrap items-center gap-3 animate-fade-in">
            <span className="text-white font-bold text-sm">{selected.size} selected</span>
            <button onClick={selectAll} className="text-blue-400 text-xs font-bold hover:underline">Select all</button>
            <button onClick={selectNone} className="text-premiumflix-muted text-xs font-bold hover:underline">Deselect</button>
            <span className="text-white/10">|</span>
            <button
              onClick={() => setConfirmAction({ type: 'cloudOnly', ids: [...selected], mediaType: tab })}
              className="bg-amber-700/80 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              ☁ Remove from cloud (keep in library)
            </button>
            <button
              onClick={() => setConfirmAction({ type: 'cloud', ids: [...selected], mediaType: tab })}
              className="bg-red-800/80 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              ☁ Delete from cloud only
            </button>
            <button
              onClick={() => setConfirmAction({ type: 'both', ids: [...selected], mediaType: tab })}
              className="bg-red-700 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              🗑 Delete everywhere
            </button>
          </div>
        )}

        {/* Select mode with 0 selected */}
        {selectMode && selected.size === 0 && (
          <div className="mb-4 bg-premiumflix-surface border border-white/10 rounded-xl px-5 py-3 flex items-center gap-3 text-premiumflix-muted text-sm animate-fade-in">
            <span>Click items to select them</span>
            <button onClick={selectAll} className="text-blue-400 text-xs font-bold hover:underline">Select all on this page</button>
          </div>
        )}

        {/* Search + tabs + filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex bg-premiumflix-surface border border-white/10 rounded-md overflow-hidden flex-shrink-0">
            {(['movies', 'shows'] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setSearch(''); setFilter('all'); exitSelectMode() }}
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

        {/* Filter pills */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {([
            { key: 'all' as Filter, label: 'All', count: tab === 'movies' ? movies.length : tvShows.length },
            { key: 'unwatched' as Filter, label: 'Never watched', count: unwatchedCount },
            { key: 'cloudRemoved' as Filter, label: 'Removed from cloud', count: cloudRemovedCount },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                filter === f.key
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-premiumflix-muted hover:bg-white/20 hover:text-white'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
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
            const isSelected = selected.has(id)
            const neverWatched = isNeverWatched(item)
            const isCloudRemoved = !!item.cloudRemoved
            const totalSize = isMovie
              ? (item as Movie).files.reduce((s, f) => s + (f.size || 0), 0)
              : (item as TVShow).seasons.reduce((s2, se) => s2 + se.episodes.reduce((s3, ep) => s3 + (ep.file.size || 0), 0), 0)

            return (
              <div key={id} className={`bg-premiumflix-surface rounded-lg border transition-colors ${
                isSelected ? 'border-blue-500/50 bg-blue-900/10' :
                isCloudRemoved ? 'border-amber-500/20 opacity-60' :
                isEditing ? 'border-premiumflix-red/50' :
                'border-white/5 hover:border-white/15'
              }`}>
                <div className="flex items-center gap-4 p-4">
                  {/* Checkbox */}
                  {selectMode && (
                    <button
                      onClick={() => toggleSelect(id)}
                      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-blue-500 border-blue-500' : 'border-white/30 hover:border-white/60'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )}

                  {/* Poster */}
                  <div className={`w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-premiumflix-dark ${isCloudRemoved ? 'grayscale' : ''}`}>
                    {poster ? <img src={poster} alt={title} className="w-full h-full object-cover" /> :
                      <div className="w-full h-full flex items-center justify-center text-premiumflix-muted/30 text-xs">?</div>}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-semibold text-sm truncate ${isCloudRemoved ? 'text-premiumflix-muted' : 'text-white'}`}>{title}</p>
                      {year && <span className="text-premiumflix-muted text-xs">{year}</span>}
                      {neverWatched && !isCloudRemoved && (
                        <span className="text-[10px] bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded font-medium">Never watched</span>
                      )}
                      {!hasMeta && <span className="text-xs bg-yellow-800/60 text-yellow-300 px-1.5 py-0.5 rounded">No metadata</span>}
                      {!hasPoster && hasMeta && <span className="text-xs bg-orange-800/60 text-orange-300 px-1.5 py-0.5 rounded">No poster</span>}
                      {isCloudRemoved && (
                        <span className="text-[10px] bg-amber-800/60 text-amber-300 px-1.5 py-0.5 rounded font-bold">☁ Not on cloud</span>
                      )}
                    </div>
                    {isMovie && !isCloudRemoved && (
                      <p className="text-premiumflix-muted text-xs mt-0.5">
                        {(item as Movie).files.length} file{(item as Movie).files.length !== 1 ? 's' : ''}
                        {(item as Movie).files[0]?.resolution && ` · ${(item as Movie).files[0].resolution}`}
                        {(item as Movie).files[0]?.videoCodec && ` · ${(item as Movie).files[0].videoCodec?.toUpperCase()}`}
                        {(item as Movie).files[0]?.audioCodec && ` · ${(item as Movie).files[0].audioCodec?.toUpperCase()}`}
                        {(item as Movie).files[0]?.language && ` · ${(item as Movie).files[0].language?.toUpperCase()}`}
                        {totalSize > 0 && ` · ${formatFileSize(totalSize)}`}
                      </p>
                    )}
                    {!isMovie && !isCloudRemoved && (
                      <p className="text-premiumflix-muted text-xs mt-0.5">
                        {(item as TVShow).seasons.length} season{(item as TVShow).seasons.length !== 1 ? 's' : ''} ·{' '}
                        {(item as TVShow).seasons.reduce((n, s) => n + s.episodes.length, 0)} episodes
                        {totalSize > 0 && ` · ${formatFileSize(totalSize)}`}
                      </p>
                    )}
                    {status && <p className="text-xs mt-1 text-green-400">{status}</p>}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isCloudRemoved ? (
                      <>
                        <button
                          onClick={() => handleRedownload(item)}
                          className="text-blue-400 hover:text-blue-300 transition-colors p-1.5 rounded hover:bg-blue-900/20 text-xs font-bold"
                          title="Re-download to Premiumize"
                        >
                          <RefreshIcon />
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: 'lib', ids: [id], mediaType: tab })}
                          className="text-premiumflix-muted hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-900/20"
                          title="Remove from library"
                        >
                          <LibTrashIcon />
                        </button>
                      </>
                    ) : (
                      <>
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
                          onClick={() => setConfirmAction({ type: 'cloudOnly', ids: [id], mediaType: tab })}
                          className="text-premiumflix-muted hover:text-amber-400 transition-colors p-1.5 rounded hover:bg-amber-900/20"
                          title="Remove from cloud only (keep in library)">
                          <CloudOffIcon />
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: 'both', ids: [id], mediaType: tab })}
                          className="text-premiumflix-muted hover:text-red-500 transition-colors p-1.5 rounded hover:bg-red-900/20"
                          title="Delete from library + Premiumize cloud">
                          <CloudTrashIcon />
                        </button>
                      </>
                    )}
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
            <p>{search ? `No results for "${search}"` : filter === 'unwatched' ? 'Everything has been watched!' : filter === 'cloudRemoved' ? 'No cloud-removed items' : `No ${tab} in library`}</p>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
          <div className="bg-premiumflix-surface rounded-xl border border-white/10 shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-black text-lg mb-2">
              {confirmAction.type === 'cloudOnly'
                ? `Remove ${confirmAction.ids.length} item${confirmAction.ids.length > 1 ? 's' : ''} from cloud?`
                : confirmAction.type === 'cloud'
                  ? `Delete ${confirmAction.ids.length} item${confirmAction.ids.length > 1 ? 's' : ''} from cloud?`
                  : confirmAction.type === 'both'
                    ? `Delete ${confirmAction.ids.length} item${confirmAction.ids.length > 1 ? 's' : ''} everywhere?`
                    : `Remove ${confirmAction.ids.length} item${confirmAction.ids.length > 1 ? 's' : ''} from library?`
              }
            </h3>
            <p className="text-premiumflix-muted text-sm mb-6">
              {confirmAction.type === 'cloudOnly'
                ? 'Deletes files from Premiumize cloud to free space. The item stays in your library with a "Re-download" button so you can restore it anytime.'
                : confirmAction.type === 'cloud'
                  ? 'Permanently deletes the files from your Premiumize cloud storage. The item stays in your library but files are gone.'
                  : confirmAction.type === 'both'
                    ? 'Removes from library AND permanently deletes the files from your Premiumize cloud storage. This cannot be undone.'
                    : 'Removes the title from your library. Files stay on Premiumize.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 bg-premiumflix-dark border border-white/10 text-white py-2.5 rounded font-bold hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmAction.ids, confirmAction.type)}
                className={`flex-1 py-2.5 rounded font-bold transition-colors text-white ${
                  confirmAction.type === 'cloudOnly'
                    ? 'bg-amber-700 hover:bg-amber-600'
                    : confirmAction.type === 'cloud'
                      ? 'bg-red-800 hover:bg-red-700'
                      : 'bg-red-700 hover:bg-red-600'
                }`}>
                {confirmAction.type === 'cloudOnly' ? 'Remove from cloud' : confirmAction.type === 'lib' ? 'Remove' : 'Delete forever'}
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
function CloudOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 2l20 20" />
    </svg>
  )
}
function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}
