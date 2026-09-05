import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLibrary } from '../contexts/LibraryContext'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { VideoPlayer } from '../components/VideoPlayer'
import { itemDetails, fetchSubtitles } from '../services/premiumize'
import type { PMSubtitle } from '../services/premiumize'
import { scrobble, isTraktConnected, type TraktScrobbleMedia } from '../services/trakt'
import { getProgress } from '../db'
import { debugLog } from '../lib/debug'
import { movieDisplayTitle, showDisplayTitle, movieMainFile } from '../types'
import type { MediaFile } from '../types'
import { AlertTriangleIcon } from '../components/icons'

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

/**
 * Storyboard manifest for the seek-bar scrubbing preview.
 *
 * The endpoint lives on the live-transcode host but takes the raw download
 * link as a parameter, so it works for every file — including the ones that
 * play straight from `stream_link` and never touch /vod/.
 */
function storyboardManifestUrl(directLink: string): string {
  const params = new URLSearchParams({
    url: directLink,
    interval: '15',
    width: '160',
    height: '90',
  })
  return `https://cdn77-livetranscode2.energycdn.com/storyboards/manifest?${params.toString()}`
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

  // Lock body scroll and set up fullscreen-friendly viewport
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const [playUrl, setPlayUrl] = useState<string | null>(null)
  const [storyboardUrl, setStoryboardUrl] = useState<string | undefined>()
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
        debugLog('[Player:page] OpenSubtitles found:', subs.length, 'subs')
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

        debugLog('[Player:page] API response:', {
          stream_link: d.stream_link ? '✓ ' + d.stream_link.substring(0, 60) + '...' : '✗ null',
          link: d.link ? '✓ ' + d.link.substring(0, 60) + '...' : '✗ null',
          transcode_status: d.transcode_status,
        })

        // Scrubbing thumbnails come from the raw link, not the playback URL
        setStoryboardUrl(d.link ? storyboardManifestUrl(d.link) : undefined)

        // Best case: stream_link already available (cached transcode)
        if (d.stream_link) {
          setPlayUrl(d.stream_link)
          setLoading(false)
          return
        }

        // Construct live transcode URL from direct link (instant playback)
        if (d.link) {
          const hlsUrl = liveTranscodeUrl(d.link)
          debugLog('[Player:page] Constructed live transcode URL:', hlsUrl.substring(0, 100) + '...')
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
    lastPosRef.current = position
    lastDurRef.current = duration
    // Scrobble "stop" once past 80% — Trakt marks it watched
    if (playingRef.current && traktMedia && !stopSentRef.current && position / duration >= 0.8) {
      stopSentRef.current = true
      scrobble('stop', traktMedia, 100).catch(() => {})
    }
  }

  // ─── Trakt scrobbling ───────────────────────────────────────────────────────

  const traktMedia = useMemo<TraktScrobbleMedia | null>(() => {
    if (!isTraktConnected()) return null
    if (mode === 'movie') {
      const movie = movies.find((m) => m.id === mediaId)
      if (!movie) return null
      const year = parseInt(movie.tmdbDetail?.release_date?.slice(0, 4) ?? movie.year ?? '0', 10)
      return {
        movie: {
          title: movieDisplayTitle(movie),
          year: year > 1900 ? year : undefined,
          ids: { tmdb: movie.tmdbId },
        },
      }
    }
    const show = tvShows.find((s) => s.id === mediaId)
    if (!show) return null
    for (const season of show.seasons) {
      const ep = season.episodes.find((e) => e.file.id === fileId)
      if (ep) {
        const year = parseInt(show.tmdbDetail?.first_air_date?.slice(0, 4) ?? show.year ?? '0', 10)
        return {
          show: {
            title: showDisplayTitle(show),
            year: year > 1900 ? year : undefined,
            ids: { tmdb: show.tmdbId },
          },
          episode: { season: season.number, number: ep.number },
        }
      }
    }
    return null
  }, [mode, mediaId, fileId, movies, tvShows])

  const [playing, setPlaying] = useState(false)
  const lastPosRef = useRef(0)
  const lastDurRef = useRef(0)
  const playingRef = useRef(false)
  const startedRef = useRef(false)
  const stopSentRef = useRef(false)
  const traktMediaRef = useRef<TraktScrobbleMedia | null>(null)
  traktMediaRef.current = traktMedia

  // Reset per-file scrobble state when switching files/episodes
  useEffect(() => {
    startedRef.current = false
    stopSentRef.current = false
    lastPosRef.current = 0
    lastDurRef.current = 0
  }, [fileId])

  useEffect(() => {
    if (!traktMedia || !isTraktConnected()) return
    const pct = lastDurRef.current > 0 ? (lastPosRef.current / lastDurRef.current) * 100 : 0
    if (playing) {
      playingRef.current = true
      startedRef.current = true
      if (!stopSentRef.current) scrobble('start', traktMedia, pct).catch(() => {})
    } else {
      playingRef.current = false
      if (startedRef.current && !stopSentRef.current) {
        scrobble('pause', traktMedia, pct).catch(() => {})
      }
    }
  }, [playing, traktMedia])

  // Best-effort pause when leaving the player mid-watch
  useEffect(() => {
    return () => {
      const media = traktMediaRef.current
      if (media && isTraktConnected() && startedRef.current && !stopSentRef.current) {
        const pct = lastDurRef.current > 0 ? (lastPosRef.current / lastDurRef.current) * 100 : 0
        scrobble('pause', media, pct).catch(() => {})
      }
    }
  }, [])

  function handleBack() {
    navigate(-1)
  }

  // ─── Next episode logic ───────────────────────────────────────────────────
  const nextEpisodeInfo = useMemo(() => {
    if (mode !== 'show' || !fileId) return null
    const show = tvShows.find((s) => s.id === mediaId)
    if (!show) return null

    const sortedSeasons = [...show.seasons].sort((a, b) => a.number - b.number)
    for (let si = 0; si < sortedSeasons.length; si++) {
      const season = sortedSeasons[si]
      const sortedEps = [...season.episodes].sort((a, b) => a.number - b.number)
      for (let ei = 0; ei < sortedEps.length; ei++) {
        if (sortedEps[ei].file.id === fileId) {
          // Found current episode — look for next
          if (ei + 1 < sortedEps.length) {
            const next = sortedEps[ei + 1]
            const label = next.tmdbEpisode?.name
              ? `S${String(season.number).padStart(2, '0')}E${String(next.number).padStart(2, '0')} — ${next.tmdbEpisode.name}`
              : `S${String(season.number).padStart(2, '0')}E${String(next.number).padStart(2, '0')}`
            return { fileId: next.file.id, label }
          }
          // Try next season
          if (si + 1 < sortedSeasons.length) {
            const nextSeason = sortedSeasons[si + 1]
            const nextSeasonEps = [...nextSeason.episodes].sort((a, b) => a.number - b.number)
            if (nextSeasonEps.length > 0) {
              const next = nextSeasonEps[0]
              const label = next.tmdbEpisode?.name
                ? `S${String(nextSeason.number).padStart(2, '0')}E${String(next.number).padStart(2, '0')} — ${next.tmdbEpisode.name}`
                : `S${String(nextSeason.number).padStart(2, '0')}E${String(next.number).padStart(2, '0')}`
              return { fileId: next.file.id, label }
            }
          }
          return null // Last episode
        }
      }
    }
    return null
  }, [mode, mediaId, fileId, tvShows])

  function handleNextEpisode() {
    if (nextEpisodeInfo) {
      navigate(`/play/show/${mediaId}/${nextEpisodeInfo.fileId}`, { replace: true })
    }
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
        <AlertTriangleIcon className="w-14 h-14 text-premiumflix-red" strokeWidth={1.5} />
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
        storyboardUrl={storyboardUrl}
        title={title}
        subtitle={subtitle}
        subtitles={file?.subtitles}
        openSubtitles={openSubs}
        initialPosition={initialPosition}
        onProgress={handleProgress}
        onPlayStateChange={setPlaying}
        onBack={handleBack}
        onNextEpisode={nextEpisodeInfo ? handleNextEpisode : undefined}
        nextEpisodeLabel={nextEpisodeInfo?.label}
      />
    </div>
  )
}
