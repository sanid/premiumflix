import { useEffect, useRef, useState, useCallback } from 'react'
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

/**
 * Video player using Premiumize's CDN77 `m-play` web component.
 *
 * This is the same player Premiumize uses on their own site. It bundles:
 * - castable-hls-video (HLS with Chromecast support)
 * - media-chrome controls (play, seek, volume, quality, audio tracks,
 *   subtitles, speed, fullscreen, AirPlay, PiP)
 *
 * Audio tracks and subtitles are auto-detected from the HLS manifest.
 * No need for hls.js — everything is handled natively.
 */
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
  const containerRef = useRef<HTMLDivElement>(null)
  const playerElRef = useRef<any>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showOverlay, setShowOverlay] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Helper: get the <video> element from m-play's shadow DOM ───────────
  function getVideo(): HTMLVideoElement | null {
    const player = playerElRef.current
    if (!player?.shadowRoot) return null
    const cv = player.shadowRoot.querySelector('castable-hls-video')
    if (!cv?.shadowRoot) return null
    return cv.shadowRoot.querySelector('video') as HTMLVideoElement | null
  }

  // ─── Create m-play element ──────────────────────────────────────────────

  useEffect(() => {
    if (!src || !containerRef.current) return

    let cancelled = false

    async function init() {
      // Wait for m-play custom element to be registered
      try {
        await Promise.race([
          customElements.whenDefined('m-play'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000)),
        ])
      } catch {
        if (!cancelled) setError('Player failed to load. Please refresh the page.')
        return
      }

      if (cancelled) return

      const player = document.createElement('m-play') as any
      player.setAttribute('src', src)
      player.style.cssText = 'width:100%;height:100%;display:block;'

      // Pass external subtitle tracks if available
      if (subtitles && subtitles.length > 0) {
        // m-play accepts a `tracks` attribute as JSON array
        // For now we rely on HLS embedded subtitles (CDN77 includes them)
        // External subs can be added later via the tracks attribute
      }

      containerRef.current!.appendChild(player)
      playerElRef.current = player

      // ── Wait for <video> element inside shadow DOM ──
      let video: HTMLVideoElement | null = null
      for (let i = 0; i < 80; i++) {
        video = getVideo()
        if (video) break
        await new Promise((r) => setTimeout(r, 100))
        if (cancelled) return
      }

      if (!video || cancelled) {
        if (!cancelled) setError('Could not initialise video element.')
        return
      }

      // ── Video event listeners ──
      const onLoaded = () => {
        setLoading(false)
        // Resume from saved position
        if (initialPosition > 30 && video!.duration > 0 && initialPosition < video!.duration * 0.9) {
          video!.currentTime = initialPosition
        }
        video!.play().catch(() => {})
      }

      const onCanPlay = () => setLoading(false)
      const handleEnded = () => onEnded?.()
      const onWaiting = () => setLoading(true)

      video.addEventListener('loadedmetadata', onLoaded)
      video.addEventListener('canplay', onCanPlay)
      video.addEventListener('ended', handleEnded)
      video.addEventListener('waiting', onWaiting)

      // If metadata is already loaded (cached)
      if (video.readyState >= 1) {
        onLoaded()
      }

      // Cleanup function stored for later
      ;(player as any).__cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('ended', handleEnded)
        video.removeEventListener('waiting', onWaiting)
      }
    }

    setLoading(true)
    setError(null)
    init()

    return () => {
      cancelled = true
      const player = playerElRef.current
      if (player) {
        player.__cleanup?.()
        player.remove()
        playerElRef.current = null
      }
    }
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Progress saving ────────────────────────────────────────────────────

  useEffect(() => {
    if (!onProgress) return
    progressTimer.current = setInterval(() => {
      const video = getVideo()
      if (video && !video.paused && video.duration > 0) {
        onProgress(video.currentTime, video.duration)
      }
    }, 10_000)
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current)
    }
  }, [onProgress])

  // ─── Save progress on unmount / navigate away ──────────────────────────

  useEffect(() => {
    return () => {
      const video = getVideo()
      if (video && onProgress && video.duration > 0) {
        onProgress(video.currentTime, video.duration)
      }
    }
  }, [onProgress])

  // ─── Overlay auto-hide ──────────────────────────────────────────────────

  const showOverlayTemporarily = useCallback(() => {
    setShowOverlay(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowOverlay(false), 3000)
  }, [])

  useEffect(() => {
    hideTimer.current = setTimeout(() => setShowOverlay(false), 3000)
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const video = getVideo()
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          if (video) video.paused ? video.play() : video.pause()
          showOverlayTemporarily()
          break
        case 'ArrowRight':
          if (video) video.currentTime = Math.min(video.currentTime + 10, video.duration)
          showOverlayTemporarily()
          break
        case 'ArrowLeft':
          if (video) video.currentTime = Math.max(video.currentTime - 10, 0)
          showOverlayTemporarily()
          break
        case 'ArrowUp':
          if (video) { video.volume = Math.min(video.volume + 0.1, 1) }
          showOverlayTemporarily()
          break
        case 'ArrowDown':
          if (video) { video.volume = Math.max(video.volume - 0.1, 0) }
          showOverlayTemporarily()
          break
        case 'f': {
          // Toggle fullscreen on our container (so overlay is included)
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            containerRef.current?.requestFullscreen()
          }
          break
        }
        case 'm': {
          if (video) video.muted = !video.muted
          break
        }
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            onBack?.()
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, showOverlayTemporarily])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black relative"
      style={{ cursor: showOverlay ? 'default' : 'none' }}
      onMouseMove={showOverlayTemporarily}
    >
      {/* m-play element is inserted here dynamically */}

      {/* Loading spinner */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 z-20">
          <div className="text-premiumflix-red text-5xl">⚠</div>
          <p className="text-white text-center max-w-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-black px-6 py-2 rounded font-semibold hover:bg-white/80"
          >
            Refresh
          </button>
          <button
            onClick={() => onBack?.()}
            className="text-white/60 hover:text-white text-sm underline"
          >
            Go back
          </button>
        </div>
      )}

      {/* Title / back-button overlay — auto-hides, doesn't block player clicks */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 transition-opacity duration-300 pointer-events-none ${
          showOverlay ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="bg-gradient-to-b from-black/80 to-transparent pt-4 pb-10 px-4 sm:px-8 flex items-center gap-4 pointer-events-auto">
          <button
            onClick={(e) => { e.stopPropagation(); onBack?.() }}
            className="text-white hover:text-white/70 transition-colors p-1"
            title="Back (Escape)"
          >
            <BackArrow className="w-6 h-6" />
          </button>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm sm:text-base truncate">{title}</p>
            {subtitle && <p className="text-white/60 text-xs truncate">{subtitle}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BackArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  )
}
