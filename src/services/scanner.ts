/**
 * Library scanner: mirrors the iOS LibraryViewModel scanning logic.
 * Traverses Premiumize folder hierarchy, classifies items as movies or TV shows,
 * and enriches them with TMDB metadata.
 */
import type { Movie, TVShow, Season, Episode, MediaFile, SubtitleTrack, PMItem, ScanFolderSelection } from '../types'
import { listFolder } from './premiumize'
import { bestLogoPath, bestTrailerKey, movieDetail as tmdbMovieDetail, tvDetail as tmdbTVDetail } from './tmdb'
import {
  isTMDB,
  searchMovieBest,
  searchTVBest,
  getVideos,
  getImages,
  getSeasonDetail as metaSeasonDetail,
} from './metadata'

// ─── Filename / folder parsing ────────────────────────────────────────────────

const VIDEO_EXTS = ['mkv', 'mp4', 'avi', 'm4v', 'mov', 'wmv', 'ts', 'flv', 'webm', 'mpg', 'mpeg']
const SUBTITLE_EXTS = new Set(['srt', 'vtt', 'ass', 'ssa', 'sub'])
const NOISE_TAGS = [
  '1080p', '1080i', '720p', '2160p', '4k', 'uhd', 'bluray', 'bdrip', 'brrip',
  'web-dl', 'webdl', 'webrip', 'hdtv', 'hdrip', 'dvdrip', 'x264', 'x265', 'hevc',
  'h264', 'h265', 'aac', 'dts', 'atmos', 'remux', 'hdr', '10bit', 'proper',
  'repack', 'extended', 'unrated', 'directors cut', 'theatrical', 'retail',
  'french', 'german', 'spanish', 'italian', 'japanese', 'korean', 'dubbed',
  'subbed', 'subs', 'multi', 'nf', 'amzn', 'dsnp', 'hmax', 'hulu', 'yts',
  'yify', 'rarbg', 'fgt', 'etrg', 'evo', 'tigole',
]

function isVideo(item: PMItem): boolean {
  if (item.mime_type?.startsWith('video/')) return true
  const ext = item.name.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTS.includes(ext)
}

function isSubtitle(item: PMItem): boolean {
  const ext = item.name.split('.').pop()?.toLowerCase() ?? ''
  return SUBTITLE_EXTS.has(ext)
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', eng: 'English', english: 'English',
  fr: 'French', fra: 'French', fre: 'French', french: 'French',
  de: 'German', deu: 'German', ger: 'German', german: 'German',
  es: 'Spanish', spa: 'Spanish', spanish: 'Spanish',
  it: 'Italian', ita: 'Italian', italian: 'Italian',
  pt: 'Portuguese', por: 'Portuguese', portuguese: 'Portuguese',
  nl: 'Dutch', nld: 'Dutch', dutch: 'Dutch',
  ru: 'Russian', rus: 'Russian', russian: 'Russian',
  ja: 'Japanese', jpn: 'Japanese', japanese: 'Japanese',
  ko: 'Korean', kor: 'Korean', korean: 'Korean',
  zh: 'Chinese', zho: 'Chinese', chi: 'Chinese', chinese: 'Chinese',
  ar: 'Arabic', ara: 'Arabic', arabic: 'Arabic',
  hi: 'Hindi', hin: 'Hindi', hindi: 'Hindi',
  tr: 'Turkish', tur: 'Turkish', turkish: 'Turkish',
  pl: 'Polish', pol: 'Polish', polish: 'Polish',
  sv: 'Swedish', swe: 'Swedish', swedish: 'Swedish',
  no: 'Norwegian', nor: 'Norwegian', norwegian: 'Norwegian',
  da: 'Danish', dan: 'Danish', danish: 'Danish',
  fi: 'Finnish', fin: 'Finnish', finnish: 'Finnish',
}

