import { appFetch, isTauri } from '../lib/platform'
export interface SceneNzbItem {
  title: string
  guid: string
  link: string
  pubDate: string
  category: string
  description: string
  size: number
  language?: string
  subs?: string
  season?: number
  episode?: number
  resolution?: string
  codec?: string
  /** A whole-season (or multi-season) pack rather than a single episode. */
  isSeasonPack: boolean
  /** Seasons the pack covers, for `S01-S03` style multi-season releases. */
  seasons?: number[]
}

// Where the indexer lives depends on how the app is running:
//   dev      → Vite proxy at /scenenzbsapi → treasure-maps.com
//   web      → Vercel serverless function, which adds the key server-side
//   desktop  → straight to the indexer over Tauri's Rust HTTP client, since the
//              indexer sends no CORS headers and there is no function to proxy through
const UPSTREAM = 'https://treasure-maps.com/api'

function apiUrl(): string {
  if (isTauri()) return UPSTREAM
  return import.meta.env.DEV ? '/scenenzbsapi/api' : '/api/scenenzbs'
}

/** True when this build must supply the API key itself rather than a proxy doing it. */
function needsClientKey(): boolean {
  return isTauri() || import.meta.env.DEV
}

function getApiKey(): string {
  const key = localStorage.getItem('scenenzbs_api_key') || import.meta.env.VITE_SCENENZBS_API_KEY || ''
  if (needsClientKey() && !key) {
    console.warn('SceneNZBs: no API key — set one in Settings or VITE_SCENENZBS_API_KEY')
  }
  return key
}

function parseTitleInfo(title: string) {
  const t = title.toLowerCase()
  let resolution = ''
  if (t.includes('2160p') || t.includes('4k')) resolution = '2160p'
  else if (t.includes('1080p')) resolution = '1080p'
  else if (t.includes('720p')) resolution = '720p'
  else if (t.includes('480p')) resolution = '480p'

  let codec = ''
  if (t.includes('x265') || t.includes('hevc')) codec = 'x265'
  else if (t.includes('x264') || t.includes('h264')) codec = 'x264'

  return { resolution, codec }
}

/**
 * Decide whether a release is a whole-season pack.
 *
 * The indexer is authoritative: it reports a `season` attribute but omits
 * `episode` for packs. Titles are only consulted to recover the season
 * numbers, and as a guard for indexers that omit the attribute entirely —
 * matching season numbers in a release name is unreliable on its own
 * ("DS4K" and "x265" both look like season markers without an anchor).
 */
function detectSeasonPack(title: string, episodeAttr?: number): { isSeasonPack: boolean; seasons?: number[] } {
  // Anchor season markers to a token boundary, or DS4K reads as "season 4".
  const BOUND = '(?:^|[\\s._\\-\\[(])'
  const hasEpisodeMarker = new RegExp(`${BOUND}[Ss]\\d{1,2}[\\s._-]?[Ee]\\d{1,3}`).test(title)
  const episodeRange = /[Ee]\d{1,3}[\s._-]*-[\s._-]*[Ee]?\d{1,3}/.test(title)

  // A single-episode marker settles it, unless it opens an E01-E16 style range.
  if (episodeAttr != null || (hasEpisodeMarker && !episodeRange)) {
    return { isSeasonPack: false }
  }

  // S01-S03 / Season 1 to 3 — a multi-season pack.
  const range = title.match(new RegExp(`${BOUND}[Ss](\\d{1,2})[\\s._-]*(?:-|to|thru)[\\s._-]*[Ss](\\d{1,2})`))
  if (range) {
    const [from, to] = [parseInt(range[1], 10), parseInt(range[2], 10)].sort((a, b) => a - b)
    const seasons: number[] = []
    for (let n = from; n <= to && n - from < 50; n++) seasons.push(n)
    return { isSeasonPack: true, seasons }
  }

  // Pack already established, so just read the number off the season marker.
  const single = title.match(new RegExp(`${BOUND}(?:[Ss]eason|[Ss]taffel|[Ss]eizoen|[Ss])[\\s._-]?(\\d{1,2})\\b`))
  return { isSeasonPack: true, seasons: single ? [parseInt(single[1], 10)] : undefined }
}

