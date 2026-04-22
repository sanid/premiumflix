/**
 * Incremental movie ingest:
 * After a Premiumize transfer is created, poll until it finishes,
 * then fetch metadata for just that one movie and append it to the local DB
 * without triggering a full library rescan.
 */

import { listTransfers, listFolder } from './premiumize'
import { bestLogoPath, bestTrailerKey } from './tmdb'
import { isTMDB, searchMovieBest, getVideos, getImages } from './metadata'
import { appendMovie } from '../db'
import type { Movie, MediaFile, PMItem } from '../types'

const VIDEO_EXTS = ['mkv', 'mp4', 'avi', 'm4v', 'mov', 'wmv', 'ts', 'flv', 'webm', 'mpg', 'mpeg']

function isVideo(item: PMItem): boolean {
  if (item.mime_type?.startsWith('video/')) return true
  const ext = item.name.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTS.includes(ext)
}

function makeMediaFile(item: PMItem): MediaFile {
  return {
    id: item.id,
    name: item.name,
    fileName: item.name,
    size: item.size ?? 0,
    mimeType: item.mime_type,
    streamLink: item.stream_link,
    directLink: item.link,
    duration: item.duration,
    premiumizeId: item.id,
  }
}

/**
 * Poll transfer list until the transfer with the given ID completes.
 * Returns the resulting file_id or folder_id.
 */
async function waitForTransfer(
  transferId: string,
  onStatus?: (msg: string) => void,
  maxMinutes = 30,
): Promise<{ fileId?: string; folderId?: string } | null> {
  const maxAttempts = maxMinutes * 6 // poll every 10s
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10_000))
    try {
      const { transfers } = await listTransfers()
      const transfer = transfers?.find(t => t.id === transferId)
      if (!transfer) return null

      const status = transfer.status?.toLowerCase() ?? ''
      onStatus?.(`Downloading... ${transfer.name ?? ''}`)

      if (status === 'success' || status === 'finished' || status === 'seeding') {
        return { fileId: transfer.file_id, folderId: transfer.folder_id }
      }
      if (status === 'error' || status === 'failed') {
        throw new Error('Transfer failed on Premiumize')
      }
    } catch (e) {
      console.warn('Poll error', e)
    }
  }
  return null
}

/**
 * Collect all video files from a Premiumize folder (non-recursive top level).
 */
async function collectVideoFiles(folderId: string): Promise<MediaFile[]> {
  try {
    const data = await listFolder(folderId)
    const items = data.content ?? []
    return items.filter(isVideo).map(makeMediaFile)
  } catch {
    return []
  }
}

/**
 * Full incremental ingest pipeline:
 * 1. Poll until transfer done
 * 2. Get files from Premiumize
 * 3. Fetch TMDB metadata for just this movie
 * 4. Write to IndexedDB
 */
export async function ingestNewMovie(
  transferId: string,
  movieTitle: string,
  movieYear: number,
  premiumizeFolderId: string | undefined,
  onStatus: (msg: string) => void,
  onDone: (movie: Movie) => void,
  onError: (err: string) => void,
): Promise<void> {
  try {
    onStatus('Waiting for Premiumize to process...')

    const result = await waitForTransfer(transferId, onStatus)
    if (!result) {
      onError('Transfer timed out or not found')
      return
    }

    onStatus('Fetching file info...')
    let files: MediaFile[] = []

    if (result.folderId) {
      files = await collectVideoFiles(result.folderId)
    } else if (result.fileId) {
      // Single file transfer — construct minimal MediaFile from transfer data
      try {
        const folderData = await listFolder(premiumizeFolderId)
        const item = folderData.content?.find(i => i.id === result.fileId)
        if (item) files = [makeMediaFile(item)]
      } catch {
        // Fallback: create a stub file entry
        files = [{
          id: result.fileId,
          name: movieTitle,
          fileName: movieTitle,
          size: 0,
          premiumizeId: result.fileId,
        }]
      }
    }

    if (files.length === 0) {
      onError('Could not find video files for this transfer')
      return
    }

    onStatus('Fetching movie metadata...')

    const movie: Movie = {
      id: result.folderId ?? result.fileId ?? transferId,
      title: movieTitle,
      year: String(movieYear),
      files,
      addedAt: Date.now(),
    }

    try {
      const detail = await searchMovieBest(movieTitle, String(movieYear))
      if (detail) {
        movie.tmdbId = isTMDB() ? detail.id : undefined
        movie.imdbId = detail.imdb_id
        movie.tmdbDetail = detail

        const [videos, images] = await Promise.allSettled([
          getVideos(detail, 'movie'),
          getImages(detail, 'movie'),
        ])

        if (videos.status === 'fulfilled') movie.trailerKey = bestTrailerKey(videos.value)
        if (images.status === 'fulfilled') movie.logoPath = bestLogoPath(images.value.logos ?? [])
      }
    } catch (e) {
      console.warn('TMDB metadata fetch failed', e)
    }

    await appendMovie(movie)
    onDone(movie)
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Ingest failed')
  }
}
