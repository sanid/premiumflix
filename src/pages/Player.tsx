import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { VideoPlayer } from '../components/VideoPlayer'
import { fetchItemDetailsWithTranscode } from '../services/premiumize'
import { getProgress } from '../db'
import { movieDisplayTitle, showDisplayTitle, movieMainFile } from '../types'
import type { MediaFile } from '../types'

type PlayMode = 'movie' | 'show'

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

    // ── Load saved progress ──────────────────────────────────────────────

    getProgress(foundFile.id).then((saved) => {
      if (saved && saved.duration > 0 && saved.position / saved.duration < 0.9) {
        setInitialPosition(saved.position)
      }
    })

    // ── Always fetch fresh stream URL ────────────────────────────────────
    //
    // Premiumize stream_link and link URLs expire after some time.
    // We must always call the API to get a fresh URL before playing.
    // The transcoded HLS stream (stream_link) includes audio tracks
    // and embedded subtitles from CDN77.

    setLoading(true)

    fetchItemDetailsWithTranscode(pmId, 20)
      .then((d) => {
        if (cancelled) return
        console.log('[Player:page] API response:', {
          stream_link: d.stream_link ? d.stream_link.substring(0, 80) + '...' : null,
          link: d.link ? d.link.substring(0, 80) + '...' : null,
          transcode_status: d.transcode_status,
          name: d.name,
        })
        const url = d.stream_link ?? d.link ?? null
        if (url) {
          setPlayUrl(url)
        } else {
          setError('Could not get playback URL. The file may still be transcoding — try again in a few minutes.')
        }
      })
      .catch(() => {
        if (cancelled) return
        setError('Failed to fetch playback URL. Check your connection and try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
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
        <p className="text-white/60 text-sm">Loading stream...</p>
      </div>
    )
  }

  if (error || !playUrl) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-premiumflix-red text-5xl">⚠</div>
        <p className="text-white font-semibold">{error ?? 'Playback unavailable'}</p>
        <p className="text-white/60 text-sm max-w-sm">
          Make sure the file is fully uploaded to Premiumize and try again.
        </p>
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
        initialPosition={initialPosition}
        onProgress={handleProgress}
        onBack={handleBack}
      />
    </div>
  )
}