function parseSubtitleLabel(fileName: string): { label: string; language: string } {
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase()
  const parts = base.split(/[._\-\s]+/)
  // Scan last few parts for a known language code
  for (let i = parts.length - 1; i >= Math.max(0, parts.length - 3); i--) {
    const langName = LANG_NAMES[parts[i]]
    if (langName) return { label: langName, language: parts[i].slice(0, 2) }
  }
  return { label: 'Subtitles', language: 'unknown' }
}

function attachSubtitles(mediaFiles: MediaFile[], subtitleItems: PMItem[]): void {
  if (!subtitleItems.length || !mediaFiles.length) return
  const tracks = subtitleItems.flatMap((s): SubtitleTrack[] => {
    if (!s.link) return []
    const { label, language } = parseSubtitleLabel(s.name)
    return [{ id: s.id, label, language, fileName: s.name, directLink: s.link }]
  })
  if (!tracks.length) return

  if (mediaFiles.length === 1) {
    mediaFiles[0].subtitles = tracks
    return
  }

  // Multiple videos — match each subtitle to its video by base filename
  for (const video of mediaFiles) {
    const videoBase = video.fileName.replace(/\.[^.]+$/, '').toLowerCase()
    const matched = tracks.filter((t) => {
      const subBase = t.fileName.replace(/\.[^.]+$/, '').toLowerCase()
      const subCore = subBase.replace(/\.[a-z]{2,3}$/, '') // strip potential lang suffix
      return subCore === videoBase || subBase === videoBase || subBase.startsWith(videoBase + '.')
    })
    if (matched.length > 0) video.subtitles = matched
  }
}

function extractYear(text: string): string | undefined {
  const matches = [...text.matchAll(/(?:^|\s|\()(\d{4})(?:\s|\)|$)/g)]
  for (const m of matches) {
    const y = parseInt(m[1])
    if (y >= 1920 && y <= 2030) return m[1]
  }
  return undefined
}

function cleanTitle(raw: string): string {
  let s = raw.replace(/\./g, ' ').replace(/_/g, ' ').replace(/-/g, ' ')
  // Remove brackets and their contents
  s = s.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')
  // Remove any remaining stray brackets
  s = s.replace(/[()[\]{}]/g, '')
  // Remove noise tags
  for (const tag of NOISE_TAGS) {
    s = s.replace(new RegExp(`\\b${tag}\\b`, 'gi'), '')
  }
  // Remove year
  s = s.replace(/\b(19|20)\d{2}\b/g, '')
  // Remove file extensions
  for (const ext of VIDEO_EXTS) {
    s = s.replace(new RegExp(`\\.${ext}$`, 'i'), '').replace(new RegExp(` ${ext}$`, 'i'), '')
  }
  // Trailing dashes
  s = s.replace(/\s*[-–—]\s*$/, '')
  return s.replace(/\s+/g, ' ').trim()
}

function parseSeasonEpisode(filename: string): { season?: number; episode?: number; type: 'movie' | 'tvshow' } {
  const clean = filename.replace(/\./g, ' ').replace(/_/g, ' ')
  // S##E## pattern
  const seMatch = clean.match(/[Ss](\d{1,2})[Ee](\d{1,3})/)
  if (seMatch) return { season: parseInt(seMatch[1]), episode: parseInt(seMatch[2]), type: 'tvshow' }
  // 1x05 pattern
  const altMatch = clean.match(/(\d{1,2})[xX](\d{1,3})/)
  if (altMatch) return { season: parseInt(altMatch[1]), episode: parseInt(altMatch[2]), type: 'tvshow' }
  return { type: 'movie' }
}

function parseFilename(filename: string): { title: string; year?: string; season?: number; episode?: number } {
  const { season, episode, type } = parseSeasonEpisode(filename)
  const clean = filename.replace(/\./g, ' ').replace(/_/g, ' ').replace(/-/g, ' ')

  if (type === 'tvshow') {
    // Title is everything before the SxxExx pattern
    const titlePart = clean.replace(/[Ss]\d{1,2}[Ee]\d{1,3}.*/i, '').replace(/\d{1,2}[xX]\d{1,3}.*/i, '')
    return { title: cleanTitle(titlePart), year: extractYear(clean), season, episode }
  }

  const year = extractYear(clean)
  let title = clean
  if (year) {
    const idx = title.indexOf(year)
    if (idx > 0) title = title.slice(0, idx)
  }
  return { title: cleanTitle(title), year }
}

