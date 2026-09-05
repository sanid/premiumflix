import { useState } from 'react'
import type { ActiveTransfer } from '../contexts/LibraryContext'
import { DownloadIcon } from './icons'

/**
 * Floating panel showing Premiumize transfers that are still working.
 *
 * Collapsed it is a single bar with the combined progress, so an in-flight
 * download is always visible without taking over the screen; expanding lists
 * each transfer with its own bar and the ETA line Premiumize reports.
 */
export function DownloadsOverlay({ transfers }: { transfers: ActiveTransfer[] }) {
  const [expanded, setExpanded] = useState(false)

  if (transfers.length === 0) return null

  const known = transfers.filter(t => t.progress != null)
  const overall = known.length > 0
    ? known.reduce((sum, t) => sum + (t.progress ?? 0), 0) / known.length
    : null

  return (
    <div className="bg-premiumflix-surface border border-white/20 shadow-2xl rounded overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
        aria-expanded={expanded}
      >
        <DownloadIcon className="w-4 h-4 text-blue-400 animate-pulse" />
        <span className="flex-1 min-w-0">
          <span className="block text-white text-sm font-semibold">
            {transfers.length === 1 ? '1 download' : `${transfers.length} downloads`}
            {overall != null && <span className="text-premiumflix-muted font-normal"> · {Math.round(overall * 100)}%</span>}
          </span>
          {/* Premiumize runs a download phase then an upload phase, and the
              percentage restarts between them — the status line is what makes
              a bar that just jumped backwards make sense. */}
          {!expanded && transfers.length === 1 && transfers[0].message && (
            <span className="block text-[10px] text-premiumflix-muted truncate">{transfers[0].message}</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-white/50 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>

      {/* Combined bar, always visible so collapsed still conveys movement */}
      <div className="h-1 bg-white/10">
        <div
          className="h-full bg-blue-500 transition-[width] duration-500"
          style={{ width: `${Math.round((overall ?? 0) * 100)}%` }}
        />
      </div>

      {expanded && (
        <ul className="max-h-64 overflow-y-auto divide-y divide-white/5">
          {transfers.map(t => (
            <li key={t.id} className="px-4 py-3">
              <p className="text-white text-xs font-medium break-words [overflow-wrap:anywhere]">{t.name}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${t.progress == null ? 'bg-white/30 w-1/3 animate-pulse' : 'bg-blue-500'}`}
                    style={t.progress != null ? { width: `${Math.round(t.progress * 100)}%` } : undefined}
                  />
                </div>
                <span className="text-[10px] text-premiumflix-muted tabular-nums shrink-0">
                  {t.progress != null ? `${Math.round(t.progress * 100)}%` : t.status}
                </span>
              </div>
              {t.message && (
                <p className="text-[10px] text-premiumflix-muted mt-1 break-words [overflow-wrap:anywhere]">{t.message}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
