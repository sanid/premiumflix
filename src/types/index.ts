// ─── Premiumize API Types ────────────────────────────────────────────────────

export interface PMItem {
  id: string
  name: string
  type?: string
  size?: number
  created_at?: number
  mime_type?: string
  link?: string
  stream_link?: string
  transcoded_link?: string
  acodec?: string
  vcodec?: string
  resx?: number
  resy?: number
  duration?: number
  bitrate?: number
}

export interface PMFolderListResponse {
  status: string
  content?: PMItem[]
  name?: string
  parent_id?: string
  folder_id?: string
  breadcrumbs?: Array<{ id?: string; name?: string; parent_id?: string }>
}

export interface PMItemDetailResponse {
  id?: string
  name?: string
  type?: string
  size?: number
  created_at?: number
  folder_id?: string
  acodec?: string
  vcodec?: string
  link?: string
  mime_type?: string
  resx?: number
  resy?: number
  duration?: number
  transcode_status?: string
  stream_link?: string
  bitrate?: number
}

export interface PMAccountInfoResponse {
  status: string
  customer_id?: string
  premium_until?: number
  limit_used?: number
  space_used?: number
}

export interface PMTransfer {
  id: string
  name?: string
  status?: string
  progress?: number
  message?: string
  file_id?: string
  folder_id?: string
}

export interface PMTransferListResponse {
  status: string
  transfers?: PMTransfer[]
}

// ─── TMDB Types ───────────────────────────────────────────────────────────────

export interface TMDBSearchResult {
  results: TMDBMovie[]
  total_results?: number
}

export interface TMDBMovie {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string
  backdrop_path?: string
  release_date?: string
  first_air_date?: string
  vote_average?: number
  vote_count?: number
  genre_ids?: number[]
  media_type?: string
  popularity?: number
}

export interface TMDBMovieDetail {
  id: number
  title?: string
  name?: string
  overview?: string
  poster_path?: string
  backdrop_path?: string
  release_date?: string
  first_air_date?: string
  vote_average?: number
  runtime?: number
  genres?: TMDBGenre[]
  tagline?: string
  status?: string
  number_of_seasons?: number
  number_of_episodes?: number
  seasons?: TMDBSeason[]
  imdb_id?: string
}

export interface TMDBGenre {
  id: number
  name: string
}

export interface TMDBSeason {
  id: number
  name?: string
  season_number: number
  episode_count?: number
  poster_path?: string
  overview?: string
  air_date?: string
}

export interface TMDBSeasonDetail {
  id: number
  name?: string
  season_number: number
  episodes?: TMDBEpisode[]
}

export interface TMDBEpisode {
  id: number
  name?: string
  overview?: string
  episode_number: number
  season_number: number
  air_date?: string
  still_path?: string
  vote_average?: number
  runtime?: number
}

export interface TMDBCredits {
  cast: TMDBCastMember[]
  crew: TMDBCrewMember[]
}

export interface TMDBCastMember {
  id: number
  name: string
  character?: string
  profile_path?: string
  order?: number
}

export interface TMDBCrewMember {
  id: number
  name: string
  job?: string
  department?: string
  profile_path?: string
}

export interface TMDBVideo {
  id: string
  key: string
  site: string
  type: string
  official?: boolean
  name?: string
}

export interface TMDBVideosResponse {
  results: TMDBVideo[]
}

export interface TMDBImageInfo {
  file_path: string
  iso_639_1?: string | null
  vote_average?: number
}

export interface TMDBImagesResponse {
  logos?: TMDBImageInfo[]
  posters?: TMDBImageInfo[]
  backdrops?: TMDBImageInfo[]
}

// ─── Media Domain Types ───────────────────────────────────────────────────────

export interface SubtitleTrack {
  id: string
  label: string       // e.g. "English", "French"
  language: string    // ISO 639-1 or "unknown"
  fileName: string
  directLink: string
}

