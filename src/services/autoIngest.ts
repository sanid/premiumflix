import { Movie, TVShow, Season, Episode, MediaFile, PMItem } from '../types'
import { listFolder, itemDetails } from './premiumize'
import { processFolder, fetchMovieMeta, fetchShowMeta } from './scanner'
import { db } from '../db'
import { isTMDB, searchTVBest } from '../services/metadata'
import { debugLog } from '../lib/debug'
import { tvDetail as tmdbTVDetail, bestLogoPath, bestTrailerKey } from './tmdb'
import { getVideos, getImages, getSeasonDetail as metaSeasonDetail } from '../services/metadata'

export interface IngestResult {
  movies: Movie[]
  shows: TVShow[]
}

export async function ingestItem(itemId: string, typeHint?: 'movie' | 'show'): Promise<IngestResult> {
  const movies: Movie[] = []
  const showsMap = new Map<string, TVShow>()
  
  try {
    const item = await itemDetails(itemId)
    
    await processFolder(
      item as PMItem,
      movies,
      showsMap,
      { forceMovie: typeHint === 'movie', forceTV: typeHint === 'show' },
      { status: '', moviesFound: 0, showsFound: 0, metadataFetched: 0, metadataTotal: 0 },
      () => {}
    )
    
    // Fetch metadata
    for (const movie of movies) {
      await fetchMovieMeta(movie)
    }
    const shows = Array.from(showsMap.values())
    for (const show of shows) {
      await fetchShowMeta(show, showsMap)
    }
    
    return { movies, shows }
  } catch (e) {
    console.error('Auto-ingest failed', e)
    return { movies: [], shows: [] }
  }
}

const VIDEO_EXTS = ['mkv', 'mp4', 'avi', 'm4v', 'mov', 'wmv', 'ts', 'flv', 'webm', 'mpg', 'mpeg']

function isVideoFile(name: string, mime?: string | null): boolean {
  if (mime?.startsWith('video/')) return true
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTS.includes(ext)
}

/**
 * Find a video file in a Premiumize item, retrying if the folder is empty
 * (Premiumize may need a moment to populate the folder after download).
 */
async function findVideoFile(itemId: string, retries = 5): Promise<{ file: MediaFile; pmItem: PMItem } | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const item = await itemDetails(itemId)
      const itemType = (item.type ?? '').toLowerCase()

      // If it's a file (not a folder), check if it's a video directly
      if (itemType !== 'folder' && item.name && isVideoFile(item.name, item.mime_type)) {
        return {
          pmItem: item as PMItem,
          file: {
            id: item.id ?? itemId,
            name: item.name,
            fileName: item.name,
            size: item.size ?? 0,
            mimeType: item.mime_type,
            streamLink: item.stream_link,
            directLink: item.link,
            duration: item.duration,
            resolution: (item.resx && item.resy) ? `${item.resx}x${item.resy}` : undefined,
            videoCodec: item.vcodec,
            audioCodec: item.acodec,
            premiumizeId: item.id ?? itemId,
          },
        }
      }

      // It's a folder — list contents
      const folderData = await listFolder(itemId)
      const contents = folderData.content ?? []

      if (contents.length === 0) {
        // Folder not populated yet — wait and retry
        if (attempt < retries - 1) {
          debugLog(`ingestEpisode: folder empty, retrying (${attempt + 1}/${retries})...`)
          await new Promise(r => setTimeout(r, 3000))
          continue
        }
        return null
      }

      const video = contents.find(f => isVideoFile(f.name, f.mime_type))
      if (video) {
        return {
          pmItem: video,
          file: {
            id: video.id,
            name: video.name,
            fileName: video.name,
            size: video.size ?? 0,
            mimeType: video.mime_type,
            streamLink: video.stream_link,
            directLink: video.link,
            duration: video.duration,
            resolution: (video.resx && video.resy) ? `${video.resx}x${video.resy}` : undefined,
            videoCodec: video.vcodec,
            audioCodec: video.acodec,
            premiumizeId: video.id,
          },
        }
      }

      // No video found — check subfolders (single level)
      for (const sub of contents.filter(c => c.type === 'folder')) {
        const subData = await listFolder(sub.id)
        const subVideo = (subData.content ?? []).find(f => isVideoFile(f.name, f.mime_type))
        if (subVideo) {
          return {
            pmItem: subVideo,
            file: {
              id: subVideo.id,
              name: subVideo.name,
              fileName: subVideo.name,
              size: subVideo.size ?? 0,
              mimeType: subVideo.mime_type,
              streamLink: subVideo.stream_link,
              directLink: subVideo.link,
              duration: subVideo.duration,
              resolution: (subVideo.resx && subVideo.resy) ? `${subVideo.resx}x${subVideo.resy}` : undefined,
              videoCodec: subVideo.vcodec,
              audioCodec: subVideo.acodec,
              premiumizeId: subVideo.id,
            },
          }
        }
      }

      // No video at all
      return null
    } catch (e) {
      console.warn(`ingestEpisode: attempt ${attempt + 1} failed`, e)
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 3000))
      }
    }
  }
  return null
}

