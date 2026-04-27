import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Hls from 'hls.js'
import type { SubtitleTrack } from '../types'
import type { PMSubtitle } from '../services/premiumize'
import { debugLog } from '../lib/debug'

interface VideoPlayerProps {
  src: string
  title: string
  subtitle?: string
  subtitles?: SubtitleTrack[]
  openSubtitles?: PMSubtitle[]
  initialPosition?: number
  onProgress?: (position: number, duration: number) => void
  onBack?: () => void
  onEnded?: () => void
  onNextEpisode?: () => void
  nextEpisodeLabel?: string
}

export function VideoPlayer({
  src,
  title,
  subtitle,
  subtitles,
  openSubtitles,
  initialPosition = 0,
  onProgress,
  onBack,
  onEnded,
  onNextEpisode,
  nextEpisodeLabel,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const subtitleBlobRef = useRef<string | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seeking, setSeeking] = useState(false)

  // ─── Audio tracks ────────────────────────────────────────────────────────
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string; lang: string }[]>([])
  const [activeAudioTrack, setActiveAudioTrack] = useState<number>(-1)
  const [showLangMenu, setShowLangMenu] = useState(false)

  // ─── Subtitles ────────────────────────────────────────────────────────────
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null)
  const [hlsSubTracks, setHlsSubTracks] = useState<{ id: number; name: string; lang: string }[]>([])
  const [activeHlsSub, setActiveHlsSub] = useState<number>(-1)
  const [showSubMenu, setShowSubMenu] = useState(false)
  const userSubOffRef = useRef(false) // tracks explicit user "off" intent

  // OpenSubtitles state
  const [loadingOpenSub, setLoadingOpenSub] = useState<string | null>(null) // dl_link being loaded

  // ─── Quality levels ────────────────────────────────────────────────────
  const [levels, setLevels] = useState<{ width: number; height: number; bitrate: number }[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [autoLevel, setAutoLevel] = useState(true)
  const [showQualityMenu, setShowQualityMenu] = useState(false)

  // ─── Playback speed ────────────────────────────────────────────────────
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)

  // ─── Next episode countdown ─────────────────────────────────────────────
  const [showNextUp, setShowNextUp] = useState(false)
  const [nextUpCountdown, setNextUpCountdown] = useState(10)
  const nextUpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Mobile double-tap ──────────────────────────────────────────────────
  const lastTapRef = useRef(0)
  const lastTapXRef = useRef(0)
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tapFeedback, setTapFeedback] = useState<{ side: 'left' | 'right'; count: number } | null>(null)

  // ─── Mobile detection ────────────────────────────────────────────────────
  const isMobile = useMemo(() => {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isNarrowScreen = window.matchMedia('(max-width: 768px)').matches
    return hasTouch && isNarrowScreen
  }, [])

  // ─── Seek dragging (live preview) ─────────────────────────────────────────
  const [isSeekDragging, setIsSeekDragging] = useState(false)
  const [seekPreviewTime, setSeekPreviewTime] = useState<number>(0)
  const seekPreviewPct = duration > 0 ? (seekPreviewTime / duration) * 100 : 0

  // ─── Swipe gesture (volume/brightness) ─────────────────────────────────────
  const swipeStartRef = useRef<{ x: number; y: number; volume: number; brightness: number; side: 'left' | 'right' } | null>(null)
  const [swipeGesture, setSwipeGesture] = useState<{ type: 'volume' | 'brightness'; value: number } | null>(null)
  const [brightness, setBrightness] = useState(1)

  // ─── Landscape detection ──────────────────────────────────────────────────
  const [isPortrait, setIsPortrait] = useState(false)

  // ─── Keyboard shortcut help ──────────────────────────────────────────────
  const [showHelp, setShowHelp] = useState(false)

  // ─── Mobile menu overlay ─────────────────────────────────────────────────
  const [mobileMenuContent, setMobileMenuContent] = useState<React.ReactNode | null>(null)

  // ─── Storyboard thumbnails ──────────────────────────────────────────────
  const [thumbnails, setThumbnails] = useState<ThumbCue[]>([])
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverX, setHoverX] = useState(0)
  const [hoverImgUrl, setHoverImgUrl] = useState<string | null>(null)
  const [hoverCrop, setHoverCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // ─── PiP / Cast / AirPlay ────────────────────────────────────────────────
  const [pipSupported, setPipSupported] = useState(false)
  const [isCasting, setIsCasting] = useState(false)
  const [airplayAvailable, setAirplayAvailable] = useState(false)

  // ─── HLS setup ────────────────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setError(null)
    setIsLoading(true)

    // Destroy previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const isHLS = src.includes('.m3u8') || src.includes('stream_link') || src.includes('/stream/')
    debugLog('[Player Loading source:', src.substring(0, 120) + '...', 'isHLS:', isHLS)

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.subtitleTrack = -1 // don't auto-select subtitles

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[Player] Fatal HLS error:', data.type, data.details)
          setError('Playback failed. The stream may have expired — try going back and playing again.')
        }
      })

      // Detect audio + subtitle tracks from manifest
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        debugLog('[Player Manifest parsed — levels:', data.levels.length,
          'audio:', hls.audioTracks.length,
          'subs:', hls.subtitleTracks.length)
        if (data.levels.length > 0) {
          debugLog('[Player Level details:', data.levels.map((l, i) => `${i}: ${l.width}x${l.height} ${l.codecSet}`))
          setLevels(data.levels.map((l) => ({ width: l.width ?? 0, height: l.height ?? 0, bitrate: l.bitrate ?? 0 })))
          setCurrentLevel(hls.currentLevel)
        }
        if (hls.audioTracks.length > 0) {
          const tracks = hls.audioTracks.map((t, i) => ({
            id: i,
            name: t.name ?? t.lang ?? `Track ${i + 1}`,
            lang: t.lang ?? '',
          }))
          setAudioTracks(tracks)
          setActiveAudioTrack(hls.audioTrack)
          debugLog('[Player Audio tracks:', tracks.length, tracks.map(t => t.lang || t.name))
        }
        if (hls.subtitleTracks.length > 0) {
          const tracks = hls.subtitleTracks.map((t, i) => ({
            id: i,
            name: t.name ?? t.lang ?? `Track ${i + 1}`,
            lang: t.lang ?? '',
          }))
          setHlsSubTracks(tracks)
          debugLog('[Player Subtitle tracks:', tracks.length, tracks.map(t => t.lang || t.name))
        }
      })

      // Late track updates
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        const tracks = hls.audioTracks.map((t, i) => ({
          id: i,
          name: t.name ?? t.lang ?? `Track ${i + 1}`,
          lang: t.lang ?? '',
        }))
        setAudioTracks(tracks)
        setActiveAudioTrack(hls.audioTrack)
      })
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
        setActiveAudioTrack(hls.audioTrack)
      })

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        const tracks = hls.subtitleTracks.map((t, i) => ({
          id: i,
          name: t.name ?? t.lang ?? `Track ${i + 1}`,
          lang: t.lang ?? '',
        }))
        setHlsSubTracks(tracks)
        debugLog('[Player Subtitle tracks updated:', tracks.length)
      })

      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, () => {
        // Don't re-enable subs if user explicitly turned them off
        if (!userSubOffRef.current) {
          setActiveHlsSub(hls.subtitleTrack)
        }
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        setCurrentLevel(data.level)
      })

      hls.on(Hls.Events.LEVELS_UPDATED, (_e, data) => {
        setLevels(data.levels.map((l) => ({ width: l.width ?? 0, height: l.height ?? 0, bitrate: l.bitrate ?? 0 })))
      })

    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = src
    } else {
      video.src = src
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      video.src = ''
      video.removeAttribute('src')
      setAudioTracks([])
      setActiveAudioTrack(-1)
      setHlsSubTracks([])
      setActiveHlsSub(-1)
      setLevels([])
      setCurrentLevel(-1)
      setAutoLevel(true)
      userSubOffRef.current = false
    }
  }, [src])

  // ─── Storyboard thumbnails fetch ─────────────────────────────────────────
  //
  // CDN77 provides hover thumbnail storyboards for live-transcoded streams.
  // The manifest is a WebVTT file where each cue contains an image URL (sprite sheet)
  // with #xywh= crop coordinates.

  useEffect(() => {
    setThumbnails([])
    if (!src) return

    let storyboardUrl: string | null = null
    try {
      if (src.includes('/vod/') && src.startsWith('http')) {
        const idx = src.indexOf('/vod/') + 5
        const directPart = src.substring(idx)
        const urlObj = new URL(src)
        const base = `${urlObj.origin}/storyboards/manifest`
        const params = new URLSearchParams({
          url: directPart,
          interval: '15',
          width: '160',
          height: '90',
        })
        storyboardUrl = `${base}?${params.toString()}`
      }
    } catch { /* not a valid URL */ }
    if (!storyboardUrl) return

    let cancelled = false
    fetch(storyboardUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`)))
      .then((vtt) => {
        if (cancelled) return
        const thumbs = parseStoryboardVtt(vtt, storyboardUrl!)
        if (thumbs.length > 0) {
          debugLog('[Player Loaded storyboard:', thumbs.length, 'thumbnails')
          setThumbnails(thumbs)
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [src])

  // ─── PiP / AirPlay support check ──────────────────────────────────────────

  useEffect(() => {
    setPipSupported('pictureInPictureEnabled' in document)
    // AirPlay: Safari exposes webkitShowPlaybackTargetPicker on video
    setAirplayAvailable(!!(document.createElement('video') as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: unknown }).webkitShowPlaybackTargetPicker)
  }, [])

  // ─── Chromecast init ──────────────────────────────────────────────────────

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    if (!w.__onGCastApiAvailable) {
      // Load Cast SDK lazily
      const s = document.createElement('script')
      s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
      s.async = true
      document.head.appendChild(s)
    }
  }, [])

  // ─── Subtitle visibility enforcement ────────────────────────────────────────
  //
  // hls.js creates textTrack elements for each subtitle track, but doesn't
  // always set the mode to 'showing'. We need to:
  // - Show ONLY the active track
  // - Hide all other subtitle tracks
  // - Poll because tracks load asynchronously

  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current
      if (!video) return

      const wantSubs = activeHlsSub >= 0 || activeSubtitle

      for (let i = 0; i < video.textTracks.length; i++) {
        const tt = video.textTracks[i]
        if (tt.kind !== 'subtitles' && tt.kind !== 'captions') continue

        if (!wantSubs) {
          // Subtitles are OFF — hide everything
          if (tt.mode !== 'hidden') tt.mode = 'hidden'
        } else if (activeHlsSub >= 0) {
          // HLS subtitle mode — show only the track matching our active index
          // hls.js sets the id/label based on the track index
          // The active track should be 'showing', all others 'hidden'
          const trackIndex = hlsSubTracks.findIndex(
            (t) => t.name === tt.label || t.lang === tt.language
          )
          const isActive = trackIndex === activeHlsSub
          if (isActive && tt.mode !== 'showing') {
            debugLog('[Player Showing subtitle track:', tt.label, tt.language)
            tt.mode = 'showing'
          } else if (!isActive && tt.mode === 'showing') {
            tt.mode = 'hidden'
          }
        } else if (activeSubtitle) {
          // External subtitle mode — show only the matching label
          const activeLabel = activeSubtitle.startsWith('os:')
            ? openSubtitles?.find((s) => `os:${s.dl_link}` === activeSubtitle)?.language + ' (OS)'
            : subtitles?.find((s) => s.id === activeSubtitle)?.label
          const isActive = tt.label === activeLabel
          if (isActive && tt.mode !== 'showing') tt.mode = 'showing'
          else if (!isActive && tt.mode === 'showing') tt.mode = 'hidden'
        }
      }
    }, 300)

    return () => clearInterval(interval)
  }, [activeHlsSub, activeSubtitle, hlsSubTracks, subtitles, openSubtitles])

  // ─── External subtitle loading ────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current
    video?.querySelectorAll('track.subtitle-track').forEach((t) => t.remove())
    if (subtitleBlobRef.current) {
      URL.revokeObjectURL(subtitleBlobRef.current)
      subtitleBlobRef.current = null
    }

    if (!activeSubtitle || !subtitles?.length || !video) return

    const track = subtitles.find((s) => s.id === activeSubtitle)
    if (!track?.directLink) return

    let cancelled = false

    fetch(track.directLink)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((text) => {
        if (cancelled) return
        const isVtt = track.fileName.toLowerCase().endsWith('.vtt')
        const vtt = isVtt ? text : srtToVtt(text)
        const blob = new Blob([vtt], { type: 'text/vtt' })
        const url = URL.createObjectURL(blob)
        subtitleBlobRef.current = url

        const el = document.createElement('track')
        el.className = 'subtitle-track'
        el.kind = 'subtitles'
        el.label = track.label
        el.srclang = track.language !== 'unknown' ? track.language : ''
        el.src = url
        video.appendChild(el)

        el.addEventListener('load', () => {
          for (let i = 0; i < video.textTracks.length; i++) {
            const tt = video.textTracks[i]
            tt.mode = tt.label === track.label ? 'showing' : 'disabled'
          }
        }, { once: true })
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [activeSubtitle, subtitles])

  useEffect(() => {
    return () => {
      if (subtitleBlobRef.current) URL.revokeObjectURL(subtitleBlobRef.current)
    }
  }, [])

  // ─── Video event listeners ─────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoadedMetadata = () => {
      setDuration(video.duration)
      setIsLoading(false)
      if (initialPosition > 30 && initialPosition < video.duration * 0.9) {
        video.currentTime = initialPosition
      }
      video.play().catch(() => {})
    }

    const onTimeUpdate = () => {
      if (!seeking) setCurrentTime(video.currentTime)
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      }
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onWaiting = () => setIsLoading(true)
    const onCanPlay = () => setIsLoading(false)
    const handleEnded = () => {
      setIsPlaying(false)
      if (onNextEpisode) {
        setShowNextUp(true)
        setNextUpCountdown(10)
      } else {
        onEnded?.()
      }
    }
    const onError = () => {
      setError('Playback failed. The stream may have expired — try going back and playing again.')
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('error', onError)

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', onError)
    }
  }, [seeking, initialPosition, onEnded])

  // ─── Progress saving ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!onProgress) return
    progressTimer.current = setInterval(() => {
      const video = videoRef.current
      if (video && !video.paused && video.duration > 0) {
        onProgress(video.currentTime, video.duration)
      }
    }, 10_000)
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current)
    }
  }, [onProgress])

  // Save on unmount
  useEffect(() => {
    return () => {
      const video = videoRef.current
      if (video && onProgress && video.duration > 0) {
        onProgress(video.currentTime, video.duration)
      }
    }
  }, [onProgress])

  // ─── Next-episode countdown ─────────────────────────────────────────────────

  useEffect(() => {
    if (!showNextUp) return
    nextUpTimerRef.current = setInterval(() => {
      setNextUpCountdown((prev) => {
        if (prev <= 1) {
          if (nextUpTimerRef.current) clearInterval(nextUpTimerRef.current)
          onNextEpisode?.()
          setShowNextUp(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (nextUpTimerRef.current) clearInterval(nextUpTimerRef.current)
    }
  }, [showNextUp])

  // ─── Control visibility ───────────────────────────────────────────────────

  const hideDelay = isMobile ? 4000 : 3000

  // Ref to track if any dropdown menu is open (avoids stale closures in timers)
  const menuOpenRef = useRef(false)

  useEffect(() => {
    menuOpenRef.current = showSubMenu || showLangMenu || showSpeedMenu || showQualityMenu
  }, [showSubMenu, showLangMenu, showSpeedMenu, showQualityMenu])

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (isPlaying && !menuOpenRef.current) setShowControls(false)
    }, hideDelay)
  }, [isPlaying, hideDelay])

  useEffect(() => {
    if (!isPlaying) setShowControls(true)
    else {
      hideTimer.current = setTimeout(() => {
        if (!menuOpenRef.current) setShowControls(false)
      }, hideDelay)
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [isPlaying, hideDelay])

  // ─── Fullscreen ──────────────────────────────────────────────────────────

  useEffect(() => {
    const onChange = () => {
      const fsEl = document.fullscreenElement || (document as unknown as Record<string, Element | null>).webkitFullscreenElement || (document as unknown as Record<string, Element | null>).webkitCurrentFullScreenElement
      setIsFullscreen(!!fsEl)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  function toggleFullscreen() {
    // Try standard Fullscreen API on the container
    if (!document.fullscreenElement && !(document as unknown as Record<string, Element | null>).webkitFullscreenElement) {
      const container = containerRef.current
      if (container) {
        const req = container.requestFullscreen || (container as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen
        if (req) {
          req.call(container).catch(() => {})
        } else {
          // Fallback: iOS Safari — fullscreen on the video element itself
          const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
          video?.webkitEnterFullscreen?.()
        }
      }
    } else {
      const exit = document.exitFullscreen || (document as unknown as Record<string, (() => Promise<void>) | undefined>).webkitExitFullscreen
      exit?.call(document).catch(() => {})
    }
  }

  // ─── Landscape detection ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isMobile) return
    const check = () => {
      setIsPortrait(window.innerHeight > window.innerWidth * 1.2)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', () => setTimeout(check, 200))
    return () => {
      window.removeEventListener('resize', check)
    }
  }, [isMobile])

  // ─── Mobile menu overlay helper ──────────────────────────────────────────
  const closeAllMenus = useCallback(() => {
    setShowSubMenu(false)
    setShowLangMenu(false)
    setShowSpeedMenu(false)
    setShowQualityMenu(false)
    setMobileMenuContent(null)
  }, [])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const video = videoRef.current
      if (!video) return
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          video.paused ? video.play() : video.pause()
          showControlsTemporarily()
          break
        case 'ArrowRight':
          video.currentTime = Math.min(video.currentTime + 10, video.duration)
          showControlsTemporarily()
          break
        case 'ArrowLeft':
          video.currentTime = Math.max(video.currentTime - 10, 0)
          showControlsTemporarily()
          break
        case 'ArrowUp':
          video.volume = Math.min(video.volume + 0.1, 1)
          setVolume(video.volume)
          showControlsTemporarily()
          break
        case 'ArrowDown':
          video.volume = Math.max(video.volume - 0.1, 0)
          setVolume(video.volume)
          showControlsTemporarily()
          break
        case 'm':
          video.muted = !video.muted
          setIsMuted(video.muted)
          break
        case 'f':
          toggleFullscreen()
          break
        case '?':
          setShowHelp((v) => !v)
          break
        case 'Escape':
          if (showHelp) setShowHelp(false)
          else if (isFullscreen) document.exitFullscreen()
          else onBack?.()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen, showHelp, showControlsTemporarily, onBack])

  // ─── Seek bar ────────────────────────────────────────────────────────────

  function seekToPosition(clientX: number) {
    const bar = seekBarRef.current
    const video = videoRef.current
    if (!bar || !video || !duration) return
    const rect = bar.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    video.currentTime = fraction * video.duration
    setCurrentTime(video.currentTime)
  }

  function seekPreviewPosition(clientX: number) {
    const bar = seekBarRef.current
    if (!bar || !duration) return
    const rect = bar.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setSeekPreviewTime(fraction * duration)
  }

  function handleSeekBarClick(e: React.MouseEvent<HTMLDivElement>) {
    seekToPosition(e.clientX)
  }

  function handleSeekBarTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length > 0) {
      setIsSeekDragging(true)
      seekPreviewPosition(e.touches[0].clientX)
    }
  }

  function handleSeekBarTouch(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length > 0) {
      seekPreviewPosition(e.touches[0].clientX)
    }
  }

  function handleSeekBarHover(e: React.MouseEvent<HTMLDivElement>) {
    const bar = seekBarRef.current
    if (!bar || !duration) return
    const rect = bar.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = fraction * duration
    setHoverTime(time)
    setHoverX(e.clientX - rect.left)

    if (thumbnails.length > 0) {
      let best = thumbnails[0]
      for (const t of thumbnails) {
        if (t.time <= time) best = t
        else break
      }
      setHoverImgUrl(best.url)
      setHoverCrop({ x: best.x, y: best.y, w: best.w, h: best.h })
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function formatTime(s: number): string {
    if (!isFinite(s)) return '0:00'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    video.paused ? video.play() : video.pause()
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return
    const v = parseFloat(e.target.value)
    video.volume = v
    setVolume(v)
    setIsMuted(v === 0)
  }

  function skip(seconds: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration))
  }

  function changeQuality(levelIndex: number) {
    if (!hlsRef.current) return
    if (levelIndex === -1) {
      hlsRef.current.currentLevel = -1
      setAutoLevel(true)
    } else {
      hlsRef.current.currentLevel = levelIndex
      setAutoLevel(false)
    }
    setShowQualityMenu(false)
  }

  function changeSpeed(rate: number) {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = rate
    setPlaybackRate(rate)
    setShowSpeedMenu(false)
    try { localStorage.setItem('player-speed', String(rate)) } catch {}
  }

  // Load saved playback speed
  useEffect(() => {
    try {
      const saved = localStorage.getItem('player-speed')
      if (saved) {
        const rate = parseFloat(saved)
        if (isFinite(rate) && rate > 0) {
          const video = videoRef.current
          if (video) video.playbackRate = rate
          setPlaybackRate(rate)
        }
      }
    } catch {}
  }, [])

  function levelLabel(h: number): string {
    if (h >= 2160) return '4K'
    if (h >= 1440) return '1440p'
    if (h >= 1080) return '1080p'
    if (h >= 720) return '720p'
    if (h >= 480) return '480p'
    if (h >= 360) return '360p'
    return `${h}p`
  }

  async function togglePiP() {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await video.requestPictureInPicture()
      }
    } catch { /* PiP not supported or denied */ }
  }

  function triggerAirPlay() {
    const video = videoRef.current as (HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void }) | null
    video?.webkitShowPlaybackTargetPicker?.()
  }

  async function startChromecast() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      const castCtx = w.cast?.framework?.CastContext?.getInstance?.()
      if (!castCtx) return

      const session = castCtx.getCurrentSession?.()
      if (session) {
        session.end?.(true)
        setIsCasting(false)
        return
      }

      castCtx.setOptions?.({
        receiverApplicationId: 'CC1AD845',
        autoJoinPolicy: 'origin_scoped',
      })
      await castCtx.requestSession?.()

      // Session started — load media
      const currentSession = castCtx.getCurrentSession?.()
      if (currentSession && src) {
        const MediaInfo = w.chrome?.cast?.media?.MediaInfo
        const GenericMetadata = w.chrome?.cast?.media?.GenericMediaMetadata
        const LoadRequest = w.chrome?.cast?.media?.LoadRequest
        if (MediaInfo) {
          const mediaInfo = new MediaInfo(src, 'application/x-mpegurl')
          mediaInfo.streamType = 'BUFFERED'
          if (GenericMetadata) {
            const metadata = new GenericMetadata()
            metadata.metadataType = 0
            metadata.title = title
            mediaInfo.metadata = metadata
          }
          if (LoadRequest) {
            const request = new LoadRequest(mediaInfo)
            await currentSession.loadMedia?.(request)
            setIsCasting(true)
          }
        }
      }
    } catch (err) {
      console.warn('[Player] Chromecast error:', err)
    }
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0

  // ─── Mobile menu content builders ─────────────────────────────────────────

  const subtitleMenuContent = useMemo(() => (
    <>
      <div className="px-4 py-2 text-white/40 text-xs font-bold uppercase tracking-wider border-b border-white/10">Subtitles</div>
      <button
        onClick={() => {
          userSubOffRef.current = true
          setActiveSubtitle(null)
          setActiveHlsSub(-1)
          if (hlsRef.current) hlsRef.current.subtitleTrack = -1
          const v = videoRef.current
          if (v) {
            for (let i = 0; i < v.textTracks.length; i++) {
              if (v.textTracks[i].kind === 'subtitles' || v.textTracks[i].kind === 'captions') {
                v.textTracks[i].mode = 'hidden'
              }
            }
          }
          closeAllMenus()
        }}
        className={`w-full text-left px-4 py-3 text-sm transition-colors ${
          !activeSubtitle && activeHlsSub < 0 ? 'bg-red-600 text-white' : 'text-white/80 active:bg-white/10'
        }`}
      >
        Off
      </button>
      {hlsSubTracks.map((track) => (
        <button
          key={`hls-${track.id}`}
          onClick={() => {
            userSubOffRef.current = false
            setActiveSubtitle(null)
            if (hlsRef.current) hlsRef.current.subtitleTrack = track.id
            setActiveHlsSub(track.id)
            closeAllMenus()
          }}
          className={`w-full text-left px-4 py-3 text-sm transition-colors ${
            track.id === activeHlsSub ? 'bg-red-600 text-white' : 'text-white/80 active:bg-white/10'
          }`}
        >
          {track.name || track.lang || `Track ${track.id + 1}`}
        </button>
      ))}
      {subtitles?.map((track) => (
        <button
          key={track.id}
          onClick={() => {
            userSubOffRef.current = false
            if (hlsRef.current) hlsRef.current.subtitleTrack = -1
            setActiveHlsSub(-1)
            setActiveSubtitle(track.id)
            closeAllMenus()
          }}
          className={`w-full text-left px-4 py-3 text-sm transition-colors ${
            track.id === activeSubtitle ? 'bg-red-600 text-white' : 'text-white/80 active:bg-white/10'
          }`}
        >
          {track.label}
        </button>
      ))}
    </>
  ), [hlsSubTracks, subtitles, activeHlsSub, activeSubtitle, closeAllMenus])

  const settingsMenuContent = useMemo(() => (
    <>
      {/* Speed section */}
      <div className="px-4 py-2 text-white/40 text-xs font-bold uppercase tracking-wider border-b border-white/10">Speed</div>
      <div className="flex flex-wrap gap-1 px-3 py-2">
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
          <button
            key={rate}
            onClick={() => changeSpeed(rate)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              rate === playbackRate
                ? 'bg-red-600 text-white'
                : 'text-white/70 bg-white/10 active:bg-white/20'
            }`}
          >
            {rate}x
          </button>
        ))}
      </div>

      {/* Audio section */}
      {audioTracks.length > 1 && (
        <>
          <div className="px-4 py-2 text-white/40 text-xs font-bold uppercase tracking-wider border-b border-white/10">Audio</div>
          {audioTracks.map((track) => (
            <button
              key={track.id}
              onClick={() => {
                if (hlsRef.current) hlsRef.current.audioTrack = track.id
                closeAllMenus()
              }}
              className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                track.id === activeAudioTrack
                  ? 'bg-red-600 text-white'
                  : 'text-white/80 active:bg-white/10'
              }`}
            >
              <span className="uppercase font-medium mr-2">{track.lang || '??'}</span>
              <span className="text-white/60">{track.name}</span>
            </button>
          ))}
        </>
      )}

      {/* Quality section */}
      {levels.length > 1 && (
        <>
          <div className="px-4 py-2 text-white/40 text-xs font-bold uppercase tracking-wider border-b border-white/10">Quality</div>
          <button
            onClick={() => changeQuality(-1)}
            className={`w-full text-left px-4 py-3 text-sm transition-colors ${
              autoLevel
                ? 'bg-red-600 text-white font-bold'
                : 'text-white/80 active:bg-white/10'
            }`}
          >
            Auto{autoLevel && currentLevel >= 0 && ` (${levelLabel(levels[currentLevel]?.height)})`}
          </button>
          {levels.map((level, i) => (
            <button
              key={i}
              onClick={() => changeQuality(i)}
              className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                !autoLevel && i === currentLevel
                  ? 'bg-red-600 text-white font-bold'
                  : 'text-white/80 active:bg-white/10'
              }`}
            >
              <span className="font-medium">{levelLabel(level.height)}</span>
              {level.bitrate > 0 && <span className="text-white/40 ml-2">{(level.bitrate / 1_000_000).toFixed(1)} Mbps</span>}
            </button>
          ))}
        </>
      )}
    </>
  ), [playbackRate, audioTracks, activeAudioTrack, levels, autoLevel, currentLevel, closeAllMenus])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none"
      style={{ cursor: showControls ? 'default' : 'none' }}
      onMouseMove={showControlsTemporarily}
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return
        const touch = e.touches[0]
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const x = touch.clientX - rect.left
        swipeStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          volume,
          brightness,
          side: x < rect.width / 2 ? 'left' : 'right',
        }
      }}
      onTouchMove={(e) => {
        if (!swipeStartRef.current || e.touches.length !== 1) return
        const touch = e.touches[0]
        const dx = touch.clientX - swipeStartRef.current.x
        const dy = touch.clientY - swipeStartRef.current.y
        // Only activate for mostly-vertical swipes with significant movement
        if (Math.abs(dy) < 20 || Math.abs(dx) > Math.abs(dy)) return
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const deltaNorm = Math.max(-1, Math.min(1, -dy / (rect.height * 0.4)))
        if (swipeStartRef.current.side === 'right') {
          // Right half: volume
          const newVol = Math.max(0, Math.min(1, swipeStartRef.current.volume + deltaNorm))
          const video = videoRef.current
          if (video) {
            video.volume = newVol
            setVolume(newVol)
            setIsMuted(newVol === 0)
          }
          setSwipeGesture({ type: 'volume', value: newVol })
        } else {
          // Left half: brightness
          const newBright = Math.max(0.2, Math.min(1.5, swipeStartRef.current.brightness + deltaNorm * 0.6))
          setBrightness(newBright)
          setSwipeGesture({ type: 'brightness', value: newBright })
        }
      }}
      onTouchEnd={(e) => {
        // Clear swipe state
        const wasSwiping = swipeGesture !== null
        setSwipeGesture(null)
        swipeStartRef.current = null
        if (wasSwiping) return

        // Only handle taps directly on the container (not on buttons/controls)
        const target = e.target as HTMLElement
        if (target !== containerRef.current && target !== videoRef.current && !target.closest('video')) return

        const now = Date.now()
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const touch = e.changedTouches[0]
        if (!touch) return
        const x = touch.clientX - rect.left
        const isLeft = x < rect.width / 2.5
        const isRight = x > (rect.width * 1.5) / 2.5

        if (isLeft || isRight) {
          if (now - lastTapRef.current < 350 && Math.abs(x - lastTapXRef.current) < 80) {
            // Double tap to seek
            e.preventDefault()
            const video = videoRef.current
            if (video) {
              const skip = isLeft ? -10 : 10
              video.currentTime = Math.max(0, Math.min(video.currentTime + skip, video.duration))
              setTapFeedback({ side: isLeft ? 'left' : 'right', count: 2 })
              if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current)
              tapTimeoutRef.current = setTimeout(() => setTapFeedback(null), 600)
              try { navigator.vibrate?.(10) } catch {}
            }
            lastTapRef.current = 0
            return
          }
        }
        lastTapRef.current = now
        lastTapXRef.current = x
        togglePlay()
      }}
      onClick={(e) => {
        // Only handle clicks directly on the container/video (desktop)
        const target = e.target as HTMLElement
        if (target !== containerRef.current && target !== videoRef.current && !target.closest('video')) return

        // Double-click to seek on desktop
        const now = Date.now()
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const x = e.clientX - rect.left
        const isLeft = x < rect.width / 2.5
        const isRight = x > (rect.width * 1.5) / 2.5

        if (isLeft || isRight) {
          if (now - lastTapRef.current < 350 && Math.abs(x - lastTapXRef.current) < 80) {
            const video = videoRef.current
            if (video) {
              const skip = isLeft ? -10 : 10
              video.currentTime = Math.max(0, Math.min(video.currentTime + skip, video.duration))
              setTapFeedback({ side: isLeft ? 'left' : 'right', count: 2 })
              if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current)
              tapTimeoutRef.current = setTimeout(() => setTapFeedback(null), 600)
            }
            lastTapRef.current = 0
            return
          }
        }
        lastTapRef.current = now
        lastTapXRef.current = x
        togglePlay()
      }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        style={{ filter: brightness !== 1 ? `brightness(${brightness})` : undefined }}
        playsInline
        crossOrigin="anonymous"
        preload="auto"
      />

      {/* Loading spinner */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Double-tap feedback — YouTube style, centered on tap side */}
      {tapFeedback && (
        <div className={`absolute inset-y-0 ${tapFeedback.side === 'left' ? 'left-0 w-1/2' : 'right-0 w-1/2'} flex items-center justify-center pointer-events-none`}>
          <div className="flex flex-col items-center gap-1 animate-pulse">
            <div className="bg-white/20 rounded-full p-4">
              {tapFeedback.side === 'left' ? (
                <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" /></svg>
              ) : (
                <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
              )}
            </div>
            <span className="text-white text-sm font-bold">10 seconds</span>
          </div>
        </div>
      )}

      {/* Swipe gesture feedback (volume / brightness) */}
      {swipeGesture && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40">
          <div className="bg-black/70 rounded-xl px-5 py-4 flex flex-col items-center gap-2 min-w-[80px]">
            {swipeGesture.type === 'volume' ? (
              <VolumeIcon className="w-6 h-6 text-white" />
            ) : (
              <BrightnessIcon className="w-6 h-6 text-white" />
            )}
            <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{ width: `${Math.min(100, (swipeGesture.value / (swipeGesture.type === 'volume' ? 1 : 1.5)) * 100)}%` }}
              />
            </div>
            <span className="text-white text-xs font-medium">
              {swipeGesture.type === 'volume'
                ? `${Math.round(swipeGesture.value * 100)}%`
                : `${Math.round((swipeGesture.value / 1.5) * 100)}%`}
            </span>
          </div>
        </div>
      )}

      {/* Landscape hint (portrait phone) */}
      {isPortrait && isMobile && !isFullscreen && !isLoading && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none z-30">
          <div className="bg-black/60 rounded-full px-4 py-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="4" y="7" width="16" height="10" rx="2" />
              <path d="M12 3v4M12 17v4" />
            </svg>
            <span className="text-white/60 text-xs">Rotate for fullscreen</span>
          </div>
        </div>
      )}

      {/* Seek drag preview */}
      {isSeekDragging && duration > 0 && (
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 pointer-events-none z-40">
          <div className="bg-black/80 rounded-lg px-4 py-2">
            <span className="text-white text-lg font-bold tabular-nums">{formatTime(seekPreviewTime)}</span>
            <span className="text-white/50 text-sm ml-2 tabular-nums">/ {formatTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Mobile menu overlay — replaces dropdown menus on small screens */}
      {(isMobile && mobileMenuContent) && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => closeAllMenus()}
        >
          <div
            className="bg-black/95 backdrop-blur border border-white/20 rounded-xl max-h-[60vh] overflow-y-auto min-w-[200px] max-w-[280px]"
            onClick={(e) => e.stopPropagation()}
          >
            {mobileMenuContent}
          </div>
        </div>
      )}

      {/* Next Episode countdown */}
      {showNextUp && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/70"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-premiumflix-surface border border-white/20 rounded-xl p-6 max-w-sm w-full mx-4 text-center">
            {nextEpisodeLabel && (
              <p className="text-white/60 text-sm mb-1">Up next</p>
            )}
            <p className="text-white font-bold text-lg mb-4">
              {nextEpisodeLabel ?? 'Next episode'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  if (nextUpTimerRef.current) clearInterval(nextUpTimerRef.current)
                  setShowNextUp(false)
                  onNextEpisode?.()
                }}
                className="bg-white text-black font-bold px-6 py-2.5 rounded hover:bg-white/80 transition-colors"
              >
                Play ({nextUpCountdown}s)
              </button>
              <button
                onClick={() => {
                  if (nextUpTimerRef.current) clearInterval(nextUpTimerRef.current)
                  setShowNextUp(false)
                }}
                className="bg-white/10 text-white font-bold px-6 py-2.5 rounded hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
          <div className="text-premiumflix-red text-5xl">⚠</div>
          <p className="text-white text-center max-w-sm">{error}</p>
          <button
            onClick={(e) => { e.stopPropagation(); onBack?.() }}
            className="bg-white text-black px-6 py-2 rounded font-semibold hover:bg-white/80"
          >
            Go Back
          </button>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="bg-gradient-to-b from-black/80 to-transparent pt-2 sm:pt-4 pb-6 sm:pb-8 px-3 sm:px-8 flex items-center gap-3 sm:gap-4 safe-top">
          <button
            onClick={onBack}
            className="text-white hover:text-white/70 transition-colors p-2 -ml-1 sm:p-1"
          >
            <BackArrow className="w-6 h-6" />
          </button>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm sm:text-base truncate">{title}</p>
            {subtitle && <p className="text-white/60 text-xs truncate">{subtitle}</p>}
          </div>
        </div>

        {/* Center play button — hidden while buffering */}
        {!isLoading && (
          <div className="flex items-center justify-center gap-6 sm:gap-8 pointer-events-auto">
            <button onClick={() => skip(-10)} className="text-white hover:scale-110 transition-transform p-2">
              <Rewind className="w-8 h-8 sm:w-10 sm:h-10" />
            </button>
            <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform p-2">
              {isPlaying ? <PauseIcon className="w-12 h-12 sm:w-16 sm:h-16" /> : <PlayIcon className="w-12 h-12 sm:w-16 sm:h-16" />}
            </button>
            <button onClick={() => skip(10)} className="text-white hover:scale-110 transition-transform p-2">
              <FastForward className="w-8 h-8 sm:w-10 sm:h-10" />
            </button>
          </div>
        )}

        {/* Bottom controls */}
        <div
          className="bg-gradient-to-t from-black/90 to-transparent pt-6 sm:pt-8 pb-2 sm:pb-4 px-3 sm:px-8 safe-bottom"
          onMouseMove={(e) => e.stopPropagation()}
        >
          {/* Seek bar */}
          <div
            ref={seekBarRef}
            className="relative bg-white/20 rounded-full cursor-pointer mb-2 sm:mb-3 group/seek h-2 sm:h-1 hover:h-3 sm:hover:h-3 transition-all touch-none"
            onClick={handleSeekBarClick}
            onTouchStart={handleSeekBarTouchStart}
            onTouchMove={handleSeekBarTouch}
            onTouchEnd={(e) => {
              setIsSeekDragging(false)
              if (e.changedTouches.length > 0) {
                seekToPosition(e.changedTouches[0].clientX)
              }
            }}
            onMouseMove={handleSeekBarHover}
            onMouseLeave={() => setHoverTime(null)}
          >
            {/* Hover thumbnail preview */}
            {hoverTime !== null && (
              <div
                className="absolute bottom-full mb-3 pointer-events-none z-10"
                style={{ left: `${hoverX}px`, transform: 'translateX(-50%)' }}
              >
                <div className="flex flex-col items-center">
                  {hoverImgUrl && hoverCrop && thumbnails.length > 0 ? (
                    <div
                      className="overflow-hidden rounded-md border border-white/20 shadow-xl bg-black"
                      style={{ width: 160, height: 90 }}
                    >
                      <img
                        src={hoverImgUrl}
                        alt=""
                        className="absolute"
                        style={{
                          width: hoverCrop.w,
                          height: hoverCrop.h,
                          objectFit: 'none',
                          objectPosition: `-${hoverCrop.x}px -${hoverCrop.y}px`,
                          position: 'relative',
                          maxWidth: 'none',
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-[160px] h-[90px] bg-black/80 border border-white/20 rounded-md flex items-center justify-center">
                      <span className="text-white/40 text-xs">Preview</span>
                    </div>
                  )}
                  <span className="text-white text-xs mt-1 bg-black/80 px-2 py-0.5 rounded font-mono">
                    {formatTime(hoverTime)}
                  </span>
                </div>
              </div>
            )}
            <div
              className="absolute top-0 left-0 h-full bg-white/30 rounded-full"
              style={{ width: `${bufferedPct}%` }}
            />
            <div
              className="absolute top-0 left-0 h-full bg-premiumflix-red rounded-full"
              style={{ width: `${isSeekDragging ? seekPreviewPct : progressPct}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3 sm:h-3 bg-premiumflix-red rounded-full opacity-100 sm:opacity-0 sm:group-hover/seek:opacity-100 transition-opacity shadow-lg"
              style={{ left: `${isSeekDragging ? seekPreviewPct : progressPct}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>

          {/* Bottom row */}
          <div className="flex items-center gap-1.5 sm:gap-3 overflow-visible">
            <button onClick={togglePlay} className="text-white hover:text-white/70 transition-colors flex-shrink-0 p-1">
              {isPlaying ? <PauseIcon className="w-5 h-5 sm:w-6 sm:h-6" /> : <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>

            <button onClick={() => skip(-10)} className="text-white hover:text-white/70 transition-colors hidden sm:block flex-shrink-0">
              <Rewind className="w-5 h-5" />
            </button>
            <button onClick={() => skip(10)} className="text-white hover:text-white/70 transition-colors hidden sm:block flex-shrink-0">
              <FastForward className="w-5 h-5" />
            </button>

            {/* Volume — hidden on mobile (hardware buttons) */}
            {!isMobile && (
              <div className="flex items-center gap-1 group/vol flex-shrink-0">
                <button onClick={toggleMute} className="text-white hover:text-white/70 transition-colors p-1">
                  {isMuted || volume === 0 ? <MuteIcon className="w-5 h-5" /> : <VolumeIcon className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolume}
                  className="w-0 group-hover/vol:w-20 transition-all overflow-hidden accent-white cursor-pointer h-1"
                />
              </div>
            )}

            {/* Time */}
            <span className="text-white text-[11px] sm:text-sm tabular-nums ml-0.5 sm:ml-1 flex-shrink-0">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {/* Mobile settings gear */}
              {isMobile && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeAllMenus()
                    setMobileMenuContent(settingsMenuContent)
                  }}
                  className="text-white/60 hover:text-white transition-colors p-1"
                  title="Settings"
                >
                  <SettingsIcon className="w-5 h-5" />
                </button>
              )}

              {/* Subtitles */}
              {(hlsSubTracks.length > 0 || (subtitles && subtitles.length > 0) || (openSubtitles && openSubtitles.length > 0)) && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isMobile) {
                        closeAllMenus()
                        setMobileMenuContent(subtitleMenuContent)
                      } else {
                        setShowSubMenu((v) => !v)
                        setShowLangMenu(false); setShowQualityMenu(false); setShowSpeedMenu(false)
                      }
                    }}
                    className={`flex items-center gap-1 text-xs font-medium px-1.5 sm:px-2 py-1 rounded border transition-colors ${
                      activeSubtitle || activeHlsSub >= 0
                        ? 'text-white border-white/60 bg-white/10'
                        : 'text-white/60 hover:text-white border-white/30 hover:border-white/60'
                    }`}
                    title="Subtitles"
                  >
                    <CCIcon className="w-4 h-4" />
                  </button>
                  {showSubMenu && (
                    <div
                      className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-sm border border-white/20 rounded-lg overflow-y-auto overflow-x-hidden min-w-[130px] max-h-[50vh] shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          userSubOffRef.current = true
                          setActiveSubtitle(null)
                          setActiveHlsSub(-1)
                          if (hlsRef.current) hlsRef.current.subtitleTrack = -1
                          const v = videoRef.current
                          if (v) {
                            for (let i = 0; i < v.textTracks.length; i++) {
                              if (v.textTracks[i].kind === 'subtitles' || v.textTracks[i].kind === 'captions') {
                                v.textTracks[i].mode = 'hidden'
                              }
                            }
                          }
                          setShowSubMenu(false)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          !activeSubtitle && activeHlsSub < 0 ? 'bg-red-600 text-white' : 'text-white/80 hover:bg-white/10'
                        }`}
                      >
                        Off
                      </button>
                      {hlsSubTracks.map((track) => (
                        <button
                          key={`hls-${track.id}`}
                          onClick={() => {
                            userSubOffRef.current = false
                            setActiveSubtitle(null)
                            if (hlsRef.current) hlsRef.current.subtitleTrack = track.id
                            setActiveHlsSub(track.id)
                            setShowSubMenu(false)
                          }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                            track.id === activeHlsSub ? 'bg-red-600 text-white' : 'text-white/80 hover:bg-white/10'
                          }`}
                        >
                          {track.name || track.lang || `Track ${track.id + 1}`}
                        </button>
                      ))}
                      {subtitles?.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => {
                            userSubOffRef.current = false
                            if (hlsRef.current) hlsRef.current.subtitleTrack = -1
                            setActiveHlsSub(-1)
                            setActiveSubtitle(track.id)
                            setShowSubMenu(false)
                          }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                            track.id === activeSubtitle ? 'bg-red-600 text-white' : 'text-white/80 hover:bg-white/10'
                          }`}
                        >
                          {track.label}
                        </button>
                      ))}
                      {/* OpenSubtitles matches from Premiumize API */}
                      {openSubtitles && openSubtitles.length > 0 && (
                        <>
                          {subtitles && subtitles.length > 0 && (
                            <div className="border-t border-white/10 my-1" />
                          )}
                          <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-white/30 font-bold">
                            OpenSubtitles
                          </div>
                          {openSubtitles.map((sub) => (
                            <button
                              key={sub.dl_link}
                              onClick={() => {
                                userSubOffRef.current = false
                                if (hlsRef.current) hlsRef.current.subtitleTrack = -1
                                setActiveHlsSub(-1)
                                // Load SRT from dl_link, convert to VTT, apply
                                setLoadingOpenSub(sub.dl_link)
                                setActiveSubtitle(null)
                                const video = videoRef.current
                                if (!video) return
                                // Remove old tracks
                                video.querySelectorAll('track.subtitle-track').forEach(t => t.remove())
                                if (subtitleBlobRef.current) {
                                  URL.revokeObjectURL(subtitleBlobRef.current)
                                  subtitleBlobRef.current = null
                                }
                                fetch(proxyOsUrl(sub.dl_link))
                                  .then(r => {
                                    if (!r.ok) throw new Error(`HTTP ${r.status}`)
                                    return r.text()
                                  })
                                  .then(text => {
                                    if (!video) return
                                    const vtt = sub.name.toLowerCase().endsWith('.vtt') ? text : srtToVtt(text)
                                    const blob = new Blob([vtt], { type: 'text/vtt' })
                                    const url = URL.createObjectURL(blob)
                                    subtitleBlobRef.current = url
                                    const el = document.createElement('track')
                                    el.className = 'subtitle-track'
                                    el.kind = 'subtitles'
                                    el.label = `${sub.language} (OS)`
                                    el.srclang = sub.iso_code || ''
                                    el.src = url
                                    video.appendChild(el)
                                    el.addEventListener('load', () => {
                                      for (let i = 0; i < video.textTracks.length; i++) {
                                        const tt = video.textTracks[i]
                                        tt.mode = tt.label === `${sub.language} (OS)` ? 'showing' : 'disabled'
                                      }
                                    }, { once: true })
                                    // Set as active
                                    setActiveSubtitle(`os:${sub.dl_link}`)
                                    setLoadingOpenSub(null)
                                  })
                                  .catch((err) => {
                                    console.warn('[Player] Failed to load OpenSubtitle:', err)
                                    setLoadingOpenSub(null)
                                  })
                                setShowSubMenu(false)
                              }}
                              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                activeSubtitle === `os:${sub.dl_link}` ? 'bg-red-600 text-white' : 'text-white/80 hover:bg-white/10'
                              }`}
                            >
                              {loadingOpenSub === sub.dl_link ? (
                                <span className="flex items-center gap-2">
                                  <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin inline-block" />
                                  Loading...
                                </span>
                              ) : (
                                <span>{sub.language} <span className="text-white/30 text-xs">{sub.name}</span></span>
                              )}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Audio language */}
              {audioTracks.length >= 1 && (
                <div className="relative hidden sm:block">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowLangMenu((v) => !v) }}
                    className="text-white hover:text-white/70 transition-colors flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-white/30 hover:border-white/60"
                    title="Audio language"
                  >
                    <AudioIcon className="w-4 h-4" />
                    <span className="uppercase">
                      {audioTracks[activeAudioTrack]?.lang || audioTracks[activeAudioTrack]?.name || 'Audio'}
                    </span>
                  </button>
                  {showLangMenu && (
                    <div
                      className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-sm border border-white/20 rounded-lg overflow-y-auto overflow-x-hidden min-w-[120px] max-h-[50vh] shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {audioTracks.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => {
                            if (hlsRef.current) {
                              hlsRef.current.audioTrack = track.id
                            }
                            setShowLangMenu(false)
                          }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                            track.id === activeAudioTrack
                              ? 'bg-red-600 text-white'
                              : 'text-white/80 hover:bg-white/10'
                          }`}
                        >
                          <span className="uppercase font-medium mr-2">{track.lang || '??'}</span>
                          <span className="text-white/60">{track.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Playback speed */}
              <div className="relative hidden sm:block">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSpeedMenu((v) => !v); setShowQualityMenu(false); setShowLangMenu(false); setShowSubMenu(false) }}
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border transition-colors ${
                    playbackRate !== 1
                      ? 'text-white border-white/60 bg-white/10'
                      : 'text-white/60 hover:text-white border-white/30 hover:border-white/60'
                  }`}
                  title="Playback speed"
                >
                  <SpeedIcon className="w-4 h-4" />
                  <span>{playbackRate === 1 ? '1x' : `${playbackRate}x`}</span>
                </button>
                {showSpeedMenu && (
                  <div
                    className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-sm border border-white/20 rounded-lg overflow-y-auto overflow-x-hidden min-w-[100px] max-h-[50vh] shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => changeSpeed(rate)}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          rate === playbackRate
                            ? 'bg-red-600 text-white font-bold'
                            : 'text-white/80 hover:bg-white/10'
                        }`
                        }
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality / Resolution */}
              {levels.length > 1 && (
                <div className="relative hidden sm:block">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowQualityMenu((v) => !v); setShowSpeedMenu(false); setShowLangMenu(false); setShowSubMenu(false) }}
                    className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border transition-colors ${
                      !autoLevel
                        ? 'text-white border-white/60 bg-white/10'
                        : 'text-white/60 hover:text-white border-white/30 hover:border-white/60'
                    }`}
                    title="Quality"
                  >
                    <SettingsIcon className="w-4 h-4" />
                    <span>
                      {autoLevel
                        ? (currentLevel >= 0 ? `Auto · ${levelLabel(levels[currentLevel]?.height)}` : 'Auto')
                        : (currentLevel >= 0 ? levelLabel(levels[currentLevel]?.height) : 'Auto')
                      }
                    </span>
                  </button>
                  {showQualityMenu && (
                    <div
                      className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-sm border border-white/20 rounded-lg overflow-y-auto overflow-x-hidden min-w-[180px] max-h-[50vh] shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => changeQuality(-1)}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          autoLevel
                            ? 'bg-red-600 text-white font-bold'
                            : 'text-white/80 hover:bg-white/10'
                        }`
                        }
                      >
                        Auto
                        {autoLevel && currentLevel >= 0 && (
                          <span className="text-white/60 ml-2">({levelLabel(levels[currentLevel]?.height)})</span>
                        )}
                      </button>
                      {levels.map((level, i) => (
                        <button
                          key={i}
                          onClick={() => changeQuality(i)}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                            !autoLevel && i === currentLevel
                              ? 'bg-red-600 text-white font-bold'
                              : 'text-white/80 hover:bg-white/10'
                          }`
                          }
                        >
                          <span className="font-medium">{levelLabel(level.height)}</span>
                          <span className="text-white/50 ml-2">{level.width}×{level.height}</span>
                          {level.bitrate > 0 && (
                            <span className="text-white/40 ml-2">{(level.bitrate / 1_000_000).toFixed(1)} Mbps</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AirPlay */}
              {airplayAvailable && (
                <button onClick={triggerAirPlay} className="text-white/50 hover:text-white transition-colors hidden sm:block" title="AirPlay">
                  <AirPlayIcon className="w-5 h-5" />
                </button>
              )}

              {/* PiP */}
              {pipSupported && (
                <button onClick={togglePiP} className="text-white hover:text-white/70 transition-colors hidden sm:block" title="Picture in picture">
                  <PiPIcon className="w-5 h-5" />
                </button>
              )}

              {/* Chromecast */}
              <button onClick={startChromecast} className={`transition-colors hidden sm:block ${isCasting ? 'text-blue-400 hover:text-blue-300' : 'text-white/50 hover:text-white'}`} title="Cast">
                <CastIcon className="w-5 h-5" />
              </button>

              {/* Fullscreen */}
              <button onClick={toggleFullscreen} className="text-white hover:text-white/70 transition-colors p-1">
                {isFullscreen ? <ExitFullscreenIcon className="w-5 h-5" /> : <FullscreenIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard shortcut help */}
      {showHelp && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/80 z-50"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-premiumflix-surface border border-white/20 rounded-xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Keyboard Shortcuts</h3>
              <button onClick={() => setShowHelp(false)} className="text-white/50 hover:text-white text-lg">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ['Space / K', 'Play / Pause'],
                ['F', 'Fullscreen'],
                ['M', 'Mute'],
                ['←', 'Seek -10s'],
                ['→', 'Seek +10s'],
                ['↑', 'Volume up'],
                ['↓', 'Volume down'],
                ['?', 'This help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-white/70">{desc}</span>
                  <kbd className="bg-white/10 text-white px-2 py-0.5 rounded text-xs font-mono">{key}</kbd>
                </div>
              ))}
            </div>
            <p className="text-white/30 text-xs mt-4 text-center">Double-tap left/right side to seek on mobile</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Proxy OpenSubtitles URL ────────────────────────────────────────────────

