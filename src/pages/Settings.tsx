import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { accountInfo } from '../services/premiumize'
import { listFolder } from '../services/premiumize'
import { isTMDB } from '../services/metadata'
import type { ScanFolderSelection, PMItem } from '../types'
import { useI18n } from '../contexts/I18nContext'

export function Settings() {
  const { scan, clearAndRescan, isLoading, movies, tvShows, restoreFromCloud } = useLibrary()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [pmKey, setPmKey] = useState(localStorage.getItem('pm_api_key') || import.meta.env.VITE_PM_API_KEY || '')
  const [tmdbKey, setTmdbKey] = useState(localStorage.getItem('tmdb_api_key') || import.meta.env.VITE_TMDB_API_KEY || '')
  const [language, setLanguage] = useState(localStorage.getItem('tmdb_language') ?? 'en-US')
  const [savedLang, setSavedLang] = useState(localStorage.getItem('tmdb_language') ?? 'en-US')
  const [saved, setSaved] = useState(false)

  const [accountData, setAccountData] = useState<{ premiumUntil?: number; spaceUsed?: number } | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)

  const [folders, setFolders] = useState<PMItem[]>([])
  const [selectedFolders, setSelectedFolders] = useState<ScanFolderSelection[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('scan_folders') ?? '[]')
    } catch {
      return []
    }
  })
  const [loadingFolders, setLoadingFolders] = useState(false)

  useEffect(() => {
    accountInfo()
      .then((data) => setAccountData({ premiumUntil: data.premium_until, spaceUsed: data.space_used }))
      .catch((e) => setAccountError(e.message))
  }, [])

  const languageChanged = isTMDB() && language !== savedLang

  function saveSettings() {
    localStorage.setItem('pm_api_key', pmKey.trim())
    localStorage.setItem('tmdb_api_key', tmdbKey.trim())
    localStorage.setItem('tmdb_language', language)
    localStorage.setItem('scan_folders', JSON.stringify(selectedFolders))
    setSavedLang(language)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveAndRescan() {
    localStorage.setItem('pm_api_key', pmKey.trim())
    localStorage.setItem('tmdb_api_key', tmdbKey.trim())
    localStorage.setItem('tmdb_language', language)
    localStorage.setItem('scan_folders', JSON.stringify(selectedFolders))
    setSavedLang(language)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    await clearAndRescan(selectedFolders.length ? selectedFolders : undefined)
  }

  async function loadFolders() {
    setLoadingFolders(true)
    try {
      const data = await listFolder()
      setFolders((data.content ?? []).filter((f) => f.type === 'folder'))
    } catch (e: unknown) {
      alert('Could not load folders: ' + (e instanceof Error ? e.message : 'Unknown error'))
    } finally {
      setLoadingFolders(false)
    }
  }

  function toggleFolder(folder: PMItem, kind: 'movies' | 'tvShows') {
    setSelectedFolders((prev) => {
      const existing = prev.find((f) => f.id === folder.id)
      if (existing) {
        if (existing.kind === kind) return prev.filter((f) => f.id !== folder.id)
        return prev.map((f) => f.id === folder.id ? { ...f, kind } : f)
      }
      return [...prev, { id: folder.id, name: folder.name, kind }]
    })
  }

  function premiumUntilStr() {
    if (!accountData?.premiumUntil) return 'Unknown'
    const d = new Date(accountData.premiumUntil * 1000)
    return d.toLocaleDateString()
  }

  return (
    <div className="min-h-screen bg-premiumflix-dark pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-8">
        <h1 className="text-white text-3xl font-black mb-8">{t.settings.title}</h1>

        {/* Account info */}
        <Section title={t.settings.pmAccount}>
          {accountError ? (
            <p className="text-premiumflix-red text-sm">{accountError}</p>
          ) : accountData ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-premiumflix-muted">{t.settings.premiumUntil}</span>
                <span className="text-white">{premiumUntilStr()}</span>
              </div>
              {accountData.spaceUsed !== undefined && (
                <div className="flex justify-between">
                  <span className="text-premiumflix-muted">{t.settings.storageUsed}</span>
                  <span className="text-white">
                    {(accountData.spaceUsed / 1_073_741_824).toFixed(1)} GB
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-premiumflix-muted text-sm animate-pulse">Loading...</p>
          )}
        </Section>

        {/* Metadata Source */}
        <Section title="Metadata Source">
          <div className={`flex items-center gap-3 rounded-md px-4 py-3 mb-4 ${
            isTMDB()
              ? 'bg-blue-500/10 border border-blue-500/30'
              : 'bg-green-500/10 border border-green-500/30'
          }`}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isTMDB() ? 'bg-blue-400' : 'bg-green-400'}`} />
            <div>
              <p className={`text-sm font-medium ${isTMDB() ? 'text-blue-300' : 'text-green-300'}`}>
                {isTMDB() ? 'TMDB (The Movie Database)' : 'IMDb via imdbapi.dev'}
              </p>
              <p className="text-premiumflix-muted/70 text-xs mt-0.5">
                {isTMDB()
                  ? 'Using TMDB — trailers, taglines, and localized metadata available'
                  : 'Free, no API key required — trailers and taglines not available'}
              </p>
            </div>
          </div>
          <p className="text-premiumflix-muted/60 text-xs leading-relaxed">
            imdbapi.dev is used by default and requires no setup. Add a TMDB key below to unlock
            YouTube trailers, movie taglines, localized metadata, and better logo images.
            A rescan is required after changing the source.
          </p>
        </Section>

        {/* API Keys */}
        <Section title={t.settings.apiKeys}>
          <div className="space-y-4">
            <div>
              <label className="text-premiumflix-muted text-sm block mb-1">{t.settings.pmApiKey}</label>
              <input
                type="text"
                value={pmKey}
                onChange={(e) => setPmKey(e.target.value)}
                className="w-full bg-premiumflix-surface border border-white/10 text-white text-sm px-3 py-2 rounded-md outline-none focus:border-white/40"
                placeholder="Your Premiumize API key"
              />
              <p className="text-premiumflix-muted/60 text-xs mt-1">
                Find it at premiumize.me → Account → API Key
              </p>
            </div>
            <div>
              <label className="text-premiumflix-muted text-sm block mb-1">
                {t.settings.tmdbApiKey}
                {import.meta.env.VITE_TMDB_USE_PROXY === 'true' ? (
                  <span className="ml-2 text-xs font-normal bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                    configured via server
                  </span>
                ) : (
                  <span className="ml-2 text-xs font-normal bg-white/10 text-premiumflix-muted px-1.5 py-0.5 rounded">
                    optional
                  </span>
                )}
              </label>
              {import.meta.env.VITE_TMDB_USE_PROXY === 'true' ? (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  <p className="text-green-300 text-xs">
                    TMDB key is set as a Vercel environment variable and is not exposed to the browser.
                  </p>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={tmdbKey}
                    onChange={(e) => setTmdbKey(e.target.value)}
                    className="w-full bg-premiumflix-surface border border-white/10 text-white text-sm px-3 py-2 rounded-md outline-none focus:border-white/40"
                    placeholder="Leave empty to use imdbapi.dev (free, no key needed)"
                  />
                  <p className="text-premiumflix-muted/60 text-xs mt-1">
                    Get a free key at themoviedb.org — enables trailers, taglines &amp; localized metadata
                  </p>
                  {tmdbKey.trim() && (
                    <div className="mt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                      <span className="text-amber-400 text-xs">⚠</span>
                      <p className="text-amber-300 text-xs">Save and rescan your library to apply the new metadata source.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Section>

        {/* Language */}
        <Section title={t.settings.metadataLang}>
          {!isTMDB() && (
            <div className="mb-3 flex items-start gap-2 bg-premiumflix-surface border border-white/10 rounded-md px-3 py-2.5">
              <span className="text-premiumflix-muted/60 text-xs mt-0.5">ℹ</span>
              <p className="text-premiumflix-muted/70 text-xs leading-relaxed">
                Language selection only applies when a TMDB key is set. imdbapi.dev provides English metadata only.
              </p>
            </div>
          )}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={!isTMDB()}
            className="bg-premiumflix-surface border border-white/10 text-white text-sm px-3 py-2 rounded-md outline-none cursor-pointer w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <option value="en-US">English (US)</option>
            <option value="de-DE">German (DE)</option>
            <option value="fr-FR">French (FR)</option>
            <option value="es-ES">Spanish (ES)</option>
            <option value="ja-JP">Japanese (JP)</option>
            <option value="ko-KR">Korean (KR)</option>
            <option value="it-IT">Italian (IT)</option>
            <option value="ar-SA">Arabic (SA)</option>
            <option value="pt-BR">Portuguese (BR)</option>
            <option value="ru-RU">Russian (RU)</option>
            <option value="zh-CN">Chinese (CN)</option>
            <option value="nl-NL">Dutch (NL)</option>
            <option value="pl-PL">Polish (PL)</option>
            <option value="tr-TR">Turkish (TR)</option>
          </select>
          {isTMDB() && (
            <p className="text-premiumflix-muted/60 text-xs mt-2">
              Controls the language used for titles, overviews, and metadata fetched from TMDB.
            </p>
          )}
          {languageChanged && isTMDB() && (
            <div className="mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2.5">
              <span className="text-amber-400 mt-0.5">⚠</span>
              <p className="text-amber-300 text-xs leading-relaxed">
                {t.settings.langWarning}
              </p>
            </div>
          )}
        </Section>

        {/* Scan folder selection */}
        <Section title={t.settings.scanFolders}>
          <p className="text-premiumflix-muted text-sm mb-3">
            Select which Premiumize folders to scan. Leave empty to auto-detect "Movies" and "Series" folders.
          </p>

          {folders.length === 0 ? (
            <button
              onClick={loadFolders}
              disabled={loadingFolders}
              className="bg-premiumflix-surface border border-white/10 text-white text-sm px-4 py-2 rounded hover:bg-premiumflix-card transition-colors disabled:opacity-50"
            >
              {loadingFolders ? 'Loading...' : t.settings.browseFolders}
            </button>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {folders.map((folder) => {
                const sel = selectedFolders.find((f) => f.id === folder.id)
                return (
                  <div key={folder.id} className="flex items-center justify-between bg-premiumflix-surface rounded-md px-3 py-2">
                    <span className="text-white text-sm truncate mr-2">📁 {folder.name}</span>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleFolder(folder, 'movies')}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          sel?.kind === 'movies'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/10 text-premiumflix-muted hover:text-white'
                        }`}
                      >
                        Movies
                      </button>
                      <button
                        onClick={() => toggleFolder(folder, 'tvShows')}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          sel?.kind === 'tvShows'
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/10 text-premiumflix-muted hover:text-white'
                        }`}
                      >
                        TV Shows
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedFolders.length > 0 && (
            <div className="mt-3">
              <p className="text-premiumflix-muted text-xs mb-1">Selected:</p>
              <div className="flex flex-wrap gap-2">
                {selectedFolders.map((f) => (
                  <span key={f.id} className="text-xs bg-premiumflix-surface border border-white/20 text-white px-2 py-1 rounded">
                    {f.name} ({f.kind === 'movies' ? '🎬' : '📺'})
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Save */}
        <div className="flex flex-wrap gap-3 mt-6">
          <button
            onClick={saveSettings}
            disabled={isLoading}
            className="bg-premiumflix-red text-white font-bold px-6 py-2.5 rounded hover:bg-premiumflix-red-hover transition-colors disabled:opacity-50"
          >
            {saved ? t.settings.saved : t.settings.saveSettings}
          </button>
          {languageChanged && (
            <button
              onClick={saveAndRescan}
              disabled={isLoading}
              className="bg-amber-500 text-black font-bold px-6 py-2.5 rounded hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin inline-block" /> {t.settings.rescanning}</>
              ) : (
                t.settings.saveAndRescan
              )}
            </button>
          )}
        </div>

        {/* Cloud Sync */}
        <Section title="Cloud Backup">
          <p className="text-premiumflix-muted text-sm mb-4 leading-relaxed">
            Your library metadata is automatically backed up to your Premiumize cloud as <code className="bg-white/10 px-1 rounded">premiumflix_library.json</code>.
            This allows you to instantly load your library on other devices without scanning.
          </p>
          <div className="bg-premiumflix-surface border border-white/10 rounded-lg p-4">
            <button
              onClick={restoreFromCloud}
              disabled={isLoading}
              className="w-full bg-white text-black font-bold py-2.5 rounded hover:bg-white/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              {isLoading ? 'Processing...' : 'Restore Library from Cloud'}
            </button>
            <p className="text-premiumflix-muted/60 text-xs mt-3 text-center">
              Last backup: {movies.length > 0 || tvShows.length > 0 ? 'Automatic' : 'None'}
            </p>
          </div>
        </Section>

        {/* Library management */}
        <Section title={t.settings.library}>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-premiumflix-muted">{t.settings.moviesInLibrary}</span>
              <span className="text-white font-medium">{movies.length}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-premiumflix-muted">{t.settings.showsInLibrary}</span>
              <span className="text-white font-medium">{tvShows.length}</span>
            </div>

            <div className="border-t border-white/10 pt-3 flex flex-wrap gap-3">
              <button
                onClick={() => scan(selectedFolders.length ? selectedFolders : undefined)}
                disabled={isLoading}
                className="bg-white/10 text-white text-sm font-medium px-4 py-2 rounded hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Scanning...' : t.settings.scanLibrary}
              </button>
              <button
                onClick={() => {
                  if (confirm('This will clear the library and rescan. Continue?')) {
                    clearAndRescan(selectedFolders.length ? selectedFolders : undefined)
                  }
                }}
                disabled={isLoading}
                className="bg-white/10 text-white text-sm font-medium px-4 py-2 rounded hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                {t.settings.clearRescan}
              </button>
              <button
                onClick={() => navigate('/')}
                className="text-premiumflix-red text-sm font-medium px-4 py-2 rounded hover:bg-premiumflix-red/10 transition-colors"
              >
                {t.settings.goHome}
              </button>
            </div>
          </div>
        </Section>

        {/* Note about CORS */}
        <Section title="Network Note">
          <p className="text-premiumflix-muted text-xs leading-relaxed">
            Premiumize and imdbapi.dev are both proxied through Vite to work around browser CORS restrictions.
            This means the app must be served via <code className="bg-white/10 px-1 rounded">npm run dev</code> or{' '}
            <code className="bg-white/10 px-1 rounded">npm run preview</code>.
            If you deploy to a static host, use a TMDB key instead — TMDB supports CORS natively.
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-white font-bold text-base mb-4 pb-2 border-b border-white/10">{title}</h2>
      {children}
    </div>
  )
}
