import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { VideoPlayer } from '../components/VideoPlayer'
import { itemDetails } from '../services/premiumize'
import { getProgress } from '../db'
import { movieDisplayTitle, showDisplayTitle, movieMainFile } from '../types'
import type { MediaFile } from '../types'
import type { PMItemDetailResponse } from '../types'

type PlayMode = 'movie' | 'show'

type LoadingState = 
  | 'finding-file'
  | 'waiting-transcode'
  | 'loading-stream'
  | 'error'

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
  const [loadingState, setLoadingState] = useState<LoadingState>('finding-file')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [file, setFile] = useState<MediaFile | null>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState<string | undefined>()
  const [initialPosition, setInitialPosition] = useState(0)
  const [transcodeStatus, setTranscodeStatus] = useState<string>('')
  const [pollCount, setPollCount] = useState(0)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!mediaId || !fileId || !mode) return

    cancelledRef.current = false

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
      setErrorMsg('File not found in library')
      setLoadingState('error')
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

    // ── Poll for transcoded HLS stream ────────────────────────────────────
    //
    // Premiumize transcodes MKV files to HLS on-demand. This can take
    // 2-5 minutes for large files. We poll every 5 seconds until the
    // stream_link is ready. The raw 'link' is useless for us because
    // browsers can't decode AC3/DTS audio in MKV containers.

    setLoadingState('waiting-transcode')
    setPollCount(0)

    let lastDetails: PMItemDetailResponse | null = null

    async function pollTranscode() {
      const maxAttempts = 60 // 60 × 5s = 5 minutes max wait

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (cancelledRef.current) return

        setPollCount(attempt + 1)

        try {
          lastDetails = await itemDetails(pmId)
        } catch {
          // Network error — wait and retry
          await new Promise((r) => setTimeout(r, 5000))
          continue
        }

        if (cancelledRef.current) return

        const status = (lastDetails.transcode_status ?? '').toLowerCase()
        setTranscodeStatus(status || 'unknown')

        console.log(`[Player:page] Poll ${attempt + 1}/${maxAttempts}:`, {
          stream_link: lastDetails.stream_link ? lastDetails.stream_link.substring(0, 80) + '...' : null,
          transcode_status: status,
        })

        // Success — transcoded HLS stream is ready
        if (lastDetails.stream_link) {
          if (!cancelledRef.current) {
            setLoadingState('loading-stream')
            setPlayUrl(lastDetails.stream_link)
          }
          return
        }

        // Already an MP4 or other natively-playable format — use direct link
        if (lastDetails.link) {
          const url = lastDetails.link.toLowerCase()
          if (url.includes('.mp4') || url.includes('.m4v') || url.includes('.m3u8')) {
            if (!cancelledRef.current) {
              setLoadingState('loading-stream')
              setPlayUrl(lastDetails.link)
            }
            return
          }
        }

        // Fatal transcode errors
        if (status === 'error' || status === 'failed') {
          if (!cancelledRef.current) {
            setErrorMsg('Transcoding failed. The file format may not be supported.')
            setLoadingState('error')
          }
          return
        }

        // Still pending/queued — wait 5 seconds and try again
        await new Promise((r) => setTimeout(r, 5000))
      }

      // Timed out after 5 minutes
      if (!cancelledRef.current) {
        setErrorMsg('Transcoding is taking too long. Try again in a few minutes.')
        setLoadingState('error')
      }
    }

    pollTranscode()

    return () => { cancelledRef.current = true }
  }, [mediaId, fileId, mode, movies, tvShows])

  function handleProgress(position: number, duration: number) {
    if (file && duration > 0) saveProgress(file.id, position, duration)
  }

  function handleBack() {
    navigate(-1)
  }

  // ── Loading / waiting screen ──────────────────────────────────────────────

  if (loadingState === 'finding-file' || (loadingState === 'waiting-transcode' && !playUrl)) {
    return (
      <div className="fixed inset-0 bg-premiumflix-dark flex flex-col items-center justify-center gap-6 px-4">
        <div className="w-14 h-14 border-4 border-white/20 border-t-premiumflix-red rounded-full animate-spin" />
        
        {loadingState === 'waiting-transcode' && (
          <div className="text-center">
            <p className="text-white font-semibold text-lg mb-2">Preparing stream...</p>
            <p className="text-white/50 text-sm max-w-xs">
              Premiumize is transcoding this file for browser playback.
              This usually takes 1-3 minutes for large files.
            </p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${
                transcodeStatus === 'finished' ? 'bg-green-600 text-white' :
                transcodeStatus === 'pending' ? 'bg-yellow-600/80 text-white' :
                transcodeStatus === 'queued' ? 'bg-blue-600/80 text-white' :
                transcodeStatus === 'error' || transcodeStatus === 'failed' ? 'bg-red-600 text-white' :
                'bg-white/10 text-white/60'
              }`}>
                {transcodeStatus || 'loading'}
              </span>
              {pollCount > 0 && (
                <span className="text-white/30 text-xs">
                  {pollCount * 5}s elapsed
                </span>
              )}
            </div>
          </div>
        )}

        {loadingState === 'finding-file' && (
          <p className="text-white/60 text-sm">Loading...</p>
        )}

        <button
          onClick={handleBack}
          className="text-white/40 hover:text-white text-sm underline mt-4"
        >
          Go back
        </button>
      </div>
    )
  }

  // ── Error screen ──────────────────────────────────────────────────────────

  if (loadingState === 'error' || !playUrl) {
    return (
      <div className="fixed inset-0 bg-premiumflix-dark flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-premiumflix-red text-5xl">⚠</div>
        <p className="text-white font-semibold">{errorMsg ?? 'Playback unavailable'}</p>
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

  // ── Player ────────────────────────────────────────────────────────────────

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
