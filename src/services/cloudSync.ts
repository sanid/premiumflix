import { Movie, TVShow } from '../types'
import { listFolder, deleteItem, getUploadInfo, getDirectLink } from './premiumize'
import { debugLog } from '../lib/debug'

const LIBRARY_FILENAME = 'premiumflix_library.json'

export interface CloudLibrary {
  movies: Movie[]
  tvShows: TVShow[]
  updatedAt: number
  version: number
}

/**
 * Uploads the library metadata to Premiumize cloud.
 */
export async function syncLibraryToCloud(movies: Movie[], tvShows: TVShow[]): Promise<void> {
  try {
    // 1. Check if file already exists in root and delete it
    const root = await listFolder()
    const existing = root.content?.find(i => i.name === LIBRARY_FILENAME)
    if (existing) {
      await deleteItem(existing.id)
    }

    // 2. Get upload slot
    const uploadInfo = await getUploadInfo() // root folder
    
    // 3. Prepare content
    const library: CloudLibrary = {
      movies,
      tvShows,
      updatedAt: Date.now(),
      version: 1
    }
    const content = JSON.stringify(library)
    const blob = new Blob([content], { type: 'application/json' })

    // 4. Upload
    const formData = new FormData()
    formData.append('token', uploadInfo.token)
    formData.append('file', blob, LIBRARY_FILENAME)

    const res = await fetch(uploadInfo.url, {
      method: 'POST',
      body: formData
    })

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    const data = await res.json()
    if (data.status === 'error') throw new Error(data.message || 'Upload error')
    
    debugLog('Library synced to cloud successfully')
  } catch (e) {
    console.error('Failed to sync library to cloud', e)
    throw e
  }
}

/**
 * Loads the library metadata from Premiumize cloud.
 */
export async function loadLibraryFromCloud(): Promise<CloudLibrary | null> {
  try {
    const root = await listFolder()
    const file = root.content?.find(i => i.name === LIBRARY_FILENAME)
    if (!file) return null

    const link = await getDirectLink(file.id)
    const res = await fetch(link)
    if (!res.ok) throw new Error(`Download failed: ${res.status}`)
    
    return await res.json() as CloudLibrary
  } catch (e) {
    console.error('Failed to load library from cloud', e)
    return null
  }
}
