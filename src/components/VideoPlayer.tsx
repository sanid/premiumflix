import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import type { SubtitleTrack } from '../types'

interface VideoPlayerProps {
  src: string
  title: string
  subtitle?: string
  subtitles?: SubtitleTrack[]
  initialPosition?: number
  onProgress?: (position: number, duration: number) => void
  onBack?: () => void
  onEnded?: () => void
}

export function VideoPlayer({
  src,
  title,
  subtitle,
  subtitles,
  initialPosition = 0,
  onProgress,
  onBack,
  onEnded,
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

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[Player] Fatal HLS error:', data.type, data.details)
          setError('Playback failed. The stream may have expired — try going back and playing again.')
        }
      })

      // Detect audio + subtitle tracks from manifest
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls.audioTracks.length > 0) {
          const tracks = hls.audioTracks.map((t, i) => ({
            id: i,
            name: t.name ?? t.lang ?? `Track ${i + 1}`,
            lang: t.lang ?? '',
          }))
          setAudioTracks(tracks)
          setActiveAudioTrack(hls.audioTrack)
          console.log('[Player] Audio tracks:', tracks.length, tracks.map(t => t.lang || t.name))
        }
        if (hls.subtitleTracks.length > 0) {
          const tracks = hls.subtitleTracks.map((t, i) => ({
            id: i,
            name: t.name ?? t.lang ?? `Track ${i + 1}`,
            lang: t.lang ?? '',
          }))
          setHlsSubTracks(tracks)
          console.log('[Player] Subtitle tracks:', tracks.length, tracks.map(t => t.lang || t.name))
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
        console.log('[Player] Subtitle tracks updated:', tracks.length)
      })

      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, () => {
        setActiveHlsSub(hls.subtitleTrack)
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
    }
  }, [src])

  // ─── Subtitle visibility enforcement ────────────────────────────────────────
  //
  // HLS subtitle cues need the textTrack.mode set to 'showing' after the
  // track is loaded. We poll for this because the track may load late.

  useEffect(() => {
    if (activeHlsSub < 0 && !activeSubtitle) return

    const interval = setInterval(() => {
      const video = videoRef.current
      if (!video) return
      for (let i = 0; i < video.textTracks.length; i++) {
        const tt = video.textTracks[i]
        if (tt.kind === 'subtitles' || tt.kind === 'captions') {
          if (activeHlsSub >= 0 || activeSubtitle) {
            tt.mode = 'showing'
          }
        }
      }
    }, 500)

    return () => clearInterval(interval)
  }, [activeHlsSub, activeSubtitle])

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
      onEnded?.()
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

  // ─── Control visibility ───────────────────────────────────────────────────

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying) setShowControls(true)
    else {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000)
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [isPlaying])

  // ─── Fullscreen ──────────────────────────────────────────────────────────

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

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
        case 'Escape':
          if (isFullscreen) document.exitFullscreen()
          else onBack?.()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen, showControlsTemporarily, onBack])

  // ─── Seek bar ────────────────────────────────────────────────────────────

  function handleSeekBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const bar = seekBarRef.current
    const video = videoRef.current
    if (!bar || !video) return
    const rect = bar.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    video.currentTime = fraction * video.duration
    setCurrentTime(video.currentTime)
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

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none"
      style={{ cursor: showControls ? 'default' : 'none' }}
      onMouseMove={showControlsTemporarily}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        preload="auto"
      />

      {/* Loading spinner */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin" />
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
        <div className="bg-gradient-to-b from-black/80 to-transparent pt-4 pb-8 px-4 sm:px-8 flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-white hover:text-white/70 transition-colors p-1"
          >
            <BackArrow className="w-6 h-6" />
          </button>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm sm:text-base truncate">{title}</p>
            {subtitle && <p className="text-white/60 text-xs truncate">{subtitle}</p>}
          </div>
        </div>

        {/* Center play button */}
        <div className="flex items-center justify-center gap-8 pointer-events-auto">
          <button onClick={() => skip(-10)} className="text-white hover:scale-110 transition-transform">
            <Rewind className="w-10 h-10" />
          </button>
          <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform">
            {isPlaying ? <PauseIcon className="w-16 h-16" /> : <PlayIcon className="w-16 h-16" />}
          </button>
          <button onClick={() => skip(10)} className="text-white hover:scale-110 transition-transform">
            <FastForward className="w-10 h-10" />
          </button>
        </div>

        {/* Bottom controls */}
        <div
          className="bg-gradient-to-t from-black/90 to-transparent pt-8 pb-4 px-4 sm:px-8"
          onMouseMove={(e) => e.stopPropagation()}
        >
          {/* Seek bar */}
          <div
            ref={seekBarRef}
            className="relative h-1 bg-white/20 rounded-full cursor-pointer mb-3 group/seek hover:h-3 transition-all"
            onClick={handleSeekBarClick}
          >
            <div
              className="absolute top-0 left-0 h-full bg-white/30 rounded-full"
              style={{ width: `${bufferedPct}%` }}
            />
            <div
              className="absolute top-0 left-0 h-full bg-premiumflix-red rounded-full"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-premiumflix-red rounded-full opacity-0 group-hover/seek:opacity-100 transition-opacity shadow-lg"
              style={{ left: `${progressPct}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>

          {/* Bottom row */}
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-white hover:text-white/70 transition-colors">
              {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
            </button>

            <button onClick={() => skip(-10)} className="text-white hover:text-white/70 transition-colors hidden sm:block">
              <Rewind className="w-5 h-5" />
            </button>
            <button onClick={() => skip(10)} className="text-white hover:text-white/70 transition-colors hidden sm:block">
              <FastForward className="w-5 h-5" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1 group/vol">
              <button onClick={toggleMute} className="text-white hover:text-white/70 transition-colors">
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

            {/* Time */}
            <span className="text-white text-xs sm:text-sm tabular-nums ml-1">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-2">
              {/* Subtitles */}
              {(hlsSubTracks.length > 0 || (subtitles && subtitles.length > 0)) && (
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowSubMenu((v) => !v); setShowLangMenu(false) }}
                    className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border transition-colors ${
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
                      className="absolute bottom-full mb-2 right-0 bg-black/90 border border-white/20 rounded-lg overflow-hidden min-w-[130px] shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setActiveSubtitle(null)
                          if (hlsRef.current) hlsRef.current.subtitleTrack = -1
                          const v = videoRef.current
                          if (v) {
                            for (let i = 0; i < v.textTracks.length; i++) {
                              v.textTracks[i].mode = 'hidden'
                            }
                          }
                          setActiveHlsSub(-1)
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
                    </div>
                  )}
                </div>
              )}

              {/* Audio language */}
              {audioTracks.length >= 1 && (
                <div className="relative">
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
                      className="absolute bottom-full mb-2 right-0 bg-black/90 border border-white/20 rounded-lg overflow-hidden min-w-[120px] shadow-xl"
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

              {/* Fullscreen */}
              <button onClick={toggleFullscreen} className="text-white hover:text-white/70 transition-colors">
                {isFullscreen ? <ExitFullscreenIcon className="w-5 h-5" /> : <FullscreenIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
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