/**
 * Ingest a single TV episode transfer and merge it into an existing show,
 * or create a new stub show if one doesn't exist yet.
 */
export async function ingestEpisode(
  itemId: string,
  tmdbId: number,
  seasonNum?: number,
  episodeNum?: number,
): Promise<{ show: TVShow; isNew: boolean } | null> {
  debugLog('ingestEpisode called:', { itemId, tmdbId, seasonNum, episodeNum })

  try {
    // 1. Find the video file (with retries for empty folders)
    const result = await findVideoFile(itemId)
    if (!result) {
      console.error('ingestEpisode: no video file found for', itemId)
      return null
    }

    const mediaFile = result.file
    const sn = seasonNum ?? 1
    const en = episodeNum ?? 1
    mediaFile.seasonNumber = sn
    mediaFile.episodeNumber = en

    debugLog('ingestEpisode: found video', mediaFile.fileName, `S${sn}E${en}`)

    // 2. Look for an existing show in the library with this tmdbId
    const existingShows = await db.tvShows.toArray()
    let show = existingShows.find(s => s.tmdbId === tmdbId)
    let isNew = false

    if (!show) {
      debugLog('ingestEpisode: no existing show for tmdbId', tmdbId, '- creating new')
      // 3. Create a new stub show with TMDB metadata
      let detail = null
      try {
        detail = await tmdbTVDetail(tmdbId)
      } catch (e) {
        console.error('ingestEpisode: failed to fetch TMDB detail', e)
      }

      const showTitle = detail?.name ?? detail?.title ?? 'Unknown Show'
      const showYear = detail?.first_air_date?.slice(0, 4)

      show = {
        id: `tmdb-${tmdbId}`,
        title: showTitle,
        year: showYear,
        seasons: [],
        tmdbId,
        tmdbDetail: detail ?? undefined,
      }

      // Fetch logo + trailer
      if (detail) {
        try {
          const [videosRes, imagesRes] = await Promise.allSettled([
            getVideos(detail, 'tv'),
            getImages(detail, 'tv'),
          ])
          if (videosRes.status === 'fulfilled') show.trailerKey = bestTrailerKey(videosRes.value)
          if (imagesRes.status === 'fulfilled') show.logoPath = bestLogoPath(imagesRes.value.logos ?? [])
        } catch {}
      }

      isNew = true
    } else {
      debugLog('ingestEpisode: found existing show', show.title, 'with', show.seasons.length, 'seasons')
    }

    // 4. Add the episode to the correct season
    const episode: Episode = {
      id: mediaFile.id,
      number: en,
      name: mediaFile.fileName,
      file: mediaFile,
    }

    const seasonIdx = show.seasons.findIndex(s => s.number === sn)
    if (seasonIdx >= 0) {
      // Check if episode already exists (avoid duplicates)
      const existingEp = show.seasons[seasonIdx].episodes.find(e => e.number === en)
      if (!existingEp) {
        show.seasons[seasonIdx].episodes.push(episode)
        show.seasons[seasonIdx].episodes.sort((a, b) => a.number - b.number)
        debugLog(`ingestEpisode: added S${sn}E${en} to existing season (${show.seasons[seasonIdx].episodes.length} eps)`)
      } else {
        debugLog(`ingestEpisode: S${sn}E${en} already exists, skipping`)
      }
    } else {
      // Create new season
      const season: Season = {
        id: `tmdb-${tmdbId}-s${sn}`,
        number: sn,
        name: `Season ${sn}`,
        episodes: [episode],
      }
      show.seasons.push(season)
      show.seasons.sort((a, b) => a.number - b.number)
      debugLog(`ingestEpisode: created Season ${sn} with E${en}`)
    }

    // 5. Try to fetch TMDB episode metadata
    if (show.tmdbDetail) {
      try {
        const sd = await metaSeasonDetail(show.tmdbDetail, sn)
        if (sd.episodes) {
          const seasonInShow = show.seasons.find(s => s.number === sn)
          if (seasonInShow) {
            if (!seasonInShow.tmdbSeason) {
              const tmdbSeason = show.tmdbDetail.seasons?.find(ts => ts.season_number === sn)
              if (tmdbSeason) seasonInShow.tmdbSeason = tmdbSeason
            }
            for (const ep of seasonInShow.episodes) {
              if (!ep.tmdbEpisode) {
                const tmdbEp = sd.episodes.find(te => te.episode_number === ep.number)
                if (tmdbEp) ep.tmdbEpisode = tmdbEp
              }
            }
          }
        }
      } catch (e) {
        console.warn('ingestEpisode: failed to fetch season detail', e)
      }
    }

    // 6. Save to DB
    if (isNew) {
      await db.tvShows.add(show)
      debugLog('ingestEpisode: saved new show to DB')
    } else {
      await db.tvShows.update(show.id, show)
      debugLog('ingestEpisode: updated show in DB')
    }

    return { show, isNew }
  } catch (e) {
    console.error('ingestEpisode failed', e)
    return null
  }
}