function parseSeasonFromFolderName(name: string): number | undefined {
  const patterns = [
    /[Ss]eason\s*(\d{1,2})/,
    /[Ss]taffel\s*(\d{1,2})/,
    /[Ss]aison\s*(\d{1,2})/,
    /[Tt]emporada\s*(\d{1,2})/,
    /[Ss]erie[s]?\s*(\d{1,2})/,
    /[Ss](\d{1,2})(?:\s|$)/,
  ]
  for (const p of patterns) {
    const m = name.match(p)
    if (m) return parseInt(m[1])
  }
  // Bare number
  const trimmed = name.trim()
  const num = parseInt(trimmed)
  if (!isNaN(num) && num >= 1 && num <= 50 && String(num) === trimmed) return num
  return undefined
}

function cleanFolderTitle(name: string): string {
  let s = cleanTitle(name)
  // Remove season references
  const seasonPats = [
    /\bseason\s*\d+\b/gi, /\bstaffel\s*\d+\b/gi, /\bsaison\s*\d+\b/gi,
    /\btemporada\s*\d+\b/gi, /\bseries?\s*\d+\b/gi, /\bs\d{1,2}\b/gi,
    /\bs\d{1,2}e\d{1,3}\b/gi, /\bcomplete\s*(?:series|season|collection)?\b/gi,
    /\b(?:all|full)\s*seasons?\b/gi, /\bseasons?\s*\d+\s*(?:-|to|&|and)\s*\d+\b/gi,
  ]
  for (const p of seasonPats) s = s.replace(p, '')
  return s.replace(/\s+/g, ' ').replace(/^[-.\s]+|[-.\s]+$/g, '').trim() || name
}

function makeMediaFile(item: PMItem, season?: number, episode?: number): MediaFile {
  const resx = typeof item.resx === 'number' ? item.resx : undefined
  const resy = typeof item.resy === 'number' ? item.resy : undefined
  return {
    id: item.id,
    name: item.name,
    fileName: item.name,
    size: item.size ?? 0,
    mimeType: item.mime_type,
    streamLink: item.stream_link,
    directLink: item.link,
    duration: item.duration,
    resolution: resx && resy ? `${resx}x${resy}` : undefined,
    videoCodec: item.vcodec,
    audioCodec: item.acodec,
    premiumizeId: item.id,
    seasonNumber: season,
    episodeNumber: episode,
  }
}

// ─── Scan state ───────────────────────────────────────────────────────────────

export type ScanProgress = {
  status: string
  moviesFound: number
  showsFound: number
  metadataFetched: number
  metadataTotal: number
}

type ProgressCallback = (p: ScanProgress) => void

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanLibrary(
  onProgress: ProgressCallback,
  customRoots?: ScanFolderSelection[],
): Promise<{ movies: Movie[]; tvShows: TVShow[] }> {
  const progress: ScanProgress = {
    status: 'Scanning your cloud...',
    moviesFound: 0,
    showsFound: 0,
    metadataFetched: 0,
    metadataTotal: 0,
  }
  const tick = () => onProgress({ ...progress })

  // Resolve scan roots
  let roots: ScanFolderSelection[]
  if (customRoots && customRoots.length > 0) {
    roots = customRoots
  } else {
    roots = await autoDetectRoots()
  }

  const movieList: Movie[] = []
  const showDict: Map<string, TVShow> = new Map()

  for (const root of roots) {
    progress.status = `Scanning ${root.name}...`
    tick()
    const folderData = await listFolder(root.id)
    const contents = folderData.content ?? []

    for (const item of contents) {
      if (item.type === 'folder') {
        if (root.kind === 'tvShows') {
          await processFolder(item, movieList, showDict, { forceTV: true }, progress, tick)
        } else {
          await processFolder(item, movieList, showDict, { forceMovie: true }, progress, tick)
        }
      } else if (isVideo(item) && root.kind !== 'tvShows') {
        const parsed = parseFilename(item.name)
        const file = makeMediaFile(item)
        movieList.push({
          id: item.id,
          title: parsed.title || cleanFolderTitle(item.name),
          year: parsed.year,
          files: [file],
          addedAt: item.created_at ? item.created_at * 1000 : undefined,
        })
        progress.moviesFound++
        tick()
      }
    }
  }

  // Fetch TMDB metadata with concurrency limit
  progress.status = 'Fetching metadata...'
  progress.metadataTotal = movieList.length + showDict.size
  tick()

  await fetchAllMetadata(movieList, showDict, progress, tick)

  return { movies: movieList, tvShows: Array.from(showDict.values()) }
}

