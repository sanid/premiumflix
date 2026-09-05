/**
 * Inline SVG icon set.
 *
 * Hand-rolled rather than pulled from an icon package so the app ships no extra
 * dependency and every glyph inherits `currentColor` and the surrounding font
 * size. Geometry follows the Lucide 24×24 grid (2px stroke, round caps/joins),
 * which matches the SVGs already inlined in Navbar and VideoPlayer.
 *
 * Size defaults to 1em so an icon lines up with the text it sits next to; pass
 * a Tailwind size class (`className="w-5 h-5"`) when it should be fixed.
 */

export interface IconProps {
  className?: string
  /** Stroke width on the 24×24 grid. */
  strokeWidth?: number
}

function Svg({ className = 'w-[1em] h-[1em]', strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={`inline-block shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

// ─── Media types ────────────────────────────────────────────────────────────

export const FilmIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="3.5" width="19" height="17" rx="2" />
    <path d="M7 3.5v17M17 3.5v17M2.5 12h19M2.5 7.75h4.5M2.5 16.25h4.5M17 7.75h4.5M17 16.25h4.5" />
  </Svg>
)

export const TvIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="m17 2-5 5-5-5" />
  </Svg>
)

// ─── Rating ─────────────────────────────────────────────────────────────────

export const StarIcon = ({ className = 'w-[1em] h-[1em]' }: IconProps) => (
  <svg className={`inline-block shrink-0 ${className}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="m12 2.6 2.9 5.88 6.49.95-4.7 4.58 1.11 6.46L12 17.42 6.2 20.47l1.1-6.46-4.69-4.58 6.49-.95z" />
  </svg>
)

export const HeartIcon = ({ className = 'w-[1em] h-[1em]' }: IconProps) => (
  <svg className={`inline-block shrink-0 ${className}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 20.7 3.9 12.6a4.9 4.9 0 0 1 0-7 4.9 4.9 0 0 1 7 0l1.1 1.1 1.1-1.1a4.9 4.9 0 0 1 7 0 4.9 4.9 0 0 1 0 7z" />
  </svg>
)

// ─── Status ─────────────────────────────────────────────────────────────────

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="m4.5 12.5 5 5 10-11" /></Svg>
)

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9.25" /><path d="m8 12.2 2.8 2.8L16 9.5" /></Svg>
)

export const XIcon = (p: IconProps) => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
)

export const XCircleIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9.25" /><path d="m15 9-6 6M9 9l6 6" /></Svg>
)

export const AlertTriangleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4.5M12 17.2h.01" />
  </Svg>
)

export const SparklesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m10 3 1.9 4.6L16.5 9.5l-4.6 1.9L10 16l-1.9-4.6L3.5 9.5l4.6-1.9z" />
    <path d="M18 3v4M20 5h-4M18.5 16v3M20 17.5h-3" />
  </Svg>
)

// ─── Cloud & transfers ──────────────────────────────────────────────────────

export const CloudIcon = (p: IconProps) => (
  <Svg {...p}><path d="M17.5 19H7a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19 11.4a4 4 0 0 1-1.5 7.6Z" /></Svg>
)

export const CloudOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.8 5.8A4.5 4.5 0 0 0 7 19h10.5a4 4 0 0 0 3.3-1.8M9.4 5.6A6 6 0 0 1 19 11.4" />
    <path d="M2.5 2.5 21.5 21.5" />
  </Svg>
)

export const CloudDownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.9 15.1A4.5 4.5 0 0 1 7.9 6.2 6 6 0 0 1 19 7.5a4 4 0 0 1 1.4 7.4" />
    <path d="M12 12v8m0 0-3-3m3 3 3-3" />
  </Svg>
)

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 19.5h16" /></Svg>
)

export const InboxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 13h-5l-1.5 3h-5L8 13H3" />
    <path d="M6.4 4.6h11.2a2 2 0 0 1 1.8 1.1l2.4 5.1a2 2 0 0 1 .2.85V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.35a2 2 0 0 1 .2-.85l2.4-5.1a2 2 0 0 1 1.8-1.1Z" />
  </Svg>
)

// ─── Objects ────────────────────────────────────────────────────────────────

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 20h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7.5L10 4.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2Z" /></Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6.5h17M9 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
    <path d="M18.5 6.5 17.7 19a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 6.5" />
    <path d="M10 10.5v6M14 10.5v6" />
  </Svg>
)

export const LibraryIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 4v16M8 4v16M12.5 4.5l4.8 1.3a1 1 0 0 1 .7 1.2l-3.3 12.3a1 1 0 0 1-1.2.7L12.5 20" /><path d="M12 4.5v15" /></Svg>
)

export const ClipboardListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3.5h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1Z" />
    <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    <path d="M8.5 11.5h7M8.5 15.5h4.5" />
  </Svg>
)

export const BarChartIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>
)

export const PackageIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 7.8v8.4a2 2 0 0 1-1 1.74l-6.5 3.7a2 2 0 0 1-2 0l-6.5-3.7a2 2 0 0 1-1-1.74V7.8a2 2 0 0 1 1-1.74l6.5-3.7a2 2 0 0 1 2 0l6.5 3.7a2 2 0 0 1 1 1.74Z" />
    <path d="m3.8 6.8 8.2 4.7 8.2-4.7M12 21v-9.5" />
  </Svg>
)

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9.25" /><path d="M2.9 9h18.2M2.9 15h18.2" /><path d="M12 2.75c-4.5 5.2-4.5 13.3 0 18.5 4.5-5.2 4.5-13.3 0-18.5Z" /></Svg>
)

export const CaptionsIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M10.2 10.5a2.4 2.4 0 1 0 0 3M17.8 10.5a2.4 2.4 0 1 0 0 3" />
  </Svg>
)

export const ShuffleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 3.5 20.5 7 17 10.5M17 13.5 20.5 17 17 20.5" />
    <path d="M20.5 7h-3.3a4 4 0 0 0-3.3 1.8l-3.4 5.4A4 4 0 0 1 7.2 17H3.5M3.5 7h3.7a4 4 0 0 1 3.3 1.8l.4.6M20.5 17h-3.3a4 4 0 0 1-3.3-1.8l-.4-.6" />
  </Svg>
)

// ─── Controls ───────────────────────────────────────────────────────────────

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7.25" /><path d="m16.5 16.5 4.5 4.5" /></Svg>
)

export const SquareIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /></Svg>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5" /></Svg>
)

export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 20V4m0 0L6.5 9.5M12 4l5.5 5.5" /></Svg>
)

export const ArrowDownIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 4v16m0 0 5.5-5.5M12 20l-5.5-5.5" /></Svg>
)

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}><path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" /><path d="M17.6 3.6a2 2 0 0 1 2.8 2.83L11.83 15H9v-2.83z" /></Svg>
)

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 4v5h5M20 20v-5h-5" /><path d="M19.9 9A8 8 0 0 0 5.6 6.6L4 9M4.1 15a8 8 0 0 0 14.3 2.4L20 15" /></Svg>
)

export const CloudTrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 12.5a4 4 0 0 1 .4-8A5.5 5.5 0 0 1 18.6 6a3.6 3.6 0 0 1 1 6.9" />
    <path d="M7.5 14.5h9M10 14.5v-1.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.2M15.5 14.5l-.5 5.4a1.5 1.5 0 0 1-1.5 1.35h-3a1.5 1.5 0 0 1-1.5-1.35l-.5-5.4" />
  </Svg>
)

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.33 4.32c.42-1.76 2.92-1.76 3.34 0a1.72 1.72 0 0 0 2.58 1.07c1.54-.94 3.3.83 2.37 2.37a1.72 1.72 0 0 0 1.06 2.57c1.76.43 1.76 2.93 0 3.35a1.72 1.72 0 0 0-1.06 2.58c.94 1.54-.83 3.3-2.37 2.37a1.72 1.72 0 0 0-2.58 1.06c-.42 1.76-2.92 1.76-3.34 0a1.72 1.72 0 0 0-2.58-1.06c-1.54.93-3.3-.83-2.37-2.37a1.72 1.72 0 0 0-1.06-2.58c-1.76-.42-1.76-2.92 0-3.35a1.72 1.72 0 0 0 1.06-2.57c-.93-1.54.83-3.31 2.37-2.37a1.72 1.72 0 0 0 2.58-1.07Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>
)

export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5" />
    <path d="M13.7 19.5a2 2 0 0 1-3.4 0" />
  </Svg>
)