/** The indexer caps a single response at 500 items. */
export const NZB_MAX_LIMIT = 500

export async function searchSceneNzbs(params: Record<string, string>): Promise<SceneNzbItem[]> {
  const url = new URL(apiUrl(), window.location.href)
  // Dev and desktop send the key themselves; the web build lets the proxy add it.
  if (needsClientKey()) {
    url.searchParams.set('apikey', getApiKey())
  }
  url.searchParams.set('o', 'json')

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await appFetch(url.toString())
  const ct = res.headers.get('content-type') || ''

  if (!res.ok) {
    // The proxy reports upstream trouble as JSON; prefer its message over the status code.
    if (ct.includes('json')) {
      const detail = await res.json().catch(() => null)
      if (detail?.error) throw new Error(detail.error)
    }
    throw new Error(`SceneNZBs HTTP ${res.status}`)
  }

  if (!ct.includes('json') && !ct.includes('xml')) {
    throw new Error('SceneNZBs returned an HTML page instead of API data. Check your API key.')
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error.description || 'SceneNZB error')

  let items = data?.channel?.item || []
  if (!Array.isArray(items)) {
    items = [items]
  }

  return items.map((item: any) => {
    const attrs = item.attr || []
    let size = 0
    let language = ''
    let subs = ''
    let season = undefined
    let episode = undefined

    const attrArray = Array.isArray(attrs) ? attrs : [attrs]
    attrArray.forEach((a: any) => {
      const name = a['@attributes']?.name
      const value = a['@attributes']?.value
      if (name === 'size') size = parseInt(value, 10)
      if (name === 'language') language = value
      if (name === 'subs') subs = value
      if (name === 'season') season = parseInt(value, 10)
      if (name === 'episode') episode = parseInt(value, 10)
    })

    const { resolution, codec } = parseTitleInfo(item.title)

    // Fallback: parse season/episode from title if API didn't provide them
    if (season == null || episode == null) {
      const seMatch = item.title.match(/[Ss](\d{1,2})[Ee](\d{1,3})/)
      if (seMatch) {
        if (season == null) season = parseInt(seMatch[1], 10)
        if (episode == null) episode = parseInt(seMatch[2], 10)
      }
    }

    // Only TV results can be packs; movie titles would trip the season regexes.
    const pack = params.t === 'tvsearch'
      ? detectSeasonPack(item.title, episode)
      : { isSeasonPack: false, seasons: undefined }
    if (pack.isSeasonPack && season == null && pack.seasons?.length) {
      season = pack.seasons[0]
    }

    return {
      title: item.title,
      guid: item.guid,
      link: item.link || item.enclosure?.['@attributes']?.url,
      pubDate: item.pubDate,
      category: item.category,
      description: item.description,
      size,
      language,
      subs,
      season,
      episode,
      resolution,
      codec,
      isSeasonPack: pack.isSeasonPack,
      seasons: pack.seasons,
    }
  })
}

export async function searchMovieNzb(queryOrId: string | number): Promise<SceneNzbItem[]> {
  const params: Record<string, string> = { t: 'movie' }
  if (typeof queryOrId === 'number' || /^\d+$/.test(queryOrId.toString())) {
    params.tmdbid = queryOrId.toString()
  } else if (queryOrId) {
    params.q = queryOrId.toString()
  }
  return searchSceneNzbs(params)
}

export async function searchShowNzb(queryOrId: string | number, season?: number, episode?: number): Promise<SceneNzbItem[]> {
  const params: Record<string, string> = { t: 'tvsearch' }

  if (typeof queryOrId === 'number' || /^\d+$/.test(queryOrId.toString())) {
    params.tmdbid = queryOrId.toString()
  } else if (queryOrId) {
    params.q = queryOrId.toString()
  }

  if (season !== undefined) params.season = season.toString()
  if (episode !== undefined) params.episode = episode.toString()

  // Season packs are a small minority of a show's releases — roughly 2% — so
  // the default page of 250 is mostly single episodes and can miss packs
  // entirely. Ask for the indexer's maximum when browsing a whole show.
  if (episode === undefined) params.limit = NZB_MAX_LIMIT.toString()

  return searchSceneNzbs(params)
}
