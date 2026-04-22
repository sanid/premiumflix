export interface YTSTorrent {
  url: string
  hash: string
  quality: string
  type: string
  seeds: number
  peers: number
  size: string
  size_bytes: number
  date_uploaded: string
}

export interface YTSMovie {
  id: number
  title: string
  year: number
  rating: number
  genres: string[]
  imdb_code: string
  large_cover_image: string
  torrents?: YTSTorrent[]
}

export interface YTSListResponse {
  data: {
    movie_count: number
    limit: number
    page_number: number
    movies?: YTSMovie[]
  }
}

const BASE_URL = 'https://movies-api.accel.li/api/v2'

export async function searchYTS(query: string, page = 1): Promise<YTSListResponse['data']> {
  const url = new URL(`${BASE_URL}/list_movies.json`)
  if (query) {
    url.searchParams.set('query_term', query)
  }
  url.searchParams.set('page', page.toString())
  url.searchParams.set('sort_by', 'download_count')
  
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('YTS API error')
  const json = await res.json()
  return json.data
}

export async function getMovieTorrents(id: number): Promise<YTSMovie> {
  const url = new URL(`${BASE_URL}/movie_details.json`)
  url.searchParams.set('movie_id', id.toString())
  
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('YTS API error')
  const json = await res.json()
  return json.data.movie
}

export function generateMagnet(hash: string, title: string): string {
  const trackers = [
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.coppersurfer.tk:6969',
    'udp://glotorrents.pw:6969/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://torrent.gresille.org:80/announce',
    'udp://p4p.arenabg.com:1337',
    'udp://tracker.leechers-paradise.org:6969'
  ]
  const trParams = trackers.map(t => `tr=${encodeURIComponent(t)}`).join('&')
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}&${trParams}`
}
