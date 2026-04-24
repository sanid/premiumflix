import type {
  PMFolderListResponse,
  PMItemDetailResponse,
  PMAccountInfoResponse,
  PMTransferListResponse,
} from '../types'

function getApiKey(): string {
  return localStorage.getItem('pm_api_key') || import.meta.env.VITE_PM_API_KEY || ''
}

// In dev, use the Vite proxy to avoid CORS issues.
// In production, requests go directly (Premiumize supports CORS for API key auth).
function baseUrl(): string {
  return import.meta.env.DEV ? '/pmapi' : 'https://www.premiumize.me/api'
}

async function pmFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${baseUrl()}/${path}`, window.location.href)
  url.searchParams.set('apikey', getApiKey())
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Premiumize API ${path}: HTTP ${res.status}`)
  const data = await res.json()
  if (data.status === 'error') throw new Error(data.message ?? 'Premiumize API error')
  return data as T
}

export async function listFolder(id?: string): Promise<PMFolderListResponse> {
  const params: Record<string, string> = { includebreadcrumbs: 'true' }
  if (id) params.id = id
  return pmFetch<PMFolderListResponse>('folder/list', params)
}

export async function itemDetails(id: string): Promise<PMItemDetailResponse> {
  return pmFetch<PMItemDetailResponse>('item/details', { id })
}

export async function accountInfo(): Promise<PMAccountInfoResponse> {
  return pmFetch<PMAccountInfoResponse>('account/info')
}

export async function listTransfers(): Promise<PMTransferListResponse> {
  return pmFetch<PMTransferListResponse>('transfer/list')
}

export async function deleteItem(id: string): Promise<{ status: string }> {
  const url = new URL(`${baseUrl()}/item/delete`, window.location.href)
  url.searchParams.set('apikey', getApiKey())
  const body = new URLSearchParams({ id })
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function deleteFolder(id: string): Promise<{ status: string }> {
  const url = new URL(`${baseUrl()}/folder/delete`, window.location.href)
  url.searchParams.set('apikey', getApiKey())
  const body = new URLSearchParams({ id })
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function createTransfer(src: string, folderId?: string): Promise<{ status: string; id: string; name?: string }> {
  const url = new URL(`${baseUrl()}/transfer/create`, window.location.href)
  url.searchParams.set('apikey', getApiKey())

  const body = new URLSearchParams({ src })
  if (folderId) body.set('folder_id', folderId)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function createFolder(name: string, parentId?: string): Promise<{ status: string; id: string }> {
  const url = new URL(`${baseUrl()}/folder/create`, window.location.href)
  url.searchParams.set('apikey', getApiKey())

  const body = new URLSearchParams({ name })
  if (parentId) body.set('parent_id', parentId)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getOrCreateMoviesFolder(): Promise<string | undefined> {
  try {
    const raw = localStorage.getItem('scan_folders')
    if (raw) {
      const folders = JSON.parse(raw)
      const movieFolder = folders.find((f: any) => f.kind === 'movies')
      if (movieFolder) {
        return movieFolder.id
      }
    }
  } catch (e) {
    console.error('Failed to parse scan_folders', e)
  }

  const MOVIE_NAMES = new Set(['Movies', 'Movie', 'Filme', 'Film', 'Films', 'Películas'])
  try {
    const root = await listFolder()
    const moviesFolder = root.content?.find(item => item.type === 'folder' && MOVIE_NAMES.has(item.name))
    if (moviesFolder) {
      return moviesFolder.id
    }
    const created = await createFolder('Movies')
    return created.id
  } catch (e) {
    console.error('Failed to get or create Movies folder', e)
    return undefined
  }
}

export async function getOrCreateShowsFolder(): Promise<string | undefined> {
  try {
    const raw = localStorage.getItem('scan_folders')
    if (raw) {
      const folders = JSON.parse(raw)
      const showFolder = folders.find((f: any) => f.kind === 'tvShows')
      if (showFolder) {
        return showFolder.id
      }
    }
  } catch (e) {
    console.error('Failed to parse scan_folders', e)
  }

  const SHOW_NAMES = new Set(['Series', 'TV Shows', 'TV', 'Shows', 'Serien', 'Serie', 'Serier', 'TV Series'])
  try {
    const root = await listFolder()
    const showsFolder = root.content?.find(item => item.type === 'folder' && SHOW_NAMES.has(item.name))
    if (showsFolder) {
      return showsFolder.id
    }
    const created = await createFolder('Series')
    return created.id
  } catch (e) {
    console.error('Failed to get or create Shows folder', e)
    return undefined
  }
}

export async function fetchItemDetailsWithTranscode(
  id: string,
  maxRetries = 10,
): Promise<PMItemDetailResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const details = await itemDetails(id)

    if (details.stream_link) return details

    // Natively supported format — use direct link
    if (details.link) {
      const ext = details.link.toLowerCase()
      if (['.mp4', '.m4v', '.mov', '.ts', '.m3u8'].some((e) => ext.includes(e))) {
        return details
      }
    }

    const status = (details.transcode_status ?? '').toLowerCase()
    if (status === 'finished' && details.stream_link) return details
    if (status === 'error' || status === 'failed') return details

    // Pending/queued/empty → wait and retry
    if (attempt < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
  return itemDetails(id)
}

export async function getUploadInfo(folderId?: string): Promise<{ status: string; url: string; token: string }> {
  const params: Record<string, string> = {}
  if (folderId) params.id = folderId
  return pmFetch<{ status: string; url: string; token: string }>('folder/uploadinfo', params)
}

/**
 * Returns a direct download link for an item.
 */
export async function getDirectLink(itemId: string): Promise<string> {
  const details = await itemDetails(itemId)
  if (!details.link) throw new Error('No download link available for this item')
  return details.link
}
