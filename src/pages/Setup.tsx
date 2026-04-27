import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { listFolder, accountInfo } from '../services/premiumize'
import type { PMItem, ScanFolderSelection } from '../types'

type Step = 'connect' | 'folders' | 'done'

export function Setup() {
  const { scan } = useLibrary()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('connect')
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  // Folder browser state
  const [folders, setFolders] = useState<PMItem[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined)
  const [currentFolderName, setCurrentFolderName] = useState('Root')
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [selectedFolders, setSelectedFolders] = useState<ScanFolderSelection[]>([])

  // Account info
  const [accountName, setAccountName] = useState('')

  // ─── Step 1: Connect ─────────────────────────────────────────────────────

  async function handleConnect() {
    if (!apiKey.trim()) return
    setConnecting(true)
    setConnectError('')

    // Temporarily save key so API calls work
    localStorage.setItem('pm_api_key', apiKey.trim())

    try {
      const info = await accountInfo()
      if (info.customer_id) setAccountName(info.customer_id)

      // Load root folders
      setLoadingFolders(true)
      const root = await listFolder()
      setFolders((root.content ?? []).filter(f => f.type === 'folder'))
      setCurrentFolderId(undefined)
      setCurrentFolderName('Root')
      setBreadcrumbs([])
      setStep('folders')
    } catch {
      localStorage.removeItem('pm_api_key')
      setConnectError('Connection failed. Check your API key and try again.')
    } finally {
      setConnecting(false)
      setLoadingFolders(false)
    }
  }

  // ─── Step 2: Folder browser ──────────────────────────────────────────────

  async function openFolder(folder: PMItem) {
    setLoadingFolders(true)
    try {
      const data = await listFolder(folder.id)
      const subFolders = (data.content ?? []).filter(f => f.type === 'folder')
      setFolders(subFolders)
      setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
      setCurrentFolderId(folder.id)
      setCurrentFolderName(folder.name)
    } catch {
      // ignore
    } finally {
      setLoadingFolders(false)
    }
  }

  async function goBackToBreadcrumb(index: number) {
    if (index === -1) {
      // Root
      setLoadingFolders(true)
      try {
        const root = await listFolder()
        setFolders((root.content ?? []).filter(f => f.type === 'folder'))
        setBreadcrumbs([])
        setCurrentFolderId(undefined)
        setCurrentFolderName('Root')
      } catch { /* ignore */ }
      finally { setLoadingFolders(false) }
      return
    }

    const target = breadcrumbs[index]
    setLoadingFolders(true)
    try {
      const data = await listFolder(target.id)
      setFolders((data.content ?? []).filter(f => f.type === 'folder'))
      setBreadcrumbs(prev => prev.slice(0, index + 1))
      setCurrentFolderId(target.id)
      setCurrentFolderName(target.name)
    } catch { /* ignore */ }
    finally { setLoadingFolders(false) }
  }

  function assignFolder(folder: PMItem, kind: 'movies' | 'tvShows') {
    setSelectedFolders(prev => {
      // Remove existing assignment for this folder
      const without = prev.filter(f => f.id !== folder.id)
      return [...without, { id: folder.id, name: folder.name, kind }]
    })
  }

  function unassignFolder(folderId: string) {
    setSelectedFolders(prev => prev.filter(f => f.id !== folderId))
  }

  function getAssignment(folderId: string): 'movies' | 'tvShows' | undefined {
    return selectedFolders.find(f => f.id === folderId)?.kind
  }

  // ─── Step 3: Scan ────────────────────────────────────────────────────────

  async function handleScan() {
    localStorage.setItem('scan_folders', JSON.stringify(selectedFolders))
    setStep('done')
    await scan(selectedFolders.length > 0 ? selectedFolders : undefined)
    navigate('/')
  }

  function handleSkip() {
    localStorage.setItem('scan_folders', JSON.stringify(selectedFolders))
    setStep('done')
    scan().then(() => navigate('/'))
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-premiumflix-dark flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-premiumflix-red font-black text-4xl sm:text-5xl tracking-tight mb-2">PREMIUMFLIX</div>
          <p className="text-premiumflix-muted text-sm">Your personal streaming library</p>
        </div>

        {/* ─── Step 1: Connect ──────────────────────────────────────────── */}
        {step === 'connect' && (
          <div className="bg-premiumflix-surface border border-white/10 rounded-xl p-6 sm:p-8">
            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 mb-8">
              <StepDot active />
              <StepLine />
              <StepDot />
              <StepLine />
              <StepDot />
            </div>

            <h2 className="text-white text-xl font-bold text-center mb-2">Connect to Premiumize</h2>
            <p className="text-premiumflix-muted text-sm text-center mb-6">
              Enter your API key to link your cloud storage. You can find it at{' '}
              <a
                href="https://www.premiumize.me/account"
                target="_blank"
                rel="noopener noreferrer"
                className="text-premiumflix-red hover:underline"
              >
                premiumize.me/account
              </a>
            </p>

            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              placeholder="Paste your API key here"
              className="w-full bg-premiumflix-dark border border-white/15 text-white text-sm px-4 py-3 rounded-lg outline-none focus:border-white/40 mb-4"
              autoFocus
            />

            {connectError && (
              <p className="text-red-400 text-sm mb-4 text-center">{connectError}</p>
            )}

            <button
              onClick={handleConnect}
              disabled={connecting || !apiKey.trim()}
              className="w-full bg-premiumflix-red text-white font-bold py-3 rounded-lg hover:bg-premiumflix-red-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {connecting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connecting...
                </span>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        )}

        {/* ─── Step 2: Select folders ───────────────────────────────────── */}
        {step === 'folders' && (
          <div className="bg-premiumflix-surface border border-white/10 rounded-xl p-6 sm:p-8">
            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 mb-8">
              <StepDot done onClick={() => setStep('connect')} />
              <StepLine done />
              <StepDot active />
              <StepLine />
              <StepDot />
            </div>

            <h2 className="text-white text-xl font-bold text-center mb-2">Select Your Folders</h2>
            <p className="text-premiumflix-muted text-sm text-center mb-5">
              Choose which folders contain movies and TV shows. You can browse into subfolders to pick the right ones.
            </p>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 text-xs mb-3 flex-wrap">
              <button
                onClick={() => goBackToBreadcrumb(-1)}
                className="text-premiumflix-muted hover:text-white transition-colors"
              >
                Root
              </button>
              {breadcrumbs.map((bc, i) => (
                <span key={bc.id} className="flex items-center gap-1">
                  <span className="text-white/20">/</span>
                  <button
                    onClick={() => i < breadcrumbs.length - 1 ? goBackToBreadcrumb(i) : undefined}
                    className={`${i < breadcrumbs.length - 1 ? 'text-premiumflix-muted hover:text-white' : 'text-white'} transition-colors`}
                  >
                    {bc.name}
                  </button>
                </span>
              ))}
            </div>

            {/* Folder list */}
            <div className="bg-premiumflix-dark rounded-lg border border-white/10 divide-y divide-white/5 max-h-80 overflow-y-auto mb-4">
              {loadingFolders ? (
                <div className="flex items-center justify-center py-12">
                  <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              ) : folders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-premiumflix-muted text-sm">
                  <FolderIcon className="w-8 h-8 mb-2 opacity-30" />
                  <p>No subfolders here</p>
                </div>
              ) : (
                folders.map(folder => {
                  const assignment = getAssignment(folder.id)
                  return (
                    <div key={folder.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors group">
                      <button
                        onClick={() => openFolder(folder)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        title="Open folder"
                      >
                        <FolderIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="text-white text-sm truncate">{folder.name}</span>
                      </button>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => assignFolder(folder, 'movies')}
                          className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                            assignment === 'movies'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60'
                          }`}
                        >
                          🎬 Movies
                        </button>
                        <button
                          onClick={() => assignFolder(folder, 'tvShows')}
                          className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                            assignment === 'tvShows'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60'
                          }`}
                        >
                          📺 Shows
                        </button>
                        {assignment && (
                          <button
                            onClick={() => unassignFolder(folder.id)}
                            className="text-white/20 hover:text-red-400 transition-colors p-0.5"
                            title="Remove assignment"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Selected folders summary */}
            {selectedFolders.length > 0 && (
              <div className="mb-4">
                <p className="text-premiumflix-muted text-xs mb-2 font-medium">Selected folders:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedFolders.map(f => (
                    <span
                      key={f.id}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        f.kind === 'movies'
                          ? 'bg-blue-900/50 text-blue-300 border border-blue-500/30'
                          : 'bg-purple-900/50 text-purple-300 border border-purple-500/30'
                      }`}
                    >
                      {f.kind === 'movies' ? '🎬' : '📺'} {f.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('connect')}
                className="bg-white/5 text-premiumflix-muted font-bold py-3 px-6 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={selectedFolders.length > 0 ? handleScan : handleSkip}
                className="flex-1 bg-premiumflix-red text-white font-bold py-3 rounded-lg hover:bg-premiumflix-red-hover transition-colors"
              >
                {selectedFolders.length > 0 ? 'Scan Library' : 'Skip — Auto-detect folders'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Done / Scanning ──────────────────────────────────── */}
        {step === 'done' && (
          <div className="bg-premiumflix-surface border border-white/10 rounded-xl p-6 sm:p-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-8">
              <StepDot done />
              <StepLine done />
              <StepDot done />
              <StepLine done />
              <StepDot active />
            </div>
            <div className="w-12 h-12 border-4 border-premiumflix-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-white text-xl font-bold mb-2">Scanning your library...</h2>
            <p className="text-premiumflix-muted text-sm">This may take a minute. We'll redirect you when it's ready.</p>
          </div>
        )}

        {/* Hint */}
        <p className="text-premiumflix-muted/40 text-xs text-center mt-6">
          You can always change these later in Settings.
        </p>
      </div>
    </div>
  )
}

// ─── Small components ───────────────────────────────────────────────────────

function StepDot({ active, done, onClick }: { active?: boolean; done?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`w-3 h-3 rounded-full transition-colors ${
        active
          ? 'bg-premiumflix-red scale-125'
          : done
            ? 'bg-green-500 cursor-pointer hover:scale-110'
            : 'bg-white/15'
      } ${onClick ? 'cursor-pointer' : ''}`}
    />
  )
}

function StepLine({ done }: { done?: boolean }) {
  return <div className={`w-10 h-0.5 rounded ${done ? 'bg-green-500/50' : 'bg-white/10'}`} />
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}