async function autoDetectRoots(): Promise<ScanFolderSelection[]> {
  const MOVIE_NAMES = new Set(['Movies', 'Movie', 'Filme', 'Film', 'Films', 'Películas'])
  const SERIES_NAMES = new Set(['Series', 'TV Shows', 'TV', 'Shows', 'Serien', 'Serie', 'Serier', 'TV Series'])

  const root = await listFolder()
  const result: ScanFolderSelection[] = []
  for (const item of root.content ?? []) {
    if (item.type !== 'folder') continue
    if (MOVIE_NAMES.has(item.name)) result.push({ id: item.id, name: item.name, kind: 'movies' })
    else if (SERIES_NAMES.has(item.name)) result.push({ id: item.id, name: item.name, kind: 'tvShows' })
  }
  return result
}

const EXTRAS_FOLDERS = new Set([
  'extras', 'bonus', 'featurettes', 'behind the scenes', 'deleted scenes',
  'interviews', 'trailers', 'behind-the-scenes', 'specials', 'short films', 'making of',
])

async function processFolder(
  item: PMItem,
  movies: Movie[],
  shows: Map<string, TVShow>,
  opts: { forceTV?: boolean; forceMovie?: boolean },
  progress: ScanProgress,
  tick: () => void,
): Promise<void> {
  try {
    const folderData = await listFolder(item.id)
    const contents = folderData.content ?? []
    const videoFiles = contents.filter(isVideo)
    const subFolders = contents.filter((c) => c.type === 'folder')
    const subtitleItems = contents.filter(isSubtitle)

    const hasSeasonFolders = subFolders.some((s) => parseSeasonFromFolderName(s.name) !== undefined)
    const hasEpisodes = videoFiles.some((f) => parseSeasonEpisode(f.name).type === 'tvshow')

    if (opts.forceTV || hasSeasonFolders || (hasEpisodes && videoFiles.length > 1)) {
      // TV Show
      let showTitle = cleanFolderTitle(item.name)
      const year = extractYear(item.name)
      let parsedTmdbId: number | undefined

      // Check for "{tmdbId} - {title}" prefix
      const dashMatch = item.name.match(/^(\d+)\s+-\s+(.+)$/)
      if (dashMatch) {
        parsedTmdbId = parseInt(dashMatch[1])
        showTitle = dashMatch[2].replace(/\s+S\d{1,2}$/i, '').trim()
      }

      const showKey = showTitle.toLowerCase()
      if (!shows.has(showKey)) {
        shows.set(showKey, {
          id: item.id,
          title: showTitle,
          year,
          seasons: [],
          tmdbId: parsedTmdbId,
        })
        progress.showsFound++
        tick()
      } else if (parsedTmdbId && !shows.get(showKey)!.tmdbId) {
        shows.get(showKey)!.tmdbId = parsedTmdbId
      }

      // Process season folders
      for (const sub of subFolders) {
        const sNum = parseSeasonFromFolderName(sub.name)
        if (sNum !== undefined) {
          await processSeasonFolder(sub, sNum, showKey, shows)
        }
      }

      // Loose episode files in show root
      const looseEpFiles: Array<{ mediaFile: MediaFile; pmFile: PMItem; s: number; e: number }> = []
      let autoEp = 1
      for (const file of videoFiles) {
        const parsed = parseSeasonEpisode(file.name)
        const s = parsed.season ?? 1
        const e = parsed.episode ?? autoEp++
        looseEpFiles.push({ mediaFile: makeMediaFile(file, s, e), pmFile: file, s, e })
      }
      attachSubtitles(looseEpFiles.map((f) => f.mediaFile), subtitleItems)
      for (const { mediaFile, pmFile, s, e } of looseEpFiles) {
        addEpisodeToShow(showKey, s, e, mediaFile, pmFile.name, shows)
      }

      // Non-season subfolders
      for (const sub of subFolders) {
        if (parseSeasonFromFolderName(sub.name) === undefined) {
          await processSeasonFolder(sub, 1, showKey, shows)
        }
      }
    } else if (videoFiles.length > 0) {
      // Movie
      const parsed = parseFilename(item.name)
      const files = videoFiles.map((f) => makeMediaFile(f))
      attachSubtitles(files, subtitleItems)

      let title = parsed.title || cleanFolderTitle(item.name)
      let tmdbId: number | undefined

      const dashMatch = item.name.match(/^(\d+)\s+-\s+(.+)$/)
      if (dashMatch) {
        tmdbId = parseInt(dashMatch[1])
        title = dashMatch[2].trim() || title
      }

      movies.push({
        id: item.id,
        title,
        year: parsed.year,
        files,
        tmdbId,
        addedAt: item.created_at ? item.created_at * 1000 : undefined,
      })
      progress.moviesFound++
      tick()

      // Recurse into non-extras subfolders
      for (const sub of subFolders) {
        if (!EXTRAS_FOLDERS.has(sub.name.toLowerCase())) {
          await processFolder(sub, movies, shows, opts, progress, tick)
        }
      }
    } else if (videoFiles.length === 0 && subFolders.length > 0) {
      // Collection folder
      for (const sub of subFolders) {
        await processFolder(sub, movies, shows, opts, progress, tick)
      }
    }
  } catch {
    // Skip folders that fail
  }
}