function proxyOsUrl(dlLink: string): string {
  // In dev, route through Vite proxy to avoid CORS
  if (import.meta.env.DEV) {
    try {
      const url = new URL(dlLink)
      return `/ossub${url.pathname}${url.search}`
    } catch {
      return dlLink
    }
  }
  // In production, try direct (may or may not work depending on CORS)
  return dlLink
}

// ─── SRT → WebVTT ─────────────────────────────────────────────────────────

function srtToVtt(srt: string): string {
  const normalized = srt.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalized.split(/\n\n+/)
  const converted = blocks.map((block) => {
    const lines = block.split('\n')
    const start = lines[0]?.match(/^\d+$/) ? 1 : 0
    return lines
      .slice(start)
      .join('\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  })
  return 'WEBVTT\n\n' + converted.join('\n\n')
}

// ─── Storyboard VTT parser ─────────────────────────────────────────────────

interface ThumbCue {
  time: number
  url: string
  x: number
  y: number
  w: number
  h: number
}

function parseVttTime(s: string): number {
  const parts = s.split(':')
  if (parts.length === 3) {
    const [h, m, rest] = parts
    const [sec, ms] = rest.split('.')
    return Number(h) * 3600 + Number(m) * 60 + Number(sec) + Number(ms ?? '0') / 1000
  }
  if (parts.length === 2) {
    const [m, rest] = parts
    const [sec, ms] = rest.split('.')
    return Number(m) * 60 + Number(sec) + Number(ms ?? '0') / 1000
  }
  return 0
}

function parseStoryboardVtt(vtt: string, manifestUrl: string): ThumbCue[] {
  const cues: ThumbCue[] = []
  const blocks = vtt.replace(/\r\n/g, '\n').split('\n\n')
  for (const block of blocks) {
    const lines = block.split('\n')
    const timeLine = lines.find((l) => l.includes('-->'))
    if (!timeLine) continue
    const [startStr] = timeLine.split('-->')
    const start = parseVttTime(startStr.trim())
    if (!isFinite(start)) continue

    // Last line is the image reference
    const imgLine = lines[lines.length - 1].trim()
    if (!imgLine) continue

    // The image URL may be relative to the manifest URL
    const [urlPart, hash] = imgLine.split('#')
    let fullUrl: string
    try {
      fullUrl = new URL(urlPart, manifestUrl).href
    } catch {
      fullUrl = urlPart
    }

    let x = 0, y = 0, w = 160, h = 90
    if (hash && hash.startsWith('xywh=')) {
      const coords = hash.substring(5).split(',').map(Number)
      if (coords.length === 4) [x, y, w, h] = coords
    }

    cues.push({ time: start, url: fullUrl, x, y, w, h })
  }
  return cues.sort((a, b) => a.time - b.time)
}

// ─── Icons ────────────────────────────────────────────────────────────────

function PlayIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
}

function PauseIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
}

function Rewind({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" /></svg>
}

function FastForward({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
}

function VolumeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
}

function MuteIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
}

function FullscreenIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
}

function ExitFullscreenIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
}

function BackArrow({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 5l-7 7 7 7" /></svg>
}

function AudioIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
}

function CCIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z" /></svg>
}

function SpeedIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M20.38 8.57l-1.23 1.85a8 8 0 01-.22 7.58H5.07A8 8 0 0115.58 6.85l1.85-1.23A10 10 0 003.35 19a2 2 0 001.72 1h13.85a2 2 0 001.74-1 10 10 0 00-.27-10.44zm-9.79 6.84a2 2 0 002.83 0l5.66-8.49-8.49 5.66a2 2 0 000 2.83z" /></svg>
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z" />
    </svg>
  )
}

function PiPIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z" />
    </svg>
  )
}

function CastIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z" />
    </svg>
  )
}

function AirPlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 22h12l-6-6zM21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4v-2H3V5h18v12h-4v2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    </svg>
  )
}

function BrightnessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" />
    </svg>
  )
}
