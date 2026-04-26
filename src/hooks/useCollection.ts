import { useState, useEffect, useCallback } from 'react'
import {
  getFavoriteIds,
  getWatchlistIds,
  toggleFavorite as dbToggleFavorite,
  toggleWatchlist as dbToggleWatchlist,
} from '../db'

export function useCollection() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([getFavoriteIds(), getWatchlistIds()]).then(([fav, wl]) => {
      setFavoriteIds(fav)
      setWatchlistIds(wl)
    })
  }, [])

  const toggleFavorite = useCallback(async (id: string, type: 'movie' | 'show') => {
    try {
      await dbToggleFavorite(id, type)
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } catch (e) {
      console.error('toggleFavorite failed:', e)
    }
  }, [])

  const toggleWatchlist = useCallback(async (id: string, type: 'movie' | 'show') => {
    try {
      await dbToggleWatchlist(id, type)
      setWatchlistIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } catch (e) {
      console.error('toggleWatchlist failed:', e)
    }
  }, [])

  return {
    favoriteIds,
    watchlistIds,
    isFavorite: (id: string) => favoriteIds.has(id),
    isOnWatchlist: (id: string) => watchlistIds.has(id),
    toggleFavorite,
    toggleWatchlist,
  }
}
