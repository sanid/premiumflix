import { Movie, TVShow, PMItem } from '../types'
import { listFolder, itemDetails } from './premiumize'
import { processFolder, fetchMovieMeta, fetchShowMeta } from './scanner'

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