export interface MediaFile {
  id: string
  name: string
  fileName: string
  size: number
  mimeType?: string
  streamLink?: string
  directLink?: string
  duration?: number
  resolution?: string
  videoCodec?: string
  audioCodec?: string
  language?: string
  premiumizeId: string
  episodeNumber?: number
  seasonNumber?: number
  subtitles?: SubtitleTrack[]
}

export interface Movie {
  id: string
  title: string
  year?: string
  files: MediaFile[]
  tmdbId?: number
  imdbId?: string
  tmdbDetail?: TMDBMovieDetail
  credits?: TMDBCredits
  trailerKey?: string
  logoPath?: string
  addedAt?: number
  cloudRemoved?: boolean
}

export interface TVShow {
  id: string
  title: string
  year?: string
  seasons: Season[]
  tmdbId?: number
  imdbId?: string
  tmdbDetail?: TMDBMovieDetail
  credits?: TMDBCredits
  trailerKey?: string
  logoPath?: string
  cloudRemoved?: boolean
}

export interface Season {
  id: string
  number: number
  name: string
  episodes: Episode[]
  tmdbSeason?: TMDBSeason
}

export interface Episode {
  id: string
  number: number
  name: string
  file: MediaFile
  tmdbEpisode?: TMDBEpisode
}

export interface ParsedMedia {
  title: string
  year?: string
  season?: number
  episode?: number
  type: 'movie' | 'tvshow' | 'unknown'
}

// ─── User Data Types ──────────────────────────────────────────────────────────

export interface WatchProgress {
  fileId: string
  position: number
  duration: number
  lastWatched: number
}

export interface ScanFolderSelection {
  id: string
  name: string
  kind: 'movies' | 'tvShows'
}

export type MediaType = 'movie' | 'show'

// Computed helpers
export function movieDisplayTitle(m: Movie): string {
  return m.tmdbDetail?.title ?? m.tmdbDetail?.name ?? m.title
}

export function showDisplayTitle(s: TVShow): string {
  return s.tmdbDetail?.title ?? s.tmdbDetail?.name ?? s.title
}

export function posterUrl(path?: string | null): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http')) return path
  return `https://image.tmdb.org/t/p/w500${path}`
}

export function backdropUrl(path?: string | null): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http')) return path
  return `https://image.tmdb.org/t/p/w1280${path}`
}

export function profileUrl(path?: string | null): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http')) return path
  return `https://image.tmdb.org/t/p/w185${path}`
}

export function stillUrl(path?: string | null): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http')) return path
  return `https://image.tmdb.org/t/p/w300${path}`
}

export function moviePosterUrl(m: Movie): string | undefined {
  return posterUrl(m.tmdbDetail?.poster_path)
}

export function movieBackdropUrl(m: Movie): string | undefined {
  return backdropUrl(m.tmdbDetail?.backdrop_path)
}

export function showPosterUrl(s: TVShow): string | undefined {
  return posterUrl(s.tmdbDetail?.poster_path)
}

export function showBackdropUrl(s: TVShow): string | undefined {
  return backdropUrl(s.tmdbDetail?.backdrop_path)
}

export function formatDuration(seconds?: number | null): string | undefined {
  if (!seconds || seconds <= 0) return undefined
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatRuntime(minutes?: number | null): string | undefined {
  if (!minutes || minutes <= 0) return undefined
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatFileSize(bytes: number): string {
  const gb = bytes / 1_073_741_824
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / 1_048_576
  return `${mb.toFixed(0)} MB`
}

export function movieMainFile(m: Movie): MediaFile | undefined {
  return m.files.reduce<MediaFile | undefined>((max, f) => {
    if (!max) return f
    return f.size > max.size ? f : max
  }, undefined)
}

export function isProgressFinished(p: WatchProgress): boolean {
  return p.duration > 0 && p.position / p.duration >= 0.9
}

export function hasProgress(p: WatchProgress): boolean {
  return p.position > 30 && !isProgressFinished(p)
}
