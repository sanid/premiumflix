import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { VideoPlayer } from '../components/VideoPlayer'
import { itemDetails, fetchSubtitles } from '../services/premiumize'
import type { PMSubtitle } from '../services/premiumize'
import { getProgress } from '../db'
import { movieDisplayTitle, showDisplayTitle, movieMainFile } from '../types'
import type { MediaFile } from '../types'

type PlayMode = 'movie' | 'show'

/**
 * Construct a CDN77 live-transcode HLS URL from the raw download link.
 * This is exactly what Premiumize does on their own player page —
 * CDN77 transcodes on-the-fly so there's no waiting.
 *
 * Pattern: https://cdn77-livetranscode2.energycdn.com/vod/{directLink}/index.m3u8
 */
function liveTranscodeUrl(directLink: string): string {
  return `https://cdn77-livetranscode2.energycdn.com/vod/${directLink}/index.m3u8`
}

export function Player() {
  const { mode, mediaId, fileId } = useParams<{
    mode: PlayMode
    mediaId: string
    fileId: string
  }>()
  const { movies, tvShows } = useLibrary()
  const { saveProgress } = useWatchProgress()
  const navigate = useNavigate()

  const [playUrl, setPlayUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<MediaFile | null>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState<string | undefined>()
  const [initialPosition, setInitialPosition] = useState(0)
  const [openSubs, setOpenSubs] = useState<PMSubtitle[]>([])

  useEffect(() => {
    if (!mediaId || !fileId || !mode) return
    let cancelled = false

    // ── Find file in library ─────────────────────────────────────────────

    let foundFile: MediaFile | undefined
    let mediaTitle = ''
    let mediaSubtitle: string | undefined

    if (mode === 'movie') {
      const movie = movies.find((m) => m.id === mediaId)
      if (movie) {
        foundFile = movie.files.find((f) => f.id === fileId) ?? movieMainFile(movie)
        mediaTitle = movieDisplayTitle(movie)
      }
    } else {
      const show = tvShows.find((s) => s.id === mediaId)
      if (show) {
        for (const season of show.seasons) {
          const ep = season.episodes.find((e) => e.file.id === fileId)
          if (ep) {
            foundFile = ep.file
            mediaTitle = showDisplayTitle(show)
            const tmdbName = ep.tmdbEpisode?.name
            mediaSubtitle = tmdbName
              ? `S${String(season.number).padStart(2, '0')}E${String(ep.number).padStart(2, '0')} — ${tmdbName}`
              : `S${String(season.number).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`
            break
          }
        }
      }
    }

    if (!foundFile) {
      setError('File not found in library')
      setLoading(false)
      return
    }

    setFile(foundFile)
    setTitle(mediaTitle)
    setSubtitle(mediaSubtitle)
    const pmId = foundFile.premiumizeId

    // Load saved progress
    getProgress(foundFile.id).then((saved) => {
      if (saved && saved.duration > 0 && saved.position / saved.duration < 0.9) {
        setInitialPosition(saved.position)
      }
    })

    // Fetch OpenSubtitles matches in background (non-blocking)
    fetchSubtitles(pmId).then((subs) => {
      if (!cancelled && subs.length > 0) {
        console.log('[Player:page] OpenSubtitles found:', subs.length, 'subs')
        setOpenSubs(subs)
      }
    }).catch(() => {})

    // ── Get playback URL ──────────────────────────────────────────────────
    //
    // Strategy (same as Premiumize's own website):
    // 1. Call itemDetails API to get the direct link (fast, < 1 second)
    // 2. If stream_link is ready (already transcoded) → use it directly
    // 3. Otherwise, construct CDN77 live-transcode URL from the direct link
    //    → CDN77 transcodes on-the-fly, plays instantly

    itemDetails(pmId)
      .then((d) => {
        if (cancelled) return

        console.log('[Player:page] API response:', {
          stream_link: d.stream_link ? '✓ ' + d.stream_link.substring(0, 60) + '...' : '✗ null',
          link: d.link ? '✓ ' + d.link.substring(0, 60) + '...' : '✗ null',
          transcode_status: d.transcode_status,
        })

        // Best case: stream_link already available (cached transcode)
        if (d.stream_link) {
          setPlayUrl(d.stream_link)
          setLoading(false)
          return
        }

        // Construct live transcode URL from direct link (instant playback)
        if (d.link) {
          const hlsUrl = liveTranscodeUrl(d.link)
          console.log('[Player:page] Constructed live transcode URL:', hlsUrl.substring(0, 100) + '...')
          setPlayUrl(hlsUrl)
          setLoading(false)
          return
        }

        setError('Could not get playback URL.')
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Failed to fetch playback URL. Check your connection.')
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [mediaId, fileId, mode, movies, tvShows])

  function handleProgress(position: number, duration: number) {
    if (file && duration > 0) saveProgress(file.id, position, duration)
  }

  function handleBack() {
    navigate(-1)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        <p className="text-white/60 text-sm">Loading...</p>
      </div>
    )
  }

  if (error || !playUrl) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-premiumflix-red text-5xl">⚠</div>
        <p className="text-white font-semibold">{error ?? 'Playback unavailable'}</p>
        <button
          onClick={() => navigate(-1)}
          className="bg-white text-black font-bold px-6 py-2 rounded hover:bg-white/80"
        >
          Go Back
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black">
      <VideoPlayer
        src={playUrl}
        title={title}
        subtitle={subtitle}
        subtitles={file?.subtitles}
        openSubtitles={openSubs}
        initialPosition={initialPosition}
        onProgress={handleProgress}
        onBack={handleBack}
      />
    </div>
  )
}
