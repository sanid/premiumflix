import { Movie, TVShow, Season, Episode, MediaFile, PMItem } from '../types'
import { listFolder, itemDetails } from './premiumize'
import { processFolder, fetchMovieMeta, fetchShowMeta } from './scanner'
import { db } from '../db'
import { isTMDB, searchTVBest } from '../services/metadata'
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

/**
 * Ingest a single TV episode transfer and merge it into an existing show,
 * or create a new stub show if one doesn't exist yet.
 * 
 * This is used when users add individual episode NZBs from SceneNZBs.
 */
export async function ingestEpisode(
  itemId: string,
  tmdbId: number,
  seasonNum?: number,
  episodeNum?: number,
): Promise<{ show: TVShow; isNew: boolean } | null> {
  try {
    // 1. Get the downloaded file details from Premiumize
    let mediaFile: MediaFile | null = null
    const item = await itemDetails(itemId)

    if (item.type === 'folder') {
      // Folder transfer — list contents and pick first video
      const folderData = await listFolder(itemId)
      const video = (folderData.content ?? []).find(f => {
        if (f.mime_type?.startsWith('video/')) return true
        const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
        return ['mkv', 'mp4', 'avi', 'm4v', 'mov', 'wmv', 'ts', 'webm'].includes(ext)
      })
      if (video) {
        mediaFile = {
          id: video.id,
          name: video.name,
          fileName: video.name,
          size: video.size ?? 0,
          mimeType: video.mime_type,
          streamLink: video.stream_link,
          directLink: video.link,
          duration: video.duration,
          resolution: (item.resx && item.resy) ? `${item.resx}x${item.resy}` : undefined,
          videoCodec: video.vcodec,
          audioCodec: video.acodec,
          premiumizeId: video.id,
          seasonNumber: seasonNum,
          episodeNumber: episodeNum,
        }
      }
    } else {
      // Single file transfer
      mediaFile = {
        id: item.id ?? itemId,
        name: item.name ?? 'Unknown',
        fileName: item.name ?? 'Unknown',
        size: item.size ?? 0,
        mimeType: item.mime_type,
        streamLink: item.stream_link,
        directLink: item.link,
        duration: item.duration,
        resolution: (item.resx && item.resy) ? `${item.resx}x${item.resy}` : undefined,
        videoCodec: item.vcodec,
        audioCodec: item.acodec,
        premiumizeId: item.id ?? itemId,
        seasonNumber: seasonNum,
        episodeNumber: episodeNum,
      }
    }

    if (!mediaFile) {
      console.error('ingestEpisode: no video file found for', itemId)
      return null
    }

    const sn = seasonNum ?? 1
    const en = episodeNum ?? 1

    // 2. Look for an existing show in the library with this tmdbId
    const existingShows = await db.tvShows.toArray()
    let show = existingShows.find(s => s.tmdbId === tmdbId)
    let isNew = false

    if (!show) {
      // 3. Create a new stub show with TMDB metadata
      const detail = await tmdbTVDetail(tmdbId)
      const showTitle = detail?.name ?? detail?.title ?? 'Unknown Show'
      const showYear = detail?.first_air_date?.slice(0, 4)

      show = {
        id: `tmdb-${tmdbId}`,
        title: showTitle,
        year: showYear,
        seasons: [],
        tmdbId,
        tmdbDetail: detail,
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
      } catch {}
    }

    // 6. Save to DB
    if (isNew) {
      await db.tvShows.add(show)
    } else {
      await db.tvShows.update(show.id, { seasons: show.seasons })
    }

    return { show, isNew }
  } catch (e) {
    console.error('ingestEpisode failed', e)
    return null
  }
}