async function processSeasonFolder(
  folder: PMItem,
  seasonNumber: number,
  showKey: string,
  shows: Map<string, TVShow>,
): Promise<void> {
  try {
    const data = await listFolder(folder.id)
    const items = data.content ?? []
    const videoFiles = items.filter(isVideo)
    const subFolders = items.filter((i) => i.type === 'folder')
    const subtitleItems = items.filter(isSubtitle)

    const show = shows.get(showKey)
    const existingEps = show?.seasons.find((s) => s.number === seasonNumber)?.episodes.length ?? 0
    let autoEp = existingEps + 1

    const seasonFiles: Array<{ mediaFile: MediaFile; pmFile: PMItem; episode: number }> = []
    for (const file of videoFiles) {
      const parsed = parseSeasonEpisode(file.name)
      const e = parsed.episode ?? autoEp++
      seasonFiles.push({ mediaFile: makeMediaFile(file, seasonNumber, e), pmFile: file, episode: e })
    }
    attachSubtitles(seasonFiles.map((f) => f.mediaFile), subtitleItems)
    for (const { mediaFile, pmFile, episode } of seasonFiles) {
      addEpisodeToShow(showKey, seasonNumber, episode, mediaFile, pmFile.name, shows)
    }

    for (const sub of subFolders) {
      await processSeasonFolder(sub, seasonNumber, showKey, shows)
    }
  } catch {
    // skip
  }
}

