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
}

// Route through server-side proxy — key is never exposed to the browser.
// Dev: Vite proxy at /scenenzbsapi → scenenzbs.com
// Prod: Vercel serverless function at /api/scenenzbs
const API_URL = import.meta.env.DEV
  ? '/scenenzbsapi/api'
  : '/api/scenenzbs'

function getApiKey(): string {
  // Only used in dev with the Vite proxy (key sent directly to scenenzbs.com).
  // In production the Vercel function adds the key server-side.
  const key = import.meta.env.VITE_SCENENZBS_API_KEY || ''
  if (import.meta.env.DEV && !key) {
    console.warn('SceneNZBs: VITE_SCENENZBS_API_KEY not set in .env')
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

export async function searchSceneNzbs(params: Record<string, string>): Promise<SceneNzbItem[]> {
  const url = new URL(API_URL, window.location.href)
  // In dev (Vite proxy) we still need to send the key directly.
  // In prod the Vercel function injects it server-side.
  if (import.meta.env.DEV) {
    url.searchParams.set('apikey', getApiKey())
  }
  url.searchParams.set('o', 'json')

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`SceneNZBs HTTP ${res.status}`)

  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('json') && !ct.includes('xml')) {
    const text = await res.text()
    throw new Error(`SceneNZBs returned non-JSON response (HTML page). Check your API key.`)
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

  return searchSceneNzbs(params)
}