function addEpisodeToShow(
  showKey: string,
  season: number,
  episode: number,
  file: MediaFile,
  fileName: string,
  shows: Map<string, TVShow>,
): void {
  const show = shows.get(showKey)
  if (!show) return

  const ep: Episode = { id: file.id, number: episode, name: fileName, file }
  const sIdx = show.seasons.findIndex((s) => s.number === season)
  if (sIdx >= 0) {
    show.seasons[sIdx].episodes.push(ep)
  } else {
    const newSeason: Season = {
      id: `${showKey}_s${season}`,
      number: season,
      name: `Season ${season}`,
      episodes: [ep],
    }
    show.seasons.push(newSeason)
    show.seasons.sort((a, b) => a.number - b.number)
  }
}

// ─── Metadata fetching ────────────────────────────────────────────────────────

const CONCURRENCY = 4

async function fetchAllMetadata(
  movies: Movie[],
  shows: Map<string, TVShow>,
  progress: ScanProgress,
  tick: () => void,
): Promise<void> {
  const showList = Array.from(shows.values())

  // Process in batches
  for (let i = 0; i < movies.length; i += CONCURRENCY) {
    const batch = movies.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map((m) => fetchMovieMeta(m)))
    progress.metadataFetched += batch.length
    tick()
    await new Promise(r => setTimeout(r, 400)) // Throttle to avoid API rate limits
  }

  for (let i = 0; i < showList.length; i += CONCURRENCY) {
    const batch = showList.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map((s) => fetchShowMeta(s, shows)))
    progress.metadataFetched += batch.length
    tick()
    await new Promise(r => setTimeout(r, 400)) // Throttle to avoid API rate limits
  }
}

async function fetchMovieMeta(movie: Movie): Promise<void> {
  try {
    let detail = null
    if (isTMDB() && movie.tmdbId) {
      detail = await tmdbMovieDetail(movie.tmdbId)
    } else {
      detail = await searchMovieBest(movie.title, movie.year)
    }
    if (!detail) return

    movie.tmdbId = isTMDB() ? detail.id : undefined
    movie.imdbId = detail.imdb_id
    movie.tmdbDetail = detail

    const [videos, images] = await Promise.allSettled([
      getVideos(detail, 'movie'),
      getImages(detail, 'movie'),
    ])

    if (videos.status === 'fulfilled') movie.trailerKey = bestTrailerKey(videos.value)
    if (images.status === 'fulfilled') movie.logoPath = bestLogoPath(images.value.logos ?? [])
  } catch {
    // No metadata found
  }
}

async function fetchShowMeta(show: TVShow, shows: Map<string, TVShow>): Promise<void> {
  try {
    let detail = null
    if (isTMDB() && show.tmdbId) {
      detail = await tmdbTVDetail(show.tmdbId)
    } else {
      detail = await searchTVBest(show.title, show.year)
    }
    if (!detail) return

    show.tmdbId = isTMDB() ? detail.id : undefined
    show.imdbId = detail.imdb_id
    show.tmdbDetail = detail

    const [videos, images] = await Promise.allSettled([
      getVideos(detail, 'tv'),
      getImages(detail, 'tv'),
    ])

    if (videos.status === 'fulfilled') show.trailerKey = bestTrailerKey(videos.value)
    if (images.status === 'fulfilled') show.logoPath = bestLogoPath(images.value.logos ?? [])

    // Fetch season details
    if (detail.seasons) {
      for (const tmdbSeason of detail.seasons) {
        const sIdx = show.seasons.findIndex((s) => s.number === tmdbSeason.season_number)
        if (sIdx < 0) continue
        show.seasons[sIdx].tmdbSeason = tmdbSeason
        try {
          const sd = await metaSeasonDetail(detail, tmdbSeason.season_number)
          if (sd.episodes) {
            for (const ep of sd.episodes) {
              const eIdx = show.seasons[sIdx].episodes.findIndex((e) => e.number === ep.episode_number)
              if (eIdx >= 0) show.seasons[sIdx].episodes[eIdx].tmdbEpisode = ep
            }
          }
        } catch {
          // skip season detail
        }
      }
    }

    // Update the map
    shows.set(show.title.toLowerCase(), show)
  } catch {
    // No metadata found
  }
}
